// server.js — Spotify Token Proxy (Vercel Serverless compatible)
// Credentials come from environment variables — never hardcoded!

const http = require("http");
const https = require("https");

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PORT          = process.env.PORT || 3001;

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function getSpotifyToken() {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return reject(new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET env variables."));
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
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error("Spotify error: " + data));
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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, getCorsHeaders());
    res.end();
    return;
  }

  if (req.url === "/token" && req.method === "GET") {
    try {
      const token = await getSpotifyToken();
      res.writeHead(200, getCorsHeaders());
      res.end(JSON.stringify({ access_token: token }));
    } catch (err) {
      res.writeHead(500, getCorsHeaders());
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.writeHead(404, getCorsHeaders());
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(`✅ Token server running at http://localhost:${PORT}`);
});
