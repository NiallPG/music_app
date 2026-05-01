import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { exec } from "child_process";
import { readFileSync } from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ─── Lua → JSON config pipeline ───────────────────────────────────────────────
function generateConfig() {
  return new Promise((resolve, reject) => {
    exec("bash generate_config.sh", (err, stdout, stderr) => {
      if (err) {
        console.error("[config] Failed to generate config:", stderr);
        reject(err);
      } else {
        console.log("[config]", stdout.trim());
        resolve();
      }
    });
  });
}

// ─── Spotify token (server-side only) ─────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function fetchToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env"
    );
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!data.access_token) {
    console.error("[token] failed:", data);
    throw new Error("Failed to fetch Spotify token");
  }
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  console.log("[token] fetched new token");
  return cachedToken;
}

// ─── Config endpoints ──────────────────────────────────────────────────────────

app.get("/api/config", (_req, res) => {
  try {
    const config = JSON.parse(readFileSync("config.json", "utf-8"));
    res.json(config);
  } catch {
    res.json({ albumType: "both", minReleaseYear: 1950, maxResults: 10 });
  }
});

app.post("/api/config/reload", async (_req, res) => {
  try {
    await generateConfig();
    const config = JSON.parse(readFileSync("config.json", "utf-8"));
    res.json(config);
  } catch (e) {
    console.error("[config/reload] error:", e);
    res.status(500).json({ error: "Failed to reload config" });
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────

app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "q param required" });

    const token = await fetchToken();

    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        q
      )}&type=artist&limit=6`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    const items = (searchData.artists?.items ?? []).filter(Boolean);

    res.json({ artists: items });
  } catch (e) {
    console.error("[search] error:", e);
    res.status(500).json({ error: "Search failed" });
  }
});

// ─── Artist ────────────────────────────────────────────────────────────────────

app.get("/api/artist/:id", async (req, res) => {
  try {
    const token = await fetchToken();
    const r = await fetch(
      `https://api.spotify.com/v1/artists/${req.params.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(await r.json());
  } catch (e) {
    console.error("[artist] error:", e);
    res.status(500).json({ error: "Failed to fetch artist" });
  }
});

// ─── Albums ────────────────────────────────────────────────────────────────────

app.get("/api/artist/:id/albums", async (req, res) => {
  try {
    const token = await fetchToken();

    const albumType = req.query.albumType || "both";
    const minReleaseYear = parseInt(req.query.minReleaseYear) || 1950;
    const maxResults = parseInt(req.query.maxResults) || 10;

    const includeGroups =
      albumType === "album"
        ? "album"
        : albumType === "single"
        ? "single"
        : "album,single";

    const spotifyUrl = `https://api.spotify.com/v1/artists/${req.params.id}/albums?include_groups=${includeGroups}&market=US`;
    console.log(
      "[albums] GET",
      spotifyUrl,
      "| minYear:",
      minReleaseYear,
      "| maxResults:",
      maxResults
    );

    const r = await fetch(spotifyUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();

    if (data.error) {
      console.error("[albums] Spotify error:", data.error);
      return res.status(500).json({ error: data.error.message });
    }

    console.log(
      "[albums] raw items:",
      data.items?.map((i) => ({ name: i.name, type: i.album_type }))
    );

    const filtered = (data.items ?? [])
      .filter((album) => {
        const year = parseInt(album.release_date?.slice(0, 4));
        return !isNaN(year) && year >= minReleaseYear;
      })
      .slice(0, maxResults);

    console.log("[albums] after filter:", filtered.length);
    res.json({ items: filtered });
  } catch (e) {
    console.error("[albums] error:", e);
    res.status(500).json({ error: "Failed to fetch albums" });
  }
});

// ─── Tracks ────────────────────────────────────────────────────────────────────

app.get("/api/album/:id/tracks", async (req, res) => {
  try {
    const token = await fetchToken();
    const r = await fetch(
      `https://api.spotify.com/v1/albums/${req.params.id}/tracks`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(await r.json());
  } catch (e) {
    console.error("[tracks] error:", e);
    res.status(500).json({ error: "Failed to fetch tracks" });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.SERVER_PORT;
app.listen(PORT, () => console.log(`Token server running on port ${PORT}`));
