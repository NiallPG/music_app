import { useEffect, useState, useRef } from "react";

const SERVER_URL = "https://k7sk7w-3001.csb.app";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${SERVER_URL}/api/token`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  return cachedToken as string;
}

async function searchArtists(query: string) {
  const token = await getToken();
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(
      query
    )}&type=artist&limit=6`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return (data.artists?.items ?? []).filter((a: any) => a);
}

async function getArtistAndAlbums(id: string) {
  const [artistRes, albumsRes] = await Promise.all([
    fetch(`${SERVER_URL}/api/artist/${id}`),
    fetch(`${SERVER_URL}/api/artist/${id}/albums`),
  ]);
  const artist = await artistRes.json();
  const albumsData = await albumsRes.json();
  return { artist, albums: albumsData.items ?? [] };
}

async function getAlbumTracks(id: string) {
  const res = await fetch(`${SERVER_URL}/api/album/${id}/tracks`);
  const data = await res.json();
  return data.items ?? [];
}

function formatDuration(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${m}:${s}`;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [dropdown, setDropdown] = useState<any[]>([]);
  const [artist, setArtist] = useState<any>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSearchedRef = useRef(false);
  const mouseInDropdown = useRef(false);

  useEffect(() => {
    if (!query.trim()) {
      setDropdown([]);
      setShowDropdown(false);
      hasSearchedRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = hasSearchedRef.current ? 0 : 500;

    debounceRef.current = setTimeout(async () => {
      hasSearchedRef.current = true;
      try {
        const results = await searchArtists(query);
        setDropdown(results);
        setShowDropdown(true);
      } catch (e: any) {
        setError(e.message);
      }
    }, delay);

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
    try {
      const { artist, albums } = await getArtistAndAlbums(id);
      setArtist(artist);
      setAlbums(albums);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
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

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-12">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg className="w-7 h-7 text-green-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
            <h1 className="text-4xl font-bold text-green-400">Music App</h1>
          </div>
          <p className="text-gray-400 mt-1">Search for any artist on Spotify</p>
        </div>

        <div className="relative">
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
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-gray-400 text-xs">
                      ?
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-sm text-gray-400">
                      {a.followers?.total?.toLocaleString()} followers
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-950/50 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
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
              <div>
                <h2 className="text-2xl font-bold">{artist.name}</h2>
                {artist.followers?.total != null && (
                  <p className="text-sm text-gray-400 mt-1">
                    {artist.followers.total.toLocaleString()} followers
                  </p>
                )}
                {artist.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
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
              <h3 className="text-lg font-semibold">Albums</h3>
              {albums.length === 0 && (
                <p className="text-gray-400 text-sm">
                  No albums found for this artist.
                </p>
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
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {track.name}
                              </p>
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
