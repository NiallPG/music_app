export const demoArtists = [
  {
    id: "demo-caroline-polachek",
    name: "Caroline Polachek",
    followers: { total: 1120000 },
    genres: ["art pop", "electropop", "indie pop"],
    images: [
      {
        url: "https://i.scdn.co/image/ab6761610000e5ebc9a8debe7d159376f9e5d80d",
      },
    ],
  },
  {
    id: "demo-carly-rae-jepsen",
    name: "Carly Rae Jepsen",
    followers: { total: 5300000 },
    genres: ["dance pop", "electropop", "pop"],
    images: [
      {
        url: "https://i.scdn.co/image/ab6761610000e5eb72f6b7b30a25591f2cf4fd1f",
      },
    ],
  },
  {
    id: "demo-cage-the-elephant",
    name: "Cage The Elephant",
    followers: { total: 4700000 },
    genres: ["modern rock", "garage rock", "indie rock"],
    images: [
      {
        url: "https://i.scdn.co/image/ab6761610000e5ebc44d348bc1a6d8b61868f5e7",
      },
    ],
  },
  {
    id: "demo-camila-cabello",
    name: "Camila Cabello",
    followers: { total: 33000000 },
    genres: ["dance pop", "latin pop", "pop"],
    images: [
      {
        url: "https://i.scdn.co/image/ab6761610000e5ebf0f4ef4b12d24c84f1b0df4f",
      },
    ],
  },
];

export const demoAlbumsByArtist = {
  "demo-caroline-polachek": [
    {
      id: "demo-desire",
      name: "Desire, I Want To Turn Into You",
      album_type: "album",
      release_date: "2023-02-14",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b2734e00f2959c6f8ae5aa7c9a9e",
        },
      ],
    },
    {
      id: "demo-pang",
      name: "Pang",
      album_type: "album",
      release_date: "2019-10-18",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b273c4a05612d98c1b7d808f8f12",
        },
      ],
    },
    {
      id: "demo-bunny",
      name: "Bunny Is A Rider",
      album_type: "single",
      release_date: "2021-07-14",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b2734818f6108f913ac8e1fb30ff",
        },
      ],
    },
  ],
  "demo-carly-rae-jepsen": [
    {
      id: "demo-loneliest",
      name: "The Loneliest Time",
      album_type: "album",
      release_date: "2022-10-21",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b273b7a2db6f6b32f68884c7dded",
        },
      ],
    },
    {
      id: "demo-emotion",
      name: "E MO TION",
      album_type: "album",
      release_date: "2015-06-24",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b2735705f33ef0dc9e078a345a53",
        },
      ],
    },
  ],
  "demo-cage-the-elephant": [
    {
      id: "demo-melophobia",
      name: "Melophobia",
      album_type: "album",
      release_date: "2013-10-08",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b273f9e3f9f3df2d291db891a663",
        },
      ],
    },
    {
      id: "demo-social-cues",
      name: "Social Cues",
      album_type: "album",
      release_date: "2019-04-19",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b27308ff52e0d1c6d91cc4f83fd4",
        },
      ],
    },
  ],
  "demo-camila-cabello": [
    {
      id: "demo-camila",
      name: "Camila",
      album_type: "album",
      release_date: "2018-01-12",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b2731456fdb0d8d7f8569c2c4fd9",
        },
      ],
    },
    {
      id: "demo-havana",
      name: "Havana",
      album_type: "single",
      release_date: "2017-08-03",
      images: [
        {
          url: "https://i.scdn.co/image/ab67616d0000b273a307c9350b2fbc6d3d488450",
        },
      ],
    },
  ],
};

export const demoTracksByAlbum = {
  "demo-desire": [
    { id: "demo-welcome", name: "Welcome To My Island", duration_ms: 232000 },
    { id: "demo-blood", name: "Blood And Butter", duration_ms: 268000 },
    { id: "demo-smoke", name: "Smoke", duration_ms: 177000 },
  ],
  "demo-pang": [
    { id: "demo-door", name: "Door", duration_ms: 319000 },
    {
      id: "demo-so-hot",
      name: "So Hot You're Hurting My Feelings",
      duration_ms: 183000,
    },
  ],
  "demo-bunny": [
    { id: "demo-bunny-track", name: "Bunny Is A Rider", duration_ms: 196000 },
  ],
  "demo-loneliest": [
    { id: "demo-surrender", name: "Surrender My Heart", duration_ms: 174000 },
    { id: "demo-beach", name: "Beach House", duration_ms: 149000 },
  ],
  "demo-emotion": [
    { id: "demo-run-away", name: "Run Away With Me", duration_ms: 251000 },
    { id: "demo-emotion-track", name: "E MO TION", duration_ms: 197000 },
  ],
  "demo-melophobia": [
    { id: "demo-spiderhead", name: "Spiderhead", duration_ms: 222000 },
    { id: "demo-cigarette", name: "Cigarette Daydreams", duration_ms: 208000 },
  ],
  "demo-social-cues": [
    { id: "demo-cues", name: "Social Cues", duration_ms: 219000 },
    { id: "demo-ready", name: "Ready To Let Go", duration_ms: 187000 },
  ],
  "demo-camila": [
    { id: "demo-never", name: "Never Be the Same", duration_ms: 226000 },
    { id: "demo-real", name: "Real Friends", duration_ms: 214000 },
  ],
  "demo-havana": [
    { id: "demo-havana-track", name: "Havana", duration_ms: 217000 },
  ],
};

export const demoTopTracksByArtist = {
  "demo-caroline-polachek": [
    {
      id: "demo-tt-welcome",
      name: "Welcome To My Island",
      duration_ms: 232000,
      explicit: false,
      album: {
        id: "demo-desire",
        name: "Desire, I Want To Turn Into You",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b2734e00f2959c6f8ae5aa7c9a9e",
          },
        ],
      },
    },
    {
      id: "demo-tt-bunny",
      name: "Bunny Is A Rider",
      duration_ms: 196000,
      explicit: false,
      album: {
        id: "demo-bunny",
        name: "Bunny Is A Rider",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b2734e00f2959c6f8ae5aa7c9a9e",
          },
        ],
      },
    },
    {
      id: "demo-tt-smoke",
      name: "Smoke",
      duration_ms: 177000,
      explicit: false,
      album: {
        id: "demo-desire",
        name: "Desire, I Want To Turn Into You",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b2734e00f2959c6f8ae5aa7c9a9e",
          },
        ],
      },
    },
    {
      id: "demo-tt-door",
      name: "Door",
      duration_ms: 319000,
      explicit: false,
      album: {
        id: "demo-pang",
        name: "Pang",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b2734e00f2959c6f8ae5aa7c9a9e",
          },
        ],
      },
    },
    {
      id: "demo-tt-sohot",
      name: "So Hot You're Hurting My Feelings",
      duration_ms: 183000,
      explicit: false,
      album: {
        id: "demo-pang",
        name: "Pang",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b2734e00f2959c6f8ae5aa7c9a9e",
          },
        ],
      },
    },
  ],
  "demo-carly-rae-jepsen": [
    {
      id: "demo-tt-runaway",
      name: "Run Away With Me",
      duration_ms: 251000,
      explicit: false,
      album: {
        id: "demo-emotion",
        name: "E•MO•TION",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273b14f39de36d1c0e5bbb89f31",
          },
        ],
      },
    },
    {
      id: "demo-tt-emotion",
      name: "E•MO•TION",
      duration_ms: 197000,
      explicit: false,
      album: {
        id: "demo-emotion",
        name: "E•MO•TION",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273b14f39de36d1c0e5bbb89f31",
          },
        ],
      },
    },
    {
      id: "demo-tt-surrender",
      name: "Surrender My Heart",
      duration_ms: 174000,
      explicit: false,
      album: {
        id: "demo-loneliest",
        name: "The Loneliest Time",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273b14f39de36d1c0e5bbb89f31",
          },
        ],
      },
    },
    {
      id: "demo-tt-beach",
      name: "Beach House",
      duration_ms: 149000,
      explicit: false,
      album: {
        id: "demo-loneliest",
        name: "The Loneliest Time",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273b14f39de36d1c0e5bbb89f31",
          },
        ],
      },
    },
  ],
  "demo-cage-the-elephant": [
    {
      id: "demo-tt-spiderhead",
      name: "Spiderhead",
      duration_ms: 222000,
      explicit: false,
      album: {
        id: "demo-melophobia",
        name: "Melophobia",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273e7a8e7d1f9f3b8a1c9a3e4b2",
          },
        ],
      },
    },
    {
      id: "demo-tt-cigarette",
      name: "Cigarette Daydreams",
      duration_ms: 208000,
      explicit: false,
      album: {
        id: "demo-melophobia",
        name: "Melophobia",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273e7a8e7d1f9f3b8a1c9a3e4b2",
          },
        ],
      },
    },
    {
      id: "demo-tt-social-cues",
      name: "Social Cues",
      duration_ms: 219000,
      explicit: false,
      album: {
        id: "demo-social-cues",
        name: "Social Cues",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273e7a8e7d1f9f3b8a1c9a3e4b2",
          },
        ],
      },
    },
    {
      id: "demo-tt-ready",
      name: "Ready To Let Go",
      duration_ms: 187000,
      explicit: false,
      album: {
        id: "demo-social-cues",
        name: "Social Cues",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273e7a8e7d1f9f3b8a1c9a3e4b2",
          },
        ],
      },
    },
  ],
  "demo-camila-cabello": [
    {
      id: "demo-tt-havana",
      name: "Havana",
      duration_ms: 217000,
      explicit: false,
      album: {
        id: "demo-havana",
        name: "Havana",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273f0b9a4ecdde8a1b9e9c3d8e5",
          },
        ],
      },
    },
    {
      id: "demo-tt-never",
      name: "Never Be the Same",
      duration_ms: 226000,
      explicit: false,
      album: {
        id: "demo-camila",
        name: "Camila",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273f0b9a4ecdde8a1b9e9c3d8e5",
          },
        ],
      },
    },
    {
      id: "demo-tt-real",
      name: "Real Friends",
      duration_ms: 214000,
      explicit: false,
      album: {
        id: "demo-camila",
        name: "Camila",
        images: [
          {
            url: "https://i.scdn.co/image/ab67616d0000b273f0b9a4ecdde8a1b9e9c3d8e5",
          },
        ],
      },
    },
  ],
};

export function getDemoTopTracks(artistId) {
  return demoTopTracksByArtist[artistId] ?? [];
}

export function searchDemoArtists(query) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) return [];

  return demoArtists.filter((artist) =>
    artist.name.toLowerCase().includes(normalized)
  );
}

export function getDemoArtist(id) {
  return demoArtists.find((artist) => artist.id === id) ?? null;
}

export function getDemoAlbums(id) {
  return demoAlbumsByArtist[id] ?? [];
}

export function getDemoTracks(id) {
  return demoTracksByAlbum[id] ?? [];
}
