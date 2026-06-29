// api/token.js — Vercel Serverless Function
// Vercel automatically runs this at: https://your-app.vercel.app/api/token

const https = require("https");

function getSpotifyToken() {
  return new Promise((resolve, reject) => {
    const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
    const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return reject(new Error("Missing Spotify credentials in environment variables."));
    }

    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const body = "grant_type=client_credentials";

    const options = {
      hostname: "accounts.spotify.com",
      path: "/api/token",
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) resolve(parsed);
          else reject(new Error("Spotify returned: " + data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Vercel serverless handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const token = await getSpotifyToken();
    res.status(200).json({ access_token: token.access_token, expires_in: token.expires_in });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
