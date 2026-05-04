import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "child_process";
import { readFileSync } from "fs";
import {
  getDemoAlbums,
  getDemoArtist,
  getDemoTopTracks,
  getDemoTracks,
  searchDemoArtists,
} from "./scripts/demoCatalog.mjs";
import { loadListeningRules, scoreAlbums } from "./scripts/luaRules.mjs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ─── Constants ─────────────────────────────────────────────────────────────────

const API_VERSION = "music-app-api-2026-05-02-token-debug";
const DEMO_AUTH_ERROR =
  "Spotify credentials are not valid, so demo catalog results are being used.";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const listeningRulesPath = path.join(
  __dirname,
  "workflows",
  "listening_rules.lua"
);

// ─── Lua helpers ───────────────────────────────────────────────────────────────

function getListeningRules() {
  return loadListeningRules(listeningRulesPath);
}

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

// ─── Spotify token ─────────────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiry = 0;

async function fetchToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
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
    console.error("[token] failed:", data);
    if (data.error === "invalid_client") {
      throw new Error(
        "Spotify rejected the client credentials. Update SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env with a valid pair from the same Spotify Developer app, then restart the server."
      );
    }
    throw new Error(
      data.error_description ?? data.error ?? "Spotify token request failed."
    );
  }

  cachedToken = data.access_token;
  tokenExpiry =
    Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000;
  console.log("[token] fetched new token");
  return cachedToken;
}

// ─── Generic Spotify fetch with 401 retry ──────────────────────────────────────

async function fetchSpotifyJson(
  url,
  retryAfterRefresh = true,
  label = "Spotify"
) {
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

// ─── Helper: score a playlist by how "editorial" it looks ─────────────────────

function editorialScore(playlist, artistName) {
  const name = (playlist?.name ?? "").toLowerCase();
  const artist = artistName.toLowerCase();
  if (name === `this is ${artist}`) return 3;
  if (name.startsWith("this is ")) return 2;
  if (name === `${artist} radio`) return 2;
  if (name.includes("radio")) return 1;
  if (name.includes(artist)) return 1;
  return 0;
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

// ─── Health & debug endpoints ──────────────────────────────────────────────────

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
      spotifyUrl("/search", { q: "Ca", type: "artist", limit: 1 }),
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

// ─── Search ───────────────────────────────────────────────────────────────────

// Genre cache — seeded for free by /api/search, so /api/artist/:id rarely
// needs to make extra Spotify calls just to get genres.
const genreCache = new Map(); // artistId -> { genres, expiry }
const GENRE_CACHE_TTL = 30 * 60 * 1000; // 30 min

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

    // Seed the genre cache for free — search results include genres
    for (const artist of items) {
      if (artist.id && artist.genres?.length) {
        genreCache.set(artist.id, {
          genres: artist.genres,
          expiry: Date.now() + GENRE_CACHE_TTL,
        });
      }
    }

    res.json({ artists: items });
  } catch (e) {
    // Fall back to demo catalog if Spotify is unavailable
    console.error("[search] error, falling back to demo:", e);
    const q = req.query.q ?? "";
    res.json({
      artists: searchDemoArtists(String(q)),
      mode: "demo",
      warning: `${DEMO_AUTH_ERROR} ${e.message}`,
    });
  }
});

// ─── Artist ────────────────────────────────────────────────────────────────────

async function resolveGenres(id, name, existingGenres, headers) {
  if (existingGenres?.length) {
    console.log(`[artist] ${name} | genres: ${existingGenres.join(", ")}`);
    return existingGenres;
  }

  const cached = genreCache.get(id);
  if (cached && Date.now() < cached.expiry) {
    const label = cached.genres.length ? cached.genres.join(", ") : "(none)";
    console.log(`[artist] ${name} | genres from cache: ${label}`);
    return cached.genres;
  }

  try {
    const relRes = await fetch(
      `https://api.spotify.com/v1/artists/${id}/related-artists`,
      { headers }
    );
    if (relRes.ok) {
      const relData = await relRes.json();
      const relatedGenres = (relData.artists ?? [])
        .flatMap((a) => a.genres ?? [])
        .filter(Boolean);
      const freq = {};
      for (const g of relatedGenres) freq[g] = (freq[g] ?? 0) + 1;
      const topGenres = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);
      if (topGenres.length) {
        console.log(
          `[artist] ${name} | genres from related: ${topGenres.join(", ")}`
        );
        genreCache.set(id, {
          genres: topGenres,
          expiry: Date.now() + GENRE_CACHE_TTL,
        });
        return topGenres;
      }
    }
  } catch (e) {
    console.warn("[artist] related-artists fallback failed:", e.message);
  }

  console.log(`[artist] ${name} | genres: (none found)`);
  genreCache.set(id, { genres: [], expiry: Date.now() + GENRE_CACHE_TTL });
  return [];
}

app.get("/api/artist/:id", async (req, res) => {
  // Check demo catalog first
  const demoArtist = getDemoArtist(req.params.id);
  if (demoArtist) {
    res.json({ ...demoArtist, mode: "demo" });
    return;
  }

  try {
    const token = await fetchToken();
    const headers = { Authorization: `Bearer ${token}` };
    const id = req.params.id;

    const r = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
      headers,
    });
    const data = await r.json();

    data.genres = await resolveGenres(
      id,
      data.name ?? id,
      data.genres,
      headers
    );

    res.json(data);
  } catch (e) {
    console.error("[artist] error:", e);
    res.status(500).json({ error: "Failed to fetch artist" });
  }
});

// ─── Top Tracks ───────────────────────────────────────────────────────────────

const topTracksCache = new Map(); // artistId -> { tracks, expiry }
const TOP_TRACKS_TTL = 10 * 60 * 1000; // 10 min

app.get("/api/artist/:id/top-tracks", async (req, res) => {
  const id = req.params.id;

  // Check demo catalog first
  const demoTracks = getDemoTopTracks(id);
  if (demoTracks.length > 0) {
    return res.json({ tracks: demoTracks, mode: "demo" });
  }

  const cached = topTracksCache.get(id);
  if (cached && Date.now() < cached.expiry) {
    console.log("[top-tracks] cache hit for", id);
    return res.json({ tracks: cached.tracks });
  }
  try {
    const token = await fetchToken();
    const headers = { Authorization: `Bearer ${token}` };
    const r = await fetch(
      `https://api.spotify.com/v1/artists/${id}/top-tracks?market=US`,
      { headers }
    );
    if (r.status === 429) {
      const retryAfter = r.headers.get("Retry-After") ?? "?";
      console.warn(`[top-tracks] rate limited — Retry-After: ${retryAfter}s`);
      return res.status(429).json({ error: "Rate limited", tracks: [] });
    }
    const data = await r.json();
    let tracks = data.tracks ?? [];

    if (r.status === 403 || tracks.length === 0) {
      console.warn(
        "[top-tracks] forbidden or empty, falling back to album tracks"
      );
      try {
        const albumsR = await fetch(
          `https://api.spotify.com/v1/artists/${id}/albums?include_groups=album,single&market=US&limit=5`,
          { headers }
        );
        const albumsData = await albumsR.json();
        const firstAlbum = albumsData.items?.[0];
        if (firstAlbum) {
          const tracksR = await fetch(
            `https://api.spotify.com/v1/albums/${firstAlbum.id}/tracks?market=US&limit=10`,
            { headers }
          );
          const tracksData = await tracksR.json();
          tracks = (tracksData.items ?? []).map((t) => ({
            ...t,
            album: {
              id: firstAlbum.id,
              name: firstAlbum.name,
              images: firstAlbum.images,
            },
          }));
        }
      } catch (fallbackErr) {
        console.warn("[top-tracks] fallback failed:", fallbackErr.message);
      }
    }

    topTracksCache.set(id, { tracks, expiry: Date.now() + TOP_TRACKS_TTL });
    console.log("[top-tracks]", tracks.length, "tracks for", id);
    res.json({ tracks });
  } catch (e) {
    console.error("[top-tracks] error:", e);
    res.status(500).json({ error: "Failed to fetch top tracks", tracks: [] });
  }
});

// ─── Albums ────────────────────────────────────────────────────────────────────

const albumCache = new Map(); // key = artistId, value = { items, expiry }
const ALBUM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchAllAlbums(artistId, token, needed = 10) {
  const cached = albumCache.get(artistId);
  if (cached && Date.now() < cached.expiry) {
    const c = cached;
    const cachedAlbums = c.items.filter((i) => i.album_type === "album").length;
    const cachedSingles = c.items.filter(
      (i) => i.album_type === "single"
    ).length;
    if (
      (cachedAlbums >= needed && cachedSingles >= needed) ||
      c.exhausted ||
      c.rateLimited
    ) {
      console.log("[albums] cache hit for", artistId);
      return { items: c.items, rateLimited: c.rateLimited ?? false };
    }
    console.log("[albums] cache exists but needs more items, re-fetching");
  }

  const items = [];
  let url = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&market=US`;
  let exhausted = false;
  let rateLimited = false;

  while (url) {
    const albumCount = items.filter((i) => i.album_type === "album").length;
    const singleCount = items.filter((i) => i.album_type === "single").length;
    if (albumCount >= needed && singleCount >= needed) {
      console.log("[albums] have enough items, stopping pagination");
      break;
    }

    console.log("[albums] fetching page:", url);
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (r.status === 429) {
      const retryAfter = parseInt(r.headers.get("Retry-After") ?? "0");
      console.warn(`[albums] rate limited — Retry-After: ${retryAfter}s`);
      if (retryAfter > 60) {
        console.warn("[albums] long rate limit ban, returning partial results");
        rateLimited = true;
        break;
      }
      await new Promise((res) => setTimeout(res, retryAfter * 1000));
      continue;
    }

    const data = await r.json();
    if (data.error) throw new Error(data.error.message);

    items.push(...(data.items ?? []));
    url = data.next ?? null;
    if (!url) exhausted = true;
  }

  albumCache.set(artistId, {
    items,
    expiry: Date.now() + ALBUM_CACHE_TTL_MS,
    exhausted,
    rateLimited,
  });
  console.log(
    "[albums] cached",
    items.length,
    "items for",
    artistId,
    exhausted ? "(full catalog)" : rateLimited ? "(rate limited)" : "(partial)"
  );
  return { items, rateLimited };
}

app.get("/api/artist/:id/albums", async (req, res) => {
  // Check demo catalog first
  const demoAlbums = getDemoAlbums(req.params.id);
  if (demoAlbums.length > 0) {
    res.json({ items: demoAlbums, mode: "demo" });
    return;
  }

  try {
    const token = await fetchToken();

    const albumType = req.query.albumType || "both";
    const minReleaseYear = parseInt(req.query.minReleaseYear) || 1950;
    const maxResults = parseInt(req.query.maxResults) || 10;

    console.log(
      "[albums] request | artist:",
      req.params.id,
      "| albumType:",
      albumType,
      "| minYear:",
      minReleaseYear,
      "| maxResults:",
      maxResults
    );

    const { items: allItems, rateLimited } = await fetchAllAlbums(
      req.params.id,
      token,
      maxResults
    );

    const yearFilter = (item) => {
      if (!item.release_date) return true;
      const year = parseInt(item.release_date.slice(0, 4));
      return !isNaN(year) && year >= minReleaseYear;
    };

    const typeFilter = (item) => {
      if (albumType === "album") return item.album_type === "album";
      if (albumType === "single") return item.album_type === "single";
      return true;
    };

    if (albumType === "both") {
      const albums = allItems
        .filter((i) => i.album_type === "album" && yearFilter(i))
        .slice(0, maxResults);
      const singles = allItems
        .filter((i) => i.album_type === "single" && yearFilter(i))
        .slice(0, maxResults);
      console.log(
        "[albums] split — albums:",
        albums.length,
        "singles:",
        singles.length
      );
      return res.json({ albums, singles, rateLimited });
    }

    const filtered = allItems
      .filter((i) => typeFilter(i) && yearFilter(i))
      .slice(0, maxResults);
    console.log("[albums] after filter:", filtered.length);
    res.json({ items: filtered, rateLimited });
  } catch (e) {
    console.error("[albums] error:", e);
    res.status(500).json({ error: "Failed to fetch albums" });
  }
});

// ─── Listening Plan (Lua scoring) ──────────────────────────────────────────────

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

// ─── Artist Playlists (via search) ────────────────────────────────────────────

app.get("/api/artist/:id/playlists", async (req, res) => {
  try {
    const token = await fetchToken();
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "name param required" });
    const maxResults = parseInt(req.query.maxResults) || 10;

    const [thisIsRes, generalRes] = await Promise.all([
      fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(
          "This Is " + name
        )}&type=playlist&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(
          name
        )}&type=playlist&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);

    if (thisIsRes.status === 429 || generalRes.status === 429) {
      console.warn("[playlists] rate limited");
      return res.status(429).json({ error: "Rate limited" });
    }

    const thisIsData = await thisIsRes.json();
    const generalData = await generalRes.json();

    const seen = new Set();
    const items = [];

    for (const p of [
      ...(thisIsData.playlists?.items ?? []),
      ...(generalData.playlists?.items ?? []),
    ].filter(Boolean)) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        items.push(p);
      }
    }

    const sorted = items
      .sort((a, b) => {
        const scoreDiff = editorialScore(b, name) - editorialScore(a, name);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.tracks?.total ?? 0) - (a.tracks?.total ?? 0);
      })
      .slice(0, maxResults);

    console.log(
      "[playlists] final sorted:",
      sorted.map(
        (p) =>
          `${p.name} (score: ${editorialScore(p, name)}, owner: "${
            p.owner?.id
          }")`
      )
    );

    res.json({ playlists: sorted });
  } catch (e) {
    console.error("[playlists] error:", e);
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

// ─── Tracks ────────────────────────────────────────────────────────────────────

app.get("/api/album/:id/tracks", async (req, res) => {
  // Check demo catalog first
  const demoTracks = getDemoTracks(req.params.id);
  if (demoTracks.length > 0) {
    res.json({ items: demoTracks, mode: "demo" });
    return;
  }

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const token = await fetchToken();
      const r = await fetch(
        `https://api.spotify.com/v1/albums/${req.params.id}/tracks`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.status === 429) {
        const wait = parseInt(r.headers.get("Retry-After") ?? "2");
        console.warn(`[tracks] rate limited — waiting ${wait}s`);
        await new Promise((res) => setTimeout(res, wait * 1000));
        continue;
      }
      return res.json(await r.json());
    } catch (e) {
      console.warn(`[tracks] attempt ${attempt} failed:`, e.message);
      if (attempt < MAX_RETRIES) {
        await new Promise((res) => setTimeout(res, attempt * 500));
      } else {
        console.error("[tracks] all retries exhausted");
        res.status(500).json({ error: "Failed to fetch tracks" });
      }
    }
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.SERVER_PORT ?? 3001;
app.listen(PORT, () =>
  console.log(`Token server running on port ${PORT} (${API_VERSION})`)
);
