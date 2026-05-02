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

// ─── Helper: score a playlist by how "editorial" it looks ─────────────────────
// Spotify's owner:spotify filter doesn't work with client credentials, so we
// rank by name patterns instead. "This Is X" and "X Radio" are always Spotify
// editorial. Higher score = sorted first.
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

    // Seed the genre cache for free — search results include genres and cost
    // no extra API calls. This means /api/artist/:id won't need any fallback
    // requests for artists the user already saw in the dropdown.
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
    console.error("[search] error:", e);
    res.status(500).json({ error: "Search failed" });
  }
});

// ─── Artist ────────────────────────────────────────────────────────────────────

// Genre cache — seeded for free by /api/search, so /api/artist/:id rarely
// needs to make extra Spotify calls just to get genres.
const genreCache = new Map(); // artistId -> { genres, expiry }
const GENRE_CACHE_TTL = 30 * 60 * 1000; // 30 min

async function resolveGenres(id, name, existingGenres, headers) {
  // Already have genres on the artist object — done, no extra calls
  if (existingGenres?.length) {
    console.log(`[artist] ${name} | genres: ${existingGenres.join(", ")}`);
    return existingGenres;
  }

  // Check cache — likely seeded for free from the search dropdown
  const cached = genreCache.get(id);
  if (cached && Date.now() < cached.expiry) {
    const label = cached.genres.length ? cached.genres.join(", ") : "(none)";
    console.log(`[artist] ${name} | genres from cache: ${label}`);
    return cached.genres;
  }

  // Only make one extra call (related-artists) as a last resort.
  // We skip the search fallback — it's redundant since search already seeds
  // the cache, and firing extra requests contributes to rate limiting.
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
  const cached = topTracksCache.get(id);
  if (cached && Date.now() < cached.expiry) {
    console.log("[top-tracks] cache hit for", id);
    return res.json({ tracks: cached.tracks });
  }
  try {
    const token = await fetchToken();
    const r = await fetch(
      `https://api.spotify.com/v1/artists/${id}/top-tracks?market=US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.status === 429) {
      const retryAfter = r.headers.get("Retry-After") ?? "?";
      console.warn(`[top-tracks] rate limited — Retry-After: ${retryAfter}s`);
      return res.status(429).json({ error: "Rate limited", tracks: [] });
    }
    const data = await r.json();
    const tracks = data.tracks ?? [];
    topTracksCache.set(id, { tracks, expiry: Date.now() + TOP_TRACKS_TTL });
    console.log("[top-tracks]", tracks.length, "tracks for", id);
    res.json({ tracks });
  } catch (e) {
    console.error("[top-tracks] error:", e);
    res.status(500).json({ error: "Failed to fetch top tracks", tracks: [] });
  }
});

// ─── Albums ────────────────────────────────────────────────────────────────────

// Cache always stores the full album+single catalog per artist.
// All filter variations (albumType, minYear, maxResults) are applied in-memory,
// so changing filters never triggers a new Spotify fetch.
const albumCache = new Map(); // key = artistId, value = { items, expiry }
const ALBUM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Fetch pages until we have at least `needed` items of each type, or exhaust all pages.
// This avoids crawling an artist's entire catalog when we only need 10 results.
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

    // Always pull from the single combined cache entry.
    // Pass maxResults so pagination stops early once we have enough of each type.
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
      return true; // "both"
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

// ─── Artist Playlists (via search) ────────────────────────────────────────────

app.get("/api/artist/:id/playlists", async (req, res) => {
  try {
    const token = await fetchToken();
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "name param required" });
    const maxResults = parseInt(req.query.maxResults) || 10;

    // Search for "This Is <artist>" first — Spotify's editorial format —
    // then do a general search and merge, deduped by id.
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

    // Sort by editorial score (name-pattern based), then track count
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

const PORT = process.env.SERVER_PORT;
app.listen(PORT, () => console.log(`Token server running on port ${PORT}`));
