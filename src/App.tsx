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
): Promise<{ items: any[]; raw: any }> {
  const params = new URLSearchParams({
    albumType: filters.albumType,
    minReleaseYear: String(filters.minReleaseYear),
    maxResults: String(filters.maxResults),
  });
  const res = await fetch(`${SERVER_URL}/api/artist/${id}/albums?${params}`);
  if (!res.ok) throw new Error("Failed to fetch albums");
  const data = await res.json();
  let items: any[];
  if (Array.isArray(data)) items = data;
  else if (Array.isArray(data.items)) items = data.items;
  else if (Array.isArray(data.albums)) items = data.albums;
  else items = [];
  return { items, raw: data };
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

  async function handleSelectArtist(id: string) {
    setShowDropdown(false);
    setQuery("");
    setLoading(true);
    setError(null);
    setSelectedAlbum(null);
    setTracks([]);
    setAlbumDebug(null);
    setArtistId(id);
    try {
      const [artistData, albumResult] = await Promise.all([
        getArtist(id),
        getAlbums(id, albumFiltersRef.current),
      ]);
      setArtist(artistData);
      setAlbums(albumResult.items);
      if (albumResult.items.length === 0) {
        setAlbumDebug(JSON.stringify(albumResult.raw, null, 2));
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  // Re-runs generate_config.sh on the server so config.lua edits are picked
  // up live, then applies the UI filter values and re-fetches albums.
  async function handleApplyFilters() {
    setAlbumFilters(pendingAlbumFilters);
    albumFiltersRef.current = pendingAlbumFilters;
    setShowFilters(false);
    setSelectedAlbum(null);
    setTracks([]);

    if (artistId) {
      setLoading(true);
      try {
        const albumResult = await getAlbums(artistId, pendingAlbumFilters);
        setAlbums(albumResult.items);
        setAlbumDebug(
          albumResult.items.length === 0
            ? JSON.stringify(albumResult.raw, null, 2)
            : null
        );
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    }
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
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg
              className="w-7 h-7 text-green-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
            <h1 className="text-4xl font-bold text-green-400">Music App</h1>
          </div>
          <p className="text-gray-400 mt-1">Search for any artist on Spotify</p>
        </div>

        {/* Search + Filter row */}
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

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Filters</h3>
              <span className="text-xs text-gray-400">
                Defaults from config.lua
              </span>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-green-400 uppercase tracking-wide">
                Albums & Singles
              </h4>

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
                        ? "Albums & Singles"
                        : type === "album"
                        ? "Albums only"
                        : "Singles only"}
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
            <div className="flex items-center gap-6 bg-gray-800 rounded-2xl p-6">
              {artist.images?.[0]?.url && (
                <img
                  src={artist.images[0].url}
                  alt={artist.name}
                  className="w-28 h-28 rounded-full object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold">{artist.name}</h2>
                {artist.followers?.total != null && (
                  <p className="text-sm text-gray-400 mt-1">
                    {artist.followers.total.toLocaleString()} followers
                  </p>
                )}
                {artist.popularity != null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Popularity</span>
                      <span className="text-xs text-gray-400">
                        {artist.popularity}/100
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-green-400 h-1.5 rounded-full"
                        style={{ width: `${artist.popularity}%` }}
                      />
                    </div>
                  </div>
                )}
                {artist.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {artist.genres.map((g: string) => (
                      <span
                        key={g}
                        className="bg-green-400 text-black text-xs font-semibold px-2 py-1 rounded-full"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Albums</h3>
                <span className="text-xs text-gray-400">
                  {albums.length} result{albums.length !== 1 ? "s" : ""}
                </span>
              </div>

              {albums.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-gray-400 text-sm">
                    No albums match your current filters. Try adjusting the
                    release year or type.
                  </p>
                  {albumDebug && (
                    <pre className="text-xs text-yellow-400 bg-gray-900 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                      {albumDebug}
                    </pre>
                  )}
                </div>
              )}

              {albums.map((album) => (
                <div key={album.id}>
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
                        {album.album_type.charAt(0).toUpperCase() +
                          album.album_type.slice(1)}{" "}
                        · {album.release_date.slice(0, 4)}
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
          </div>
        )}
      </div>
    </main>
  );
}
