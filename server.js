import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());

async function fetchToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        btoa(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

app.get("/api/token", async (req, res) => {
  const token = await fetchToken();
  res.json({ access_token: token });
});

app.get("/api/artist/:id", async (req, res) => {
  const token = await fetchToken();
  const r = await fetch(`https://api.spotify.com/v1/artists/${req.params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  res.json(data);
});

app.get("/api/artist/:id/albums", async (req, res) => {
  const token = await fetchToken();
  const r = await fetch(
    `https://api.spotify.com/v1/artists/${req.params.id}/albums?limit=10&include_groups=album,single`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await r.json();
  res.json(data);
});

app.get("/api/album/:id/tracks", async (req, res) => {
  const token = await fetchToken();
  const r = await fetch(
    `https://api.spotify.com/v1/albums/${req.params.id}/tracks?limit=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await r.json();
  res.json(data);
});

app.listen(3001, () => console.log("Token server running on port 3001"));
