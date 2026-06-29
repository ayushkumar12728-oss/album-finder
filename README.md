# 🎵 Album Finder

Discover every album, single, and compilation from any artist — powered by the Spotify Web API.

## Features
- Search any artist and browse their full discography
- Filter by Albums, Singles, or Compilations
- Artist profile with followers, popularity, and genre
- Embedded personal playlist
- Click any album to open it in Spotify

## Project Structure

```
album-finder/
├── index.html        # Frontend UI
├── style.css         # Styles
├── app.js            # Frontend logic (Spotify API calls)
├── server.js         # Local development token server
├── api/
│   └── token.js      # Vercel serverless function (production)
├── vercel.json       # Vercel deployment config
├── .env              # Local secrets (never commit this!)
└── .gitignore        # Ignores .env and node_modules
```

## Local Setup

1. Get Spotify credentials at https://developer.spotify.com/dashboard
2. Copy `.env` and fill in your credentials:
   ```
   SPOTIFY_CLIENT_ID=your_id_here
   SPOTIFY_CLIENT_SECRET=your_secret_here
   ```
3. Start the token server:
   ```bash
   node server.js
   ```
4. Open `index.html` in your browser

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo on https://vercel.com
3. Add environment variables in Vercel dashboard:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
4. Deploy!

## Built With
- Vanilla JavaScript
- Spotify Web API
- Vercel Serverless Functions
