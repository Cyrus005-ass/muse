export type StreamProfile = "auto" | "data_saver" | "high";

export type CatalogItem = {
  id: string;
  title: string;
  type: "film" | "documentaire" | "serie" | "court-metrage";
  year: number;
  status: "published" | "draft" | "pending_review";
  synopsis: string;
  duration: string;
  genres: string[];
  moods: string[];
  regions: string[];
  score: number;
  hlsUrl: string;
};

export type StreamProfilePayload = {
  profile: StreamProfile;
  maxResolution: "480p" | "720p" | "1080p";
  maxBitrateKbps: number;
  preloadSeconds: number;
  hlsUrl: string;
};

const demoHls = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

const catalog: CatalogItem[] = [
  {
    id: "film-001",
    title: "Origines",
    type: "film",
    year: 2024,
    status: "published",
    synopsis: "Un recit visuel sur la creation et la transmission.",
    duration: "1h42",
    genres: ["Auteur", "Drame"],
    moods: ["intense", "reflexif"],
    regions: ["afrique-ouest", "diaspora"],
    score: 98,
    hlsUrl: demoHls
  },
  {
    id: "doc-001",
    title: "Regards Croises",
    type: "documentaire",
    year: 2025,
    status: "published",
    synopsis: "Une enquete intime entre memoire, ville et diaspora.",
    duration: "52 min",
    genres: ["Documentaire", "Societe"],
    moods: ["reflexif", "inspirant"],
    regions: ["afrique-centrale", "diaspora"],
    score: 95,
    hlsUrl: demoHls
  },
  {
    id: "serie-001",
    title: "Atelier Noir",
    type: "serie",
    year: 2026,
    status: "draft",
    synopsis: "Une serie nerveuse sur les coulisses d'un studio.",
    duration: "6 episodes",
    genres: ["Serie", "Thriller"],
    moods: ["intense", "sombre"],
    regions: ["afrique-ouest"],
    score: 92,
    hlsUrl: demoHls
  },
  {
    id: "short-010",
    title: "Nuit Rouge",
    type: "court-metrage",
    year: 2025,
    status: "pending_review",
    synopsis: "Un film court sur la rage de vivre et la musique des rues.",
    duration: "28 min",
    genres: ["Court", "Urbain"],
    moods: ["intense", "electrique"],
    regions: ["afrique-ouest"],
    score: 91,
    hlsUrl: demoHls
  },
  {
    id: "doc-011",
    title: "Carrefour Atlantique",
    type: "documentaire",
    year: 2024,
    status: "published",
    synopsis: "Portraits croises d'artistes entre continent et ocean.",
    duration: "1h18",
    genres: ["Documentaire", "Culture"],
    moods: ["inspirant", "apaisant"],
    regions: ["afrique-ouest", "diaspora"],
    score: 90,
    hlsUrl: demoHls
  },
  {
    id: "film-012",
    title: "Plan Sequence",
    type: "film",
    year: 2023,
    status: "published",
    synopsis: "Une fiction tendue autour d'une premiere mondiale.",
    duration: "2h03",
    genres: ["Fiction", "Suspense"],
    moods: ["sombre", "intense"],
    regions: ["afrique-centrale"],
    score: 89,
    hlsUrl: demoHls
  },
  {
    id: "serie-013",
    title: "Coulisses 24",
    type: "serie",
    year: 2025,
    status: "published",
    synopsis: "Le quotidien brut d'une equipe de tournage a flux tendu.",
    duration: "43 min",
    genres: ["Making-of", "Serie"],
    moods: ["electrique", "inspirant"],
    regions: ["afrique-ouest"],
    score: 88,
    hlsUrl: demoHls
  },
  {
    id: "film-014",
    title: "Lignes de Fuite",
    type: "film",
    year: 2022,
    status: "published",
    synopsis: "Deux destins se croisent dans une ville qui ne dort jamais.",
    duration: "1h34",
    genres: ["Drame", "Ville"],
    moods: ["reflexif", "sombre"],
    regions: ["diaspora"],
    score: 87,
    hlsUrl: demoHls
  }
];

const knownMoods = ["intense", "reflexif", "inspirant", "sombre", "electrique", "apaisant"];

type CatalogFilters = {
  mood?: string;
  region?: string;
  search?: string;
  type?: string;
  status?: string;
  limit?: number;
};

export function getCatalog(filters: CatalogFilters = {}): CatalogItem[] {
  const mood = filters.mood?.trim().toLowerCase();
  const region = filters.region?.trim().toLowerCase();
  const search = filters.search?.trim().toLowerCase();
  const type = filters.type?.trim().toLowerCase();
  const status = filters.status?.trim().toLowerCase();

  let list = catalog.filter((item) => {
    if (mood && !item.moods.some((m) => m.toLowerCase() === mood)) return false;
    if (region && !item.regions.some((r) => r.toLowerCase() === region)) return false;
    if (type && item.type.toLowerCase() !== type) return false;
    if (status && item.status.toLowerCase() !== status) return false;
    if (!search) return true;

    const haystack = `${item.title} ${item.synopsis} ${item.genres.join(" ")} ${item.moods.join(" ")}`.toLowerCase();
    return haystack.includes(search);
  });

  list = [...list].sort((a, b) => b.score - a.score);

  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
    const safe = Math.max(1, Math.min(50, Math.trunc(filters.limit)));
    return list.slice(0, safe);
  }

  return list;
}

export function getMoodCatalog() {
  return knownMoods.map((mood) => ({
    key: mood,
    label: mood[0].toUpperCase() + mood.slice(1)
  }));
}

export function getMoodRecommendations(mood: string | undefined, limit = 6): CatalogItem[] {
  const safe = Math.max(1, Math.min(20, Math.trunc(limit)));
  if (!mood || mood === "all") return getCatalog({ limit: safe });
  const items = getCatalog({ mood, limit: safe });
  if (items.length > 0) return items;
  return getCatalog({ limit: safe });
}

export function canonicalContentId(input: string): string {
  const raw = input.trim();
  if (catalog.some((item) => item.id === raw)) return raw;

  const match = raw.match(/^(film|doc|serie|short)-\d+/i);
  if (!match) return raw;

  const candidate = match[0].toLowerCase();
  const found = catalog.find((item) => item.id.toLowerCase() === candidate);
  return found?.id ?? raw;
}

export function resolveStreamProfile(contentId: string, profile: StreamProfile = "auto"): StreamProfilePayload | null {
  const canonical = canonicalContentId(contentId);
  const item = catalog.find((entry) => entry.id === canonical);
  if (!item) return null;

  if (profile === "data_saver") {
    return {
      profile,
      maxResolution: "480p",
      maxBitrateKbps: 900,
      preloadSeconds: 2,
      hlsUrl: item.hlsUrl
    };
  }

  if (profile === "high") {
    return {
      profile,
      maxResolution: "1080p",
      maxBitrateKbps: 5500,
      preloadSeconds: 8,
      hlsUrl: item.hlsUrl
    };
  }

  return {
    profile: "auto",
    maxResolution: "720p",
    maxBitrateKbps: 2400,
    preloadSeconds: 4,
    hlsUrl: item.hlsUrl
  };
}

export function computeTasteGraph(input: { watchlist: string[]; progress: Record<string, number> }) {
  const genreScores = new Map<string, number>();
  const moodScores = new Map<string, number>();

  const touched = new Set<string>();
  for (const rawId of input.watchlist) {
    touched.add(canonicalContentId(rawId));
  }

  for (const [rawId, value] of Object.entries(input.progress)) {
    if (value > 0) touched.add(canonicalContentId(rawId));
  }

  for (const id of touched) {
    const item = catalog.find((entry) => entry.id === id);
    if (!item) continue;

    const progressValue = Math.max(0, Math.min(100, input.progress[id] ?? input.progress[`${id}-1`] ?? 0));
    const weight = 1 + progressValue / 100;

    for (const genre of item.genres) {
      genreScores.set(genre, (genreScores.get(genre) ?? 0) + weight);
    }

    for (const mood of item.moods) {
      moodScores.set(mood, (moodScores.get(mood) ?? 0) + weight);
    }
  }

  const genres = [...genreScores.entries()]
    .map(([key, value]) => ({ key, score: Number(value.toFixed(2)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const moods = [...moodScores.entries()]
    .map(([key, value]) => ({ key, score: Number(value.toFixed(2)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    updatedAt: new Date().toISOString(),
    genres,
    moods,
    signals: {
      watchlistCount: input.watchlist.length,
      progressCount: Object.keys(input.progress).length
    }
  };
}