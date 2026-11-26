# 🎬 CinePulse – Aggregated Movie & Review Hub

CinePulse is a web-based movie discovery and review platform that allows users to explore movies, search for titles, view movie details, submit ratings and reviews, and manage their personal watchlists.

The application integrates the **OMDb API** to search and import movie information and uses **MySQL** to store movie records, user accounts, reviews and watchlists.

## ✨ Features

- **Movie Discovery:** Explore trending, popular, latest and top-rated movie collections.
- **Movie Search:** Search for movies using the OMDb API.
- **Movie Filters:** Filter movies by language and genre.
- **Movie Details:** View movie information, posters, release dates, language and genres.
- **User Authentication:** Register and log in to a personal account.
- **Forgot Password:** Demo password-reset functionality without email verification.
- **Ratings & Reviews:** Submit ratings and write reviews for movies.
- **Review Display:** View reviews submitted by other users.
- **Watchlist:** Add movies to your watchlist and remove them whenever required.

## 🛠️ Technologies Used

| Category | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL |
| API Integration | OMDb API |
| Authentication | bcryptjs |
| Database Connectivity | mysql2 |
| Version Control | Git & GitHub |

## 📁 Project Structure

```text
CinePulse/
│
├── public/
│   ├── index.html
│   ├── movie.html
│   ├── auth.html
│   └── watchlist.html
│
├── server.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## ⚙️ Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/puneeth172006/CinePulse.git
```

### 2. Navigate to the project folder

```bash
cd CinePulse
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root directory.

Add your MySQL credentials and OMDb API key using the variable names expected by `server.js`.

Example:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=cinepulse
OMDB_API_KEY=your_omdb_api_key
PORT=5000
```

Replace the example values with your actual configuration. Never upload your `.env` file to GitHub.

### 5. Configure the database

- Open MySQL Workbench.
- Create a database named `cinepulse`.
- Import the CinePulse database tables and data from your database SQL export, if available.

### 6. Start the application

```bash
node server.js
```

The server runs at:

```text
http://localhost:5000
```

Open the application in your browser:

```text
http://localhost:5000
```

## 🔑 API Integration

CinePulse uses the **OMDb API (Open Movie Database)** to search for movies and retrieve movie information.

Website: https://www.omdbapi.com/

An API key is required to enable movie search and import functionality.

## 🗄️ Database

The application uses MySQL to manage the following entities:

- Users
- Movies
- Genres
- Movie Genres
- Reviews
- Watchlist
- User Preferred Genres
- User Preferred Languages

## 🚀 Future Enhancements

- Personalized movie recommendations.
- Improved movie discovery and filtering.
- Secure password recovery using email verification.
- Cloud deployment for public access.
- Enhanced user experience and interface.

## 👨‍💻 Project Information

**Project Name:** CinePulse – Aggregated Movie & Review Hub

**Domain:** Database Management Systems and Full Stack Development

**Developed by:** Puneeth H

**GitHub Repository:** https://github.com/puneeth172006/CinePulse

---

⭐ If you find this project interesting, feel free to explore the repository!
