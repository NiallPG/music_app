import { useEffect, useState, useRef } from "react";

const SERVER_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type SpotifyImage = {
  url: string;
};

type Artist = {
  id: string;
  name: string;
  followers?: { total?: number };
  genres?: string[];
  images?: SpotifyImage[];
};

type Album = {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  images?: SpotifyImage[];
};

type Track = {
  id?: string;
  name: string;
  duration_ms: number;
};

type ListeningPlanItem = {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  image: string | null;
  score: number;
  reasons: string[];
};

type ListeningPlan = {
  name: string;
  description: string;
  source: string;
  rules: { key: string; label: string; points: number }[];
  items: ListeningPlanItem[];
};

type ArtistSearchResult = {
  items: Artist[];
  mode?: "demo" | "spotify";
  warning?: string;
};

async function searchArtists(query: string) {
  const res = await fetch(
    `${SERVER_URL}/api/search/artists?q=${encodeURIComponent(query)}`
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Artist search failed.");
  }

  return {
    items: (data.items ?? []).filter(Boolean) as Artist[],
    mode: data.mode,
    warning: data.warning,
  } as ArtistSearchResult;
}

async function getArtistAndAlbums(id: string) {
  const [artistRes, albumsRes] = await Promise.all([
    fetch(`${SERVER_URL}/api/artist/${id}`),
    fetch(`${SERVER_URL}/api/artist/${id}/albums`),
  ]);
  const artist = await artistRes.json();
  const albumsData = await albumsRes.json();
  return { artist: artist as Artist, albums: (albumsData.items ?? []) as Album[] };
}

async function getAlbumTracks(id: string) {
  const res = await fetch(`${SERVER_URL}/api/album/${id}/tracks`);
  const data = await res.json();
  return (data.items ?? []) as Track[];
}

async function getListeningPlan(id: string) {
  const res = await fetch(`${SERVER_URL}/api/artist/${id}/listening-plan`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Unable to load the Lua listening plan.");
  }

  return data as ListeningPlan;
}

function formatDuration(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${m}:${s}`;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [dropdown, setDropdown] = useState<Artist[]>([]);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [listeningPlan, setListeningPlan] = useState<ListeningPlan | null>(null);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [searchingArtists, setSearchingArtists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSearchedRef = useRef(false);
  const mouseInDropdown = useRef(false);
  const artistGenres = artist?.genres ?? [];

  useEffect(() => {
    if (!query.trim()) {
      setDropdown([]);
      setShowDropdown(false);
      setSearchWarning(null);
      hasSearchedRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = hasSearchedRef.current ? 0 : 500;

    debounceRef.current = setTimeout(async () => {
      hasSearchedRef.current = true;
      setSearchingArtists(true);
      setError(null);
      try {
        const results = await searchArtists(query);
        setDropdown(results.items);
        setSearchWarning(results.warning ?? null);
        setShowDropdown(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Artist search failed.");
      } finally {
        setSearchingArtists(false);
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
    setListeningPlan(null);
    setLoadingPlan(true);
    try {
      const [{ artist, albums }, plan] = await Promise.all([
        getArtistAndAlbums(id),
        getListeningPlan(id),
      ]);
      setArtist(artist);
      setAlbums(albums);
      setListeningPlan(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Artist lookup failed.");
    }
    setLoadingPlan(false);
    setLoading(false);
  }

  async function handleSelectAlbum(album: Album) {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Track lookup failed.");
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

          {showDropdown && (dropdown.length > 0 || searchingArtists || query.trim()) && (
            <div
              className="absolute z-10 w-full mt-1 bg-gray-800 rounded-xl shadow-lg overflow-hidden"
              onMouseEnter={() => {
                mouseInDropdown.current = true;
              }}
              onMouseLeave={() => {
                mouseInDropdown.current = false;
              }}
            >
              {searchingArtists && (
                <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-400">
                  <div className="h-4 w-4 rounded-full border-2 border-gray-700 border-t-green-400 animate-spin" />
                  Searching artists...
                </div>
              )}

              {!searchingArtists && searchWarning && (
                <div className="border-b border-gray-700 px-4 py-2 text-xs text-amber-300">
                  Demo mode: Spotify credentials need to be replaced for live data.
                </div>
              )}

              {!searchingArtists && dropdown.length === 0 && query.trim() && (
                <div className="px-4 py-3 text-sm text-gray-400">
                  No matching artists yet.
                </div>
              )}

              {!searchingArtists && dropdown.map((a) => (
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
                {artistGenres.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {artistGenres.map((g) => (
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

            <section className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-green-400">
                  Lua workflow
                </p>
                <h3 className="text-lg font-semibold">
                  {listeningPlan?.name ?? "Loading listening plan"}
                </h3>
                <p className="text-sm text-gray-400">
                  {listeningPlan?.description ??
                    "Scoring albums with workflows/listening_rules.lua"}
                </p>
              </div>

              {loadingPlan && (
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-700 border-t-green-400 rounded-full animate-spin" />
                  Building recommendations from Lua rules...
                </div>
              )}

              {listeningPlan && (
                <div className="grid gap-3">
                  {listeningPlan.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 rounded-xl bg-gray-900/70 p-3"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-400 text-sm font-bold text-black">
                        {index + 1}
                      </span>
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-12 w-12 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-sm text-gray-400">
                          {item.album_type.charAt(0).toUpperCase() +
                            item.album_type.slice(1)}{" "}
                          · {item.release_date.slice(0, 4)} · Score {item.score}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {item.reasons.join(" + ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

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
