import { getApiUrl } from "./session";

export type CatalogItem = {
  id: string;
  title: string;
  type: string;
  year: number;
  status?: string;
  synopsis: string;
  duration: string;
  genres: string[];
  moods?: string[];
  regions?: string[];
  score: number;
  progress: number;
  hlsUrl: string;
};

const demoHls = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

const fallback: CatalogItem[] = [
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
    progress: 34,
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
    progress: 67,
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
    progress: 12,
    hlsUrl: demoHls
  }
];

function sanitizeItem(value: unknown, idx: number): CatalogItem {
  const raw = (value ?? {}) as Partial<CatalogItem>;
  return {
    id: typeof raw.id === "string" ? raw.id : `fallback-${idx + 1}`,
    title: typeof raw.title === "string" ? raw.title : `Titre ${idx + 1}`,
    type: typeof raw.type === "string" ? raw.type : "film",
    year: typeof raw.year === "number" ? raw.year : 2026,
    status: typeof raw.status === "string" ? raw.status : "published",
    synopsis: typeof raw.synopsis === "string" ? raw.synopsis : "Synopsis en preparation.",
    duration: typeof raw.duration === "string" ? raw.duration : "--",
    genres: Array.isArray(raw.genres) ? raw.genres : ["General"],
    moods: Array.isArray(raw.moods) ? raw.moods : [],
    regions: Array.isArray(raw.regions) ? raw.regions : [],
    score: typeof raw.score === "number" ? raw.score : Math.max(70, 95 - idx),
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    hlsUrl: typeof raw.hlsUrl === "string" ? raw.hlsUrl : demoHls
  };
}

export async function getCatalogFeed(): Promise<CatalogItem[]> {
  const apiUrl = getApiUrl();

  try {
    const res = await fetch(`${apiUrl}/api/v1/catalog/enriched?limit=24`, { cache: "no-store" });
    if (!res.ok) throw new Error("catalog unavailable");

    const data = (await res.json()) as { items?: unknown[] };
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return fallback;
    }

    return data.items.map(sanitizeItem);
  } catch {
    return fallback;
  }
}

export async function getCatalogById(id: string): Promise<CatalogItem | null> {
  const all = await getCatalogFeed();
  return all.find((item) => item.id === id) ?? null;
}