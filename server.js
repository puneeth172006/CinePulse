
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// MySQL connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

// OMDb configuration
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_URL = "https://www.omdbapi.com/";

// Fetch movie information from OMDb
async function getOmdbMovie(params) {
    if (!OMDB_API_KEY) {
        throw new Error("OMDb API key is missing in .env");
    }

    const query = new URLSearchParams({
        apikey: OMDB_API_KEY,
        ...params
    });

    const response = await fetch(`${OMDB_URL}?${query}`);
    const data = await response.json();

    if (!response.ok || data.Response === "False") {
        throw new Error(data.Error || "OMDb request failed");
    }

    return data;
}

// Convert OMDb release date into MySQL date format
function convertReleaseDate(released) {
    if (!released || released === "N/A") {
        return null;
    }

    const match = released.match(/^(\d{2}) ([A-Za-z]{3}) (\d{4})$/);

    if (!match) {
        return null;
    }

    const months = {
        Jan: "01",
        Feb: "02",
        Mar: "03",
        Apr: "04",
        May: "05",
        Jun: "06",
        Jul: "07",
        Aug: "08",
        Sep: "09",
        Oct: "10",
        Nov: "11",
        Dec: "12"
    };

    const [, day, month, year] = match;

    if (!months[month]) {
        return null;
    }

    return `${year}-${months[month]}-${day}`;
}

// Home route
app.get("/", (req, res) => {
    res.send("Welcome to CinePulse Backend!");
});

// Get all movies with their genres
app.get("/api/movies", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                m.movie_id,
                m.title,
                m.overview,
                m.release_date,
                m.language,
                m.poster_path,
                GROUP_CONCAT(
                    DISTINCT g.genre_name
                    ORDER BY g.genre_name
                    SEPARATOR ', '
                ) AS genres
            FROM movies m
            LEFT JOIN movie_genres mg
                ON m.movie_id = mg.movie_id
            LEFT JOIN genres g
                ON mg.genre_id = g.genre_id
            GROUP BY
                m.movie_id,
                m.title,
                m.overview,
                m.release_date,
                m.language,
                m.poster_path
        `);

        res.json({
            message: "Movies fetched successfully!",
            movies: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch movies"
        });
    }
});

// Get movie details by ID
app.get("/api/movies/:id", async (req, res) => {
    try {
        const movieId = req.params.id;

        const [rows] = await db.query(
            "SELECT * FROM movies WHERE movie_id = ?",
            [movieId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Movie not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch movie details"
        });
    }
});

// OMDb: Search movies by title
app.get("/api/omdb/search", async (req, res) => {
    try {
        const searchText = (req.query.q || "").trim();
        const year = req.query.year;
        const page = Math.min(
            Math.max(parseInt(req.query.page, 10) || 1, 1),
            100
        );

        if (!searchText) {
            return res.status(400).json({
                message: "Please provide a movie search term"
            });
        }

        if (searchText.length > 100) {
            return res.status(400).json({
                message: "Search term is too long"
            });
        }

        const params = {
            s: searchText,
            page: String(page)
        };

        if (year && /^\d{4}$/.test(year)) {
            params.y = year;
        }

        const data = await getOmdbMovie(params);

        res.json({
            message: "OMDb movies fetched successfully!",
            totalResults: Number(data.totalResults || 0),
            movies: data.Search || []
        });

    } catch (error) {
        console.error("OMDb search error:", error.message);

        res.status(502).json({
            message: error.message
        });
    }
});

// OMDb: Get complete movie details using IMDb ID
app.get("/api/omdb/movie/:imdbId", async (req, res) => {
    try {
        const imdbId = req.params.imdbId;

        if (!/^tt\d+$/.test(imdbId)) {
            return res.status(400).json({
                message: "Invalid IMDb movie ID"
            });
        }

        const movie = await getOmdbMovie({
            i: imdbId,
            plot: "full"
        });

        res.json({
            message: "OMDb movie details fetched successfully!",
            movie
        });

    } catch (error) {
        console.error("OMDb details error:", error.message);

        res.status(502).json({
            message: error.message
        });
    }
});

// OMDb: Import movie and genres into CinePulse MySQL
app.post("/api/omdb/import/:imdbId", async (req, res) => {
    let connection;

    try {
        const imdbId = req.params.imdbId;

        if (!/^tt\d+$/.test(imdbId)) {
            return res.status(400).json({
                message: "Invalid IMDb movie ID"
            });
        }

        const movie = await getOmdbMovie({
            i: imdbId,
            plot: "full"
        });

        const title = movie.Title;
        const overview =
            movie.Plot === "N/A" ? null : movie.Plot;

        const releaseDate = convertReleaseDate(movie.Released);

        const language =
            movie.Language === "N/A"
                ? null
                : movie.Language;

        const posterPath =
            movie.Poster === "N/A"
                ? null
                : movie.Poster;

        const genreNames =
            movie.Genre && movie.Genre !== "N/A"
                ? movie.Genre.split(",").map(g => g.trim())
                : [];

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check whether the movie already exists
        const [existingMovies] = await connection.query(
            `SELECT movie_id
             FROM movies
             WHERE title = ?
             AND release_date <=> ?
             LIMIT 1`,
            [title, releaseDate]
        );

        let movieId;
        let imported = false;

        if (existingMovies.length > 0) {
            movieId = existingMovies[0].movie_id;

            await connection.query(
                `UPDATE movies
                 SET overview = ?,
                     language = ?,
                     poster_path = ?
                 WHERE movie_id = ?`,
                [overview, language, posterPath, movieId]
            );

        } else {
            const [result] = await connection.query(
                `INSERT INTO movies
                 (tmdb_id, title, overview, release_date, language, poster_path)
                 VALUES (NULL, ?, ?, ?, ?, ?)`,
                [
                    title,
                    overview,
                    releaseDate,
                    language,
                    posterPath
                ]
            );

            movieId = result.insertId;
            imported = true;
        }

        // Insert genres and connect them to the movie
        for (const genreName of genreNames) {
            if (!genreName || genreName.length > 50) {
                continue;
            }

            await connection.query(
                `INSERT IGNORE INTO genres (genre_name)
                 VALUES (?)`,
                [genreName]
            );

            const [genreRows] = await connection.query(
                `SELECT genre_id
                 FROM genres
                 WHERE genre_name = ?`,
                [genreName]
            );

            if (genreRows.length > 0) {
                await connection.query(
                    `INSERT IGNORE INTO movie_genres
                     (movie_id, genre_id)
                     VALUES (?, ?)`,
                    [movieId, genreRows[0].genre_id]
                );
            }
        }

        await connection.commit();

        res.status(imported ? 201 : 200).json({
            message: imported
                ? "Movie imported successfully!"
                : "Movie already existed. Its information was updated.",
            movie_id: movieId,
            title,
            imdb_id: imdbId,
            imported
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("OMDb import error:", error.message);

        res.status(500).json({
            message: "Failed to import movie",
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Get reviews with usernames
app.get("/api/movies/:movieId/reviews", async (req, res) => {
    try {
        const movieId = req.params.movieId;

        const [rows] = await db.query(
            `SELECT
                r.review_id,
                r.user_id,
                u.username,
                r.rating,
                r.review_text
             FROM reviews r
             JOIN users u
                ON r.user_id = u.user_id
             WHERE r.movie_id = ?
             ORDER BY r.review_id DESC`,
            [movieId]
        );

        res.json({
            message: "Reviews fetched successfully!",
            reviews: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch reviews"
        });
    }
});

// Add a review for a movie
app.post("/api/movies/:movieId/reviews", async (req, res) => {
    try {
        const movieId = req.params.movieId;
        const { user_id, rating, review_text } = req.body;

        if (!user_id || !rating || !review_text) {
            return res.status(400).json({
                message: "Please provide user_id, rating and review_text"
            });
        }

        if (rating < 1 || rating > 10) {
            return res.status(400).json({
                message: "Rating must be between 1 and 10"
            });
        }

        const [result] = await db.query(
            "INSERT INTO reviews (user_id, movie_id, rating, review_text) VALUES (?, ?, ?, ?)",
            [user_id, movieId, rating, review_text]
        );

        res.status(201).json({
            message: "Review added successfully!",
            review_id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to add review"
        });
    }
});

// Get average rating for a movie
app.get("/api/movies/:movieId/rating", async (req, res) => {
    try {
        const movieId = req.params.movieId;

        const [rows] = await db.query(
            `SELECT
                AVG(rating) AS average_rating,
                COUNT(*) AS total_reviews
             FROM reviews
             WHERE movie_id = ?`,
            [movieId]
        );

        res.json({
            message: "Movie rating fetched successfully!",
            average_rating: rows[0].average_rating,
            total_reviews: rows[0].total_reviews
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch movie rating"
        });
    }
});

// Get user's watchlist
app.get("/api/users/:userId/watchlist", async (req, res) => {
    try {
        const userId = req.params.userId;

        const [rows] = await db.query(
            `SELECT
                w.watchlist_id,
                w.user_id,
                m.movie_id,
                m.title,
                m.overview,
                m.language,
                m.poster_path,
                w.added_at
             FROM watchlist w
             JOIN movies m
                ON w.movie_id = m.movie_id
             WHERE w.user_id = ?`,
            [userId]
        );

        res.json({
            message: "Watchlist fetched successfully!",
            watchlist: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch watchlist"
        });
    }
});

// Add movie to user's watchlist
app.post("/api/users/:userId/watchlist", async (req, res) => {
    try {
        const userId = req.params.userId;
        const movieId = req.body.movie_id;

        await db.query(
            "INSERT INTO watchlist (user_id, movie_id) VALUES (?, ?)",
            [userId, movieId]
        );

        res.json({
            message: "Movie added to watchlist successfully!"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to add movie to watchlist"
        });
    }
});

// Remove movie from user's watchlist
app.delete("/api/users/:userId/watchlist/:movieId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const movieId = req.params.movieId;

        const [result] = await db.query(
            "DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?",
            [userId, movieId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Movie not found in watchlist"
            });
        }

        res.json({
            message: "Movie removed from watchlist successfully!"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to remove movie from watchlist"
        });
    }
});

// User Registration API
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Please enter all fields"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters"
            });
        }

        const [existingUser] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            [username, email, hashedPassword]
        );

        res.status(201).json({
            message: "User registered successfully!"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Registration failed"
        });
    }
});

// DEMO Forgot Password API
app.post("/api/reset-password", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter email and new password"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters"
            });
        }

        // Check whether the email exists
        const [users] = await db.query(
            "SELECT user_id FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({
                message: "No account found with this email address"
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password in MySQL
        await db.query(
            "UPDATE users SET password = ? WHERE email = ?",
            [hashedPassword, email]
        );

        res.json({
            message: "Password reset successfully!"
        });

    } catch (error) {
        console.error("Password reset error:", error);

        res.status(500).json({
            message: "Failed to reset password"
        });
    }
});

// User Login API
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter email and password"
            });
        }

        const [rows] = await db.query(
            "SELECT user_id, username, email, password FROM users WHERE email = ?",
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        res.json({
            message: "Login successful!",
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Login failed"
        });
    }
});

// Start server
const PORT = 5000;

app.listen(PORT, () => {
    console.log(`CinePulse server running on port ${PORT}`);
});
