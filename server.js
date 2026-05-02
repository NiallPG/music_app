import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDemoAlbums,
  getDemoArtist,
  getDemoTracks,
  searchDemoArtists,
} from "./scripts/demoCatalog.mjs";
import { loadListeningRules, scoreAlbums } from "./scripts/luaRules.mjs";
dotenv.config();

const app = express();
app.use(cors());

const API_VERSION = "music-app-api-2026-05-02-token-debug";
const DEMO_AUTH_ERROR = "Spotify credentials are not valid, so demo catalog results are being used.";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const listeningRulesPath = path.join(
  __dirname,
  "workflows",
  "listening_rules.lua"
);

function getListeningRules() {
  return loadListeningRules(listeningRulesPath);
}

let cachedSpotifyToken = null;
let cachedSpotifyTokenExpiresAt = 0;

async function fetchToken(forceRefresh = false) {
  if (
    !forceRefresh &&
    cachedSpotifyToken &&
    Date.now() < cachedSpotifyTokenExpiresAt
  ) {
    return cachedSpotifyToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env."
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.access_token) {
    if (data.error === "invalid_client") {
      throw new Error(
        "Spotify rejected the client credentials. Update SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env with a valid pair from the same Spotify Developer app, then restart the server."
      );
    }

    throw new Error(
      data.error_description ??
        data.error ??
        "Spotify token request failed."
    );
  }

  cachedSpotifyToken = data.access_token;
  cachedSpotifyTokenExpiresAt =
    Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000;

  return cachedSpotifyToken;
}

async function fetchSpotifyJson(url, retryAfterRefresh = true, label = "Spotify") {
  const token = await fetchToken();
  const spotifyRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await spotifyRes.json();

  if (spotifyRes.status === 401 && retryAfterRefresh) {
    await fetchToken(true);
    return fetchSpotifyJson(url, false, label);
  }

  if (!spotifyRes.ok) {
    throw new Error(
      `${label} failed: ${data.error?.message ?? "Spotify request failed."}`
    );
  }

  return data;
}

function spotifyUrl(pathname, params = {}) {
  const url = new URL(`https://api.spotify.com/v1${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

app.get("/api/token", async (req, res) => {
  try {
    const token = await fetchToken();
    res.json({ access_token: token });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to fetch token.",
    });
  }
});

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    version: API_VERSION,
    spotifyCredentials: {
      hasClientId: Boolean(process.env.SPOTIFY_CLIENT_ID),
      hasClientSecret: Boolean(process.env.SPOTIFY_CLIENT_SECRET),
    },
  });
});

app.get("/api/debug/spotify", async (req, res) => {
  try {
    const token = await fetchToken(true);
    const data = await fetchSpotifyJson(
      spotifyUrl("/search", {
        q: "Ca",
        type: "artist",
        limit: 1,
      }),
      false,
      "Debug search"
    );

    res.json({
      ok: true,
      version: API_VERSION,
      tokenPreview: `${token.slice(0, 8)}...${token.slice(-6)}`,
      firstArtist: data.artists?.items?.[0]?.name ?? null,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: API_VERSION,
      error:
        error instanceof Error
          ? error.message
          : "Spotify debug request failed.",
    });
  }
});

app.get("/api/search/artists", async (req, res) => {
  const query = String(req.query.q ?? "").trim();

  if (!query) {
    res.json({ items: [] });
    return;
  }

  try {
    const data = await fetchSpotifyJson(
      spotifyUrl("/search", {
        q: query,
        type: "artist",
        limit: 8,
      }),
      true,
      "Artist search"
    );

    res.json({ items: data.artists?.items ?? [] });
  } catch (error) {
    res.json({
      items: searchDemoArtists(query),
      mode: "demo",
      warning:
        error instanceof Error ? `${DEMO_AUTH_ERROR} ${error.message}` : DEMO_AUTH_ERROR,
    });
  }
});

app.get("/api/artist/:id", async (req, res) => {
  const demoArtist = getDemoArtist(req.params.id);

  if (demoArtist) {
    res.json({ ...demoArtist, mode: "demo" });
    return;
  }

  try {
    const data = await fetchSpotifyJson(
      spotifyUrl(`/artists/${req.params.id}`),
      true,
      "Artist details"
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to load artist.",
    });
  }
});

app.get("/api/artist/:id/albums", async (req, res) => {
  const demoAlbums = getDemoAlbums(req.params.id);

  if (demoAlbums.length > 0) {
    res.json({ items: demoAlbums, mode: "demo" });
    return;
  }

  try {
    const data = await fetchSpotifyJson(
      spotifyUrl(`/artists/${req.params.id}/albums`, {
        include_groups: "album,single",
        limit: 8,
      }),
      true,
      "Artist albums"
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to load albums.",
    });
  }
});

app.get("/api/artist/:id/listening-plan", async (req, res) => {
  try {
    const demoAlbums = getDemoAlbums(req.params.id);
    const data =
      demoAlbums.length > 0
        ? { items: demoAlbums }
        : await fetchSpotifyJson(
            spotifyUrl(`/artists/${req.params.id}/albums`, {
              include_groups: "album,single",
              limit: 8,
            }),
            true,
            "Lua listening plan albums"
          );
    const rules = getListeningRules();

    res.json({
      name: rules.plan_name,
      description: rules.description,
      source: "workflows/listening_rules.lua",
      mode: demoAlbums.length > 0 ? "demo" : "spotify",
      rules: rules.rules.map(({ key, label, points }) => ({
        key,
        label,
        points,
      })),
      items: scoreAlbums(data.items ?? [], rules),
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unable to create listening plan.",
    });
  }
});

app.get("/api/album/:id/tracks", async (req, res) => {
  const demoTracks = getDemoTracks(req.params.id);

  if (demoTracks.length > 0) {
    res.json({ items: demoTracks, mode: "demo" });
    return;
  }

  try {
    const data = await fetchSpotifyJson(
      spotifyUrl(`/albums/${req.params.id}/tracks`, {
        limit: 20,
      }),
      true,
      "Album tracks"
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to load tracks.",
    });
  }
});

app.listen(3001, () =>
  console.log(`Token server running on port 3001 (${API_VERSION})`)
);
