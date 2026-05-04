import { useEffect, useState, useRef } from "react";

// ─── Server URL ────────────────────────────────────────────────────────────────
// Set VITE_SERVER_URL in your .env file — no hardcoding needed.
//
// CodeSandbox:  VITE_SERVER_URL=https://k7sk7w-3001.csb.app
// Local dev:    VITE_SERVER_URL=http://localhost:3001
//
// If the variable is absent the app falls back to same-origin (works when the
// frontend and backend are served from the same host/port).
const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/$/, "");

// ─── API helpers ──────────────────────────────────────────────────────────────

async function searchArtists(query: string) {
  const res = await fetch(
    `${SERVER_URL}/api/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  return data.artists ?? [];
}

async function getArtist(id: string) {
  const res = await fetch(`${SERVER_URL}/api/artist/${id}`);
  if (!res.ok) throw new Error("Failed to fetch artist");
  return res.json();
}

async function getAlbums(
  id: string,
  filters: { albumType: string; minReleaseYear: number; maxResults: number }
): Promise<{ items: any[]; singles: any[]; rateLimited: boolean; raw: any }> {
  const params = new URLSearchParams({
    albumType: filters.albumType,
    minReleaseYear: String(filters.minReleaseYear),
    maxResults: String(filters.maxResults),
  });
  const res = await fetch(`${SERVER_URL}/api/artist/${id}/albums?${params}`);
  if (!res.ok) throw new Error("Failed to fetch albums");
  const data = await res.json();
  // When albumType=both the server returns { albums, singles }
  if (Array.isArray(data.albums) && Array.isArray(data.singles)) {
    return {
      items: data.albums,
      singles: data.singles,
      rateLimited: data.rateLimited ?? false,
      raw: data,
    };
  }
  let items: any[];
  if (Array.isArray(data)) items = data;
  else if (Array.isArray(data.items)) items = data.items;
  else items = [];
  return {
    items,
    singles: [],
    rateLimited: data.rateLimited ?? false,
    raw: data,
  };
}

async function getArtistPlaylists(
  id: string,
  name: string,
  maxResults: number
) {
  try {
    const res = await fetch(
      `${SERVER_URL}/api/artist/${id}/playlists?name=${encodeURIComponent(
        name
      )}&maxResults=${maxResults}`
    );
    console.log("[playlists] response status:", res.status);
    if (!res.ok) return [];
    const data = await res.json();
    console.log(
      "[playlists] received:",
      data.playlists?.length ?? 0,
      "playlists"
    );
    return data.playlists ?? [];
  } catch (e) {
    console.error("[playlists] fetch error:", e);
    return [];
  }
}

async function getAlbumTracks(id: string) {
  const res = await fetch(`${SERVER_URL}/api/album/${id}/tracks`);
  if (!res.ok) throw new Error("Failed to fetch tracks");
  const data = await res.json();
  return data.items ?? [];
}

async function getConfig() {
  try {
    const res = await fetch(`${SERVER_URL}/api/config`);
    if (!res.ok) throw new Error("config fetch failed");
    const data = await res.json();
    const safeYear = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1900 && n <= currentYear ? n : 2000;
    };
    const safeMax = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= 50 ? n : 10;
    };
    return {
      albumType: ["both", "album", "single"].includes(data.albumType)
        ? data.albumType
        : "both",
      minReleaseYear: safeYear(data.minReleaseYear),
      maxResults: safeMax(data.maxResults),
    };
  } catch {
    // Silent fallback — never show an error banner on startup
    return { albumType: "both", minReleaseYear: 1950, maxResults: 10 };
  }
}

async function reloadConfig() {
  const res = await fetch(`${SERVER_URL}/api/config/reload`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Config reload failed");
  return res.json();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

function formatDuration(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState("");
  const [dropdown, setDropdown] = useState<any[]>([]);
  const [artist, setArtist] = useState<any>(null);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [singles, setSingles] = useState<any[]>([]);
  const [rawAlbums, setRawAlbums] = useState<any[]>([]); // full unfiltered set from server
  const [rawSingles, setRawSingles] = useState<any[]>([]); // full unfiltered set from server
  const [albumsRateLimited, setAlbumsRateLimited] = useState(false);
  const [activeDiscTab, setActiveDiscTab] = useState<"albums" | "singles">(
    "albums"
  );

  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [albumDebug, setAlbumDebug] = useState<string | null>(null);

  const [albumFilters, setAlbumFilters] = useState({
    albumType: "both",
    minReleaseYear: 1950,
    maxResults: 10,
  });
  const [pendingAlbumFilters, setPendingAlbumFilters] = useState(albumFilters);

  const albumFiltersRef = useRef(albumFilters);
  useEffect(() => {
    albumFiltersRef.current = albumFilters;
  }, [albumFilters]);

  // Fixed 400 ms debounce on every keystroke — eliminates the CPU spike that
  // came from the previous "0 ms after first search" logic.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInDropdown = useRef(false);

  useEffect(() => {
    document.documentElement.style.overflowY = "scroll";
    return () => {
      document.documentElement.style.overflowY = "";
    };
  }, []);

  // Load defaults from config.lua (parsed server-side) on mount
  useEffect(() => {
    getConfig().then((config) => {
      const defaults = {
        albumType: config.albumType,
        minReleaseYear: config.minReleaseYear,
        maxResults: config.maxResults,
      };
      setAlbumFilters(defaults);
      setPendingAlbumFilters(defaults);
      albumFiltersRef.current = defaults;
    });
  }, []);

  // Debounced search — consistent 400 ms delay keeps CPU low
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setDropdown([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchArtists(query);
        setDropdown(results);
        setShowDropdown(true);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleGoHome() {
    setArtist(null);
    setArtistId(null);
    setQuery("");
    setDropdown([]);
    setShowDropdown(false);
    setShowFilters(false);
    setAlbums([]);
    setSingles([]);
    setRawAlbums([]);
    setRawSingles([]);
    setPlaylists([]);
    setSelectedAlbum(null);
    setTracks([]);
    setAlbumsRateLimited(false);
    setActiveDiscTab("albums");
    setError(null);
    setAlbumDebug(null);
  }

  async function handleSelectArtist(id: string) {
    setShowDropdown(false);
    setDropdown([]);
    setQuery("");
    setLoading(true);
    setError(null);
    setSelectedAlbum(null);
    setTracks([]);
    setPlaylists([]);
    setSingles([]);
    setRawAlbums([]);
    setRawSingles([]);
    setAlbumsRateLimited(false);
    setActiveDiscTab("albums");
    setAlbumDebug(null);
    setArtistId(id);
    try {
      const artistData = await getArtist(id);
      setArtist(artistData);

      // Sequence albums first, then playlists — avoids firing multiple
      // Spotify requests simultaneously and reduces rate-limit risk.

      const albumResult = await getAlbums(id, albumFiltersRef.current).catch(
        () => null
      );
      if (albumResult) {
        setRawAlbums(albumResult.items);
        setRawSingles(albumResult.singles ?? []);
        setAlbums(albumResult.items);
        setSingles(albumResult.singles ?? []);
        setAlbumsRateLimited(albumResult.rateLimited ?? false);
        if (
          albumResult.items.length === 0 &&
          (albumResult.singles ?? []).length === 0
        ) {
          setAlbumDebug(JSON.stringify(albumResult.raw, null, 2));
        }
      }
      const playlistsData = await getArtistPlaylists(
        id,
        artistData.name,
        albumFiltersRef.current.maxResults
      ).catch(() => []);
      setPlaylists(playlistsData);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  // Apply minReleaseYear + maxResults locally without hitting the server
  function applyFiltersLocally(
    raw: any[],
    rawS: any[],
    filters: typeof albumFilters
  ) {
    const yearOk = (item: any) => {
      if (!item.release_date) return true;
      return parseInt(item.release_date.slice(0, 4)) >= filters.minReleaseYear;
    };
    setAlbums(raw.filter(yearOk).slice(0, filters.maxResults));
    setSingles(rawS.filter(yearOk).slice(0, filters.maxResults));
  }

  // Re-runs generate_config.sh on the server so config.lua edits are picked
  // up live, then applies the UI filter values and re-fetches albums.
  async function handleApplyFilters() {
    const prev = albumFilters;
    const next = pendingAlbumFilters;
    setAlbumFilters(next);
    albumFiltersRef.current = next;
    setShowFilters(false);
    setSelectedAlbum(null);
    setTracks([]);
    if (next.albumType === "single") setActiveDiscTab("singles");
    else setActiveDiscTab("albums");

    if (!artistId) return;

    // If only maxResults or minReleaseYear changed AND we already have enough
    // raw data, just filter locally — no server call needed.
    const typeChanged = next.albumType !== prev.albumType;
    const needsMore =
      next.maxResults > rawAlbums.length || next.maxResults > rawSingles.length;

    if (!typeChanged && !needsMore) {
      applyFiltersLocally(rawAlbums, rawSingles, next);
      return;
    }

    // Otherwise fetch fresh from server (albumType changed or need more items)
    setLoading(true);
    try {
      const albumResult = await getAlbums(artistId, next);
      const newRawAlbums = albumResult.items;
      const newRawSingles = albumResult.singles ?? [];
      setRawAlbums(newRawAlbums);
      setRawSingles(newRawSingles);
      applyFiltersLocally(newRawAlbums, newRawSingles, next);
      setAlbumsRateLimited(albumResult.rateLimited ?? false);
      setAlbumDebug(
        newRawAlbums.length === 0 && newRawSingles.length === 0
          ? JSON.stringify(albumResult.raw, null, 2)
          : null
      );
      // Only re-fetch playlists if maxResults increased (need more) or type changed
      if (typeChanged || next.maxResults > playlists.length) {
        const artistData = await getArtist(artistId);
        const playlistsData = await getArtistPlaylists(
          artistId,
          artistData.name,
          next.maxResults
        ).catch(() => []);
        setPlaylists(playlistsData);
      } else {
        setPlaylists((prev) => prev.slice(0, next.maxResults));
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  function handleResetFilters() {
    getConfig().then((config) => {
      setPendingAlbumFilters({
        albumType: config.albumType,
        minReleaseYear: config.minReleaseYear,
        maxResults: config.maxResults,
      });
    });
  }

  async function handleSelectAlbum(album: any) {
    if (selectedAlbum?.id === album.id) {
      setSelectedAlbum(null);
      setTracks([]);
      return;
    }
    setSelectedAlbum(album);
    setLoadingTracks(true);
    try {
      const t = await getAlbumTracks(album.id);
      setTracks(t);
    } catch (e: any) {
      setError(e.message);
    }
    setLoadingTracks(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-12">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div className="text-center">
          <button
            onClick={handleGoHome}
            className="flex items-center justify-center gap-2 mb-1 mx-auto hover:opacity-80 transition-opacity"
          >
            <svg
              className="w-7 h-7 text-green-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
            <h1 className="text-4xl font-bold text-green-400">Music App</h1>
          </button>
          <p className="text-gray-400 mt-1">Search for any artist on Spotify</p>
        </div>

        {/* Search + Filter row — hidden when an artist card is showing (inline search takes over) */}
        {!artist && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <input
                className="w-full bg-gray-800 rounded-lg pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
                placeholder="Search for an artist..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => dropdown.length > 0 && setShowDropdown(true)}
                onBlur={() => {
                  if (!mouseInDropdown.current) setShowDropdown(false);
                }}
              />
              {showDropdown && dropdown.length > 0 && (
                <div
                  className="absolute z-10 w-full mt-1 bg-gray-800 rounded-xl shadow-lg overflow-hidden"
                  onMouseEnter={() => {
                    mouseInDropdown.current = true;
                  }}
                  onMouseLeave={() => {
                    mouseInDropdown.current = false;
                  }}
                >
                  {dropdown.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleSelectArtist(a.id)}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-700 active:scale-95 transition-all text-left"
                    >
                      {a.images?.[0]?.url ? (
                        <img
                          src={a.images[0].url}
                          alt={a.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-gray-400 text-xs shrink-0">
                          ?
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setPendingAlbumFilters(albumFilters);
                setShowFilters((v) => !v);
              }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                showFilters
                  ? "bg-green-400 text-black"
                  : "bg-gray-800 text-white hover:bg-gray-700"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4h18M7 8h10M11 12h2M9 16h6"
                />
              </svg>
              Filters
            </button>
          </div>
        )}

        {/* Filter panel — only shown when no artist loaded (top-level position) */}
        {showFilters && !artist && (
          <div className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-5">
            <h3 className="text-lg font-semibold">Filters</h3>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">Type</label>
              <div className="flex flex-wrap gap-2">
                {["both", "album", "single"].map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      setPendingAlbumFilters((f) => ({
                        ...f,
                        albumType: type,
                      }))
                    }
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                      pendingAlbumFilters.albumType === type
                        ? "bg-green-400 text-black"
                        : "bg-gray-700 text-white hover:bg-gray-600"
                    }`}
                  >
                    {type === "both"
                      ? "All"
                      : type === "album"
                      ? "Albums only"
                      : "Singles/EPs only"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-400">
                  Minimum release year
                </label>
                <span className="text-sm font-medium text-green-400">
                  {pendingAlbumFilters.minReleaseYear}
                </span>
              </div>
              <input
                type="range"
                min={1950}
                max={currentYear}
                value={pendingAlbumFilters.minReleaseYear}
                onChange={(e) =>
                  setPendingAlbumFilters((f) => ({
                    ...f,
                    minReleaseYear: Number(e.target.value),
                  }))
                }
                className="w-full accent-green-400"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1950</span>
                <span>{currentYear}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-400">Max results</label>
                <span className="text-sm font-medium text-green-400">
                  {pendingAlbumFilters.maxResults}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={pendingAlbumFilters.maxResults}
                onChange={(e) =>
                  setPendingAlbumFilters((f) => ({
                    ...f,
                    maxResults: Number(e.target.value),
                  }))
                }
                className="w-full accent-green-400"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1</span>
                <span>50</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleApplyFilters}
                className="flex-1 bg-green-400 text-black font-semibold py-2 rounded-lg hover:bg-green-300 transition-all flex items-center justify-center gap-2"
              >
                Apply
              </button>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all text-sm"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-950/50 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-4">
            <div className="w-8 h-8 border-4 border-gray-700 border-t-green-400 rounded-full animate-spin" />
          </div>
        )}

        {artist && !loading && (
          <div className="flex flex-col gap-6">
            <div className="bg-gray-800 rounded-2xl">
              <div className="flex items-stretch">
                {/* Large artist image - left side */}
                {artist.images?.[0]?.url ? (
                  <img
                    src={artist.images[0].url}
                    alt={artist.name}
                    className="w-44 h-44 object-cover shrink-0 rounded-tl-2xl rounded-bl-2xl"
                  />
                ) : (
                  <div className="w-44 h-44 bg-gray-700 shrink-0 flex items-center justify-center rounded-tl-2xl rounded-bl-2xl">
                    <svg
                      className="w-16 h-16 text-gray-500"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                    </svg>
                  </div>
                )}
                {/* Right: name, Spotify link, genres, inline search */}
                <div className="flex-1 flex flex-col justify-between p-4 min-w-0">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold leading-tight truncate">
                      {artist.name}
                    </h2>
                    {artist.external_urls?.spotify && (
                      <a
                        href={artist.external_urls.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium text-green-400 border border-green-400/30 bg-green-400/10 px-2.5 py-1 rounded-full hover:bg-green-400/20 transition-all w-fit"
                      >
                        <svg
                          className="w-3 h-3"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                        </svg>
                        Open in Spotify
                      </a>
                    )}
                    {artist.genres?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {artist.genres.slice(0, 3).map((g: string) => (
                          <span
                            key={g}
                            className="bg-green-400/15 text-green-400 border border-green-400/30 text-xs font-medium px-2.5 py-1 rounded-full capitalize"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Inline search another artist + Filters */}
                  <div className="flex gap-2 mt-3">
                    <div className="relative flex-1">
                      <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                      </svg>
                      <input
                        className="w-full bg-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400"
                        placeholder="Search another artist..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() =>
                          dropdown.length > 0 && setShowDropdown(true)
                        }
                        onBlur={() => {
                          if (!mouseInDropdown.current) setShowDropdown(false);
                        }}
                      />
                      {showDropdown && dropdown.length > 0 && (
                        <div
                          className="absolute z-10 w-full mt-1 bg-gray-800 rounded-xl shadow-lg overflow-hidden"
                          onMouseEnter={() => {
                            mouseInDropdown.current = true;
                          }}
                          onMouseLeave={() => {
                            mouseInDropdown.current = false;
                          }}
                        >
                          {dropdown.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => handleSelectArtist(a.id)}
                              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-700 active:scale-95 transition-all text-left"
                            >
                              {a.images?.[0]?.url ? (
                                <img
                                  src={a.images[0].url}
                                  alt={a.name}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-gray-400 text-xs shrink-0">
                                  ?
                                </div>
                              )}
                              <p className="font-medium truncate text-sm">
                                {a.name}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setPendingAlbumFilters(albumFilters);
                        setShowFilters((v) => !v);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                        showFilters
                          ? "bg-green-400 text-black"
                          : "bg-gray-700 text-white hover:bg-gray-600"
                      }`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 4h18M7 8h10M11 12h2M9 16h6"
                        />
                      </svg>
                      Filters
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter panel — inline, below artist card */}
            {showFilters && (
              <div className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-5">
                <h3 className="text-lg font-semibold">Filters</h3>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-gray-400">Type</label>
                  <div className="flex flex-wrap gap-2">
                    {["both", "album", "single"].map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          setPendingAlbumFilters((f) => ({
                            ...f,
                            albumType: type,
                          }))
                        }
                        className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                          pendingAlbumFilters.albumType === type
                            ? "bg-green-400 text-black"
                            : "bg-gray-700 text-white hover:bg-gray-600"
                        }`}
                      >
                        {type === "both"
                          ? "All"
                          : type === "album"
                          ? "Albums only"
                          : "Singles/EPs only"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">
                      Minimum release year
                    </label>
                    <span className="text-sm font-medium text-green-400">
                      {pendingAlbumFilters.minReleaseYear}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1950}
                    max={currentYear}
                    value={pendingAlbumFilters.minReleaseYear}
                    onChange={(e) =>
                      setPendingAlbumFilters((f) => ({
                        ...f,
                        minReleaseYear: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-green-400"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>1950</span>
                    <span>{currentYear}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">Max results</label>
                    <span className="text-sm font-medium text-green-400">
                      {pendingAlbumFilters.maxResults}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={pendingAlbumFilters.maxResults}
                    onChange={(e) =>
                      setPendingAlbumFilters((f) => ({
                        ...f,
                        maxResults: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-green-400"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>1</span>
                    <span>50</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleApplyFilters}
                    className="flex-1 bg-green-400 text-black font-semibold py-2 rounded-lg hover:bg-green-300 transition-all flex items-center justify-center gap-2"
                  >
                    Apply
                  </button>
                  <button
                    onClick={handleResetFilters}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all text-sm"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}

            <div className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="text-lg font-semibold">Discography</h3>

              {/* Tab bar */}
              <div className="flex gap-2 flex-wrap">
                {albumFilters.albumType !== "single" && (
                  <button
                    onClick={() => setActiveDiscTab("albums")}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      activeDiscTab === "albums"
                        ? "bg-white text-black"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Albums
                  </button>
                )}
                {albumFilters.albumType !== "album" && (
                  <button
                    onClick={() => setActiveDiscTab("singles")}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      activeDiscTab === "singles"
                        ? "bg-white text-black"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Singles & EPs
                  </button>
                )}
                <span className="ml-auto text-xs text-gray-400 self-center">
                  {activeDiscTab === "albums" ? albums.length : singles.length}{" "}
                  result
                  {(activeDiscTab === "albums"
                    ? albums.length
                    : singles.length) !== 1
                    ? "s"
                    : ""}
                </span>
              </div>

              {/* Rate limit warning — shown once, above all tab content */}
              {albumsRateLimited && (
                <div className="flex items-center gap-2 bg-yellow-950/50 border border-yellow-700 text-yellow-400 rounded-lg px-3 py-2 text-xs">
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                  Rate limited by Spotify — results may be incomplete. Try again
                  later.
                </div>
              )}

              {/* Albums tab */}
              {activeDiscTab === "albums" && (
                <div className="flex flex-col gap-1">
                  {albums.length === 0 && (
                    <p className="text-gray-400 text-sm py-2">
                      {albumsRateLimited
                        ? "No albums available right now."
                        : "No albums match your current filters."}
                    </p>
                  )}
                  {albums.map((album) => (
                    <div key={album.id} id={`album-${album.id}`}>
                      <button
                        onClick={() => handleSelectAlbum(album)}
                        className="flex items-center gap-4 w-full p-2 rounded-xl hover:bg-gray-700 active:scale-95 transition-all text-left"
                      >
                        {album.images?.[0]?.url && (
                          <img
                            src={album.images[0].url}
                            alt={album.name}
                            className="w-12 h-12 rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{album.name}</p>
                          <p className="text-sm text-gray-400">
                            {album.release_date
                              ? album.release_date.slice(0, 4)
                              : ""}
                            {album.total_tracks != null &&
                              ` · ${album.total_tracks} tracks`}
                          </p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                            selectedAlbum?.id === album.id ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {selectedAlbum?.id === album.id && (
                        <div className="mt-2 ml-4 flex flex-col gap-1">
                          {loadingTracks && (
                            <div className="flex justify-center py-2">
                              <div className="w-5 h-5 border-2 border-gray-700 border-t-green-400 rounded-full animate-spin" />
                            </div>
                          )}
                          {!loadingTracks &&
                            tracks.map((track, i) => (
                              <div
                                key={track.id}
                                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-700 transition"
                              >
                                <span className="text-gray-500 text-sm w-5">
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">
                                    {track.name}
                                  </p>
                                  {track.explicit && (
                                    <span className="shrink-0 text-xs bg-gray-600 text-gray-300 px-1 rounded">
                                      E
                                    </span>
                                  )}
                                </div>
                                <span className="text-gray-400 text-sm">
                                  {formatDuration(track.duration_ms)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Singles & EPs tab */}
              {activeDiscTab === "singles" && (
                <div className="flex flex-col gap-1">
                  {singles.length === 0 && (
                    <p className="text-gray-400 text-sm py-2">
                      {albumsRateLimited
                        ? "No singles available right now."
                        : "No singles match your current filters."}
                    </p>
                  )}
                  {singles.map((album) => (
                    <div key={album.id} id={`album-${album.id}`}>
                      <button
                        onClick={() => handleSelectAlbum(album)}
                        className="flex items-center gap-4 w-full p-2 rounded-xl hover:bg-gray-700 active:scale-95 transition-all text-left"
                      >
                        {album.images?.[0]?.url && (
                          <img
                            src={album.images[0].url}
                            alt={album.name}
                            className="w-12 h-12 rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{album.name}</p>
                          <p className="text-sm text-gray-400">
                            {album.release_date
                              ? album.release_date.slice(0, 4)
                              : ""}
                            {album.total_tracks != null &&
                              ` · ${album.total_tracks} tracks`}
                          </p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                            selectedAlbum?.id === album.id ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {selectedAlbum?.id === album.id && (
                        <div className="mt-2 ml-4 flex flex-col gap-1">
                          {loadingTracks && (
                            <div className="flex justify-center py-2">
                              <div className="w-5 h-5 border-2 border-gray-700 border-t-green-400 rounded-full animate-spin" />
                            </div>
                          )}
                          {!loadingTracks &&
                            tracks.map((track, i) => (
                              <div
                                key={track.id}
                                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-700 transition"
                              >
                                <span className="text-gray-500 text-sm w-5">
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">
                                    {track.name}
                                  </p>
                                  {track.explicit && (
                                    <span className="shrink-0 text-xs bg-gray-600 text-gray-300 px-1 rounded">
                                      E
                                    </span>
                                  )}
                                </div>
                                <span className="text-gray-400 text-sm">
                                  {formatDuration(track.duration_ms)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Featured In</h3>
                <span className="text-xs text-gray-400">
                  {playlists.length} playlist{playlists.length !== 1 ? "s" : ""}
                </span>
              </div>

              {playlists.length === 0 && (
                <p className="text-gray-400 text-sm">No playlists found.</p>
              )}

              {playlists.map((playlist: any) => (
                <a
                  key={playlist.id}
                  href={playlist.external_urls?.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-2 rounded-xl hover:bg-gray-700 active:scale-95 transition-all"
                >
                  {playlist.images?.[0]?.url ? (
                    <img
                      src={playlist.images[0].url}
                      alt={playlist.name}
                      className="w-12 h-12 rounded shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-700 shrink-0 flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-gray-500"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm flex items-center gap-2">
                      {playlist.name}
                      {playlist.owner?.id === "spotify" && (
                        <span className="shrink-0 text-xs bg-green-400/15 text-green-400 border border-green-400/30 px-1.5 py-0.5 rounded-full font-medium">
                          Spotify
                        </span>
                      )}
                    </p>
                    {playlist.description && (
                      <p
                        className="text-xs text-gray-400 truncate mt-0.5"
                        dangerouslySetInnerHTML={{
                          __html: playlist.description,
                        }}
                      />
                    )}
                    {playlist.owner?.display_name && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        by {playlist.owner.display_name}
                        {playlist.tracks?.total != null &&
                          ` · ${playlist.tracks.total} tracks`}
                      </p>
                    )}
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-500 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
