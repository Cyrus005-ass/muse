"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem } from "../lib/catalog";
import HlsPlayer from "./hls-player";
import { getApiUrl, TOKEN_KEY } from "../lib/session";

type StreamProfile = "auto" | "data_saver" | "high";

type StreamPayload = {
  profile: StreamProfile;
  maxResolution: "480p" | "720p" | "1080p";
  maxBitrateKbps: number;
  preloadSeconds: number;
  hlsUrl: string;
};

type ContentMeta = {
  haacStatus: "DRAFT" | "QUARANTAINE" | "VISA_OK" | "REJETE_HAAC" | "+16" | "+18";
  aiDubLangs: string[];
};

export default function ContentDetailClient({ item }: { item: CatalogItem }) {
  const apiUrl = useMemo(() => getApiUrl(), []);

  const [token, setToken] = useState<string | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [savedProgress, setSavedProgress] = useState<number>(item.progress);
  const [error, setError] = useState<string | null>(null);
  const [streamProfile, setStreamProfile] = useState<StreamProfile>("auto");
  const [streamConfig, setStreamConfig] = useState<StreamPayload | null>(null);
  const [audioOptions, setAudioOptions] = useState<string[]>(["vo", "fr"]);
  const [audioLang, setAudioLang] = useState("vo");
  const [contentMeta, setContentMeta] = useState<ContentMeta | null>(null);
  const [showHaacOverlay, setShowHaacOverlay] = useState(false);
  const lastSent = useRef<number>(-1);

  const loadState = useCallback(async (jwtToken: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/me/state`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        cache: "no-store"
      });
      if (!res.ok) throw new Error("session invalid");

      const data = (await res.json()) as {
        watchlist?: string[];
        progress?: Record<string, number>;
      };
      setInWatchlist((data.watchlist ?? []).includes(item.id));
      const value = data.progress?.[item.id];
      if (typeof value === "number") {
        setSavedProgress(value);
        lastSent.current = value;
      }
    } catch {
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [apiUrl, item.id]);

  const loadStreamProfile = useCallback(async (profile: StreamProfile, lang: string) => {
    try {
      const params = new URLSearchParams({ profile, lang });
      const res = await fetch(`${apiUrl}/api/v1/catalog/stream/${encodeURIComponent(item.id)}?${params.toString()}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        setStreamConfig(null);
        return;
      }
      const data = (await res.json()) as StreamPayload;
      setStreamConfig(data);
    } catch {
      setStreamConfig(null);
    }
  }, [apiUrl, item.id]);

  const loadAudioOptions = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/catalog/audio/${encodeURIComponent(item.id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: string[] };
      if (Array.isArray(data.items) && data.items.length > 0) setAudioOptions(data.items);
    } catch {
      setAudioOptions(["vo", "fr"]);
    }
  }, [apiUrl, item.id]);

  const loadContentMeta = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/catalog/content/${encodeURIComponent(item.id)}/meta`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ContentMeta;
      setContentMeta(data);
      if (data.haacStatus === "+16" || data.haacStatus === "+18") {
        setShowHaacOverlay(true);
        setTimeout(() => setShowHaacOverlay(false), 5000);
      }
    } catch {
      setContentMeta(null);
    }
  }, [apiUrl, item.id]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    setToken(stored);
    void loadState(stored);
  }, [loadState]);

  useEffect(() => {
    void loadStreamProfile(streamProfile, audioLang);
  }, [loadStreamProfile, streamProfile, audioLang]);

  useEffect(() => {
    void loadAudioOptions();
    void loadContentMeta();
  }, [loadAudioOptions, loadContentMeta]);

  async function toggleWatchlist() {
    if (!token) {
      setError("Connecte-toi depuis l'accueil pour ajouter ce contenu a ta liste.");
      return;
    }

    const method = inWatchlist ? "DELETE" : "POST";
    const url = inWatchlist
      ? `${apiUrl}/api/v1/me/watchlist/${encodeURIComponent(item.id)}`
      : `${apiUrl}/api/v1/me/watchlist`;

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    };

    if (!inWatchlist) {
      init.body = JSON.stringify({ contentId: item.id });
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      setError("Impossible de mettre a jour la liste.");
      return;
    }

    const data = (await res.json()) as { items?: string[] };
    setInWatchlist((data.items ?? []).includes(item.id));
  }

  async function persistProgress(value: number) {
    if (!token) return;
    const rounded = Math.round(value);

    if (Math.abs(rounded - lastSent.current) < 10 && rounded !== 100) {
      return;
    }

    lastSent.current = rounded;
    setSavedProgress(rounded);

    await fetch(`${apiUrl}/api/v1/me/progress/${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ progress: rounded })
    });
  }

  const activeStreamUrl = streamConfig?.hlsUrl ?? item.hlsUrl;

  return (
    <main className="stream-shell" id="top">
      <header className="top-nav">
        <div className="brand-wrap">
          <span className="brand-mark">MUSE ORIGIN STUDIO.</span>
          <span className="brand-sub">where creativity meets professional production</span>
        </div>
        <nav className="menu">
          <Link href="/">Accueil</Link>
          <Link href="/watchlist">Ma Liste</Link>
        </nav>
      </header>

      <section className="detail-wrap">
        <div className="detail-main">
          {showHaacOverlay && contentMeta && (contentMeta.haacStatus === "+16" || contentMeta.haacStatus === "+18") ? (
            <div className="haac-overlay">Deconseille aux moins de {contentMeta.haacStatus.replace("+", "")} ans</div>
          ) : null}
          <HlsPlayer src={activeStreamUrl} onProgress={persistProgress} />
        </div>
        <aside className="detail-side">
          <p className="mini-type">{item.type}</p>
          <h1>{item.title}</h1>
          <p className="hero-meta">{item.year} - {item.duration} - Score {item.score}</p>
          {contentMeta && (contentMeta.haacStatus === "+16" || contentMeta.haacStatus === "+18") ? <p className="hero-meta">Badge HAAC: {contentMeta.haacStatus}</p> : null}
          <p>{item.synopsis}</p>
          <p className="hero-meta">Progression sauvegardee: {savedProgress}%</p>
          <div className="stream-profile-row">
            <select value={audioLang} onChange={(e) => setAudioLang(e.target.value)} className="stream-audio-select">
              {audioOptions.map((lang) => (
                <option key={lang} value={lang}>Audio: {lang === "vo" ? "VO" : lang === "fr" ? "FR IA" : `${lang} IA`}</option>
              ))}
            </select>
            <button className={streamProfile === "auto" ? "ghost-btn active" : "ghost-btn"} onClick={() => setStreamProfile("auto")}>Auto</button>
            <button className={streamProfile === "data_saver" ? "ghost-btn active" : "ghost-btn"} onClick={() => setStreamProfile("data_saver")}>Data Saver</button>
            <button className={streamProfile === "high" ? "ghost-btn active" : "ghost-btn"} onClick={() => setStreamProfile("high")}>High</button>
          </div>
          {streamConfig && (
            <p className="hero-meta">
              Profil {streamConfig.profile} - Max {streamConfig.maxResolution} - {streamConfig.maxBitrateKbps} kbps
            </p>
          )}
          <div className="tag-row">
            {item.genres.map((genre) => (
              <span className="tag" key={genre}>{genre}</span>
            ))}
          </div>
          <div className="hero-actions">
            <button className="btn-secondary" onClick={toggleWatchlist}>
              {inWatchlist ? "Retirer de Ma Liste" : "Ajouter a Ma Liste"}
            </button>
            <Link href="/" className="btn-secondary">Retour au catalogue</Link>
          </div>
          {error && <p className="auth-error">{error}</p>}
        </aside>
      </section>
      <nav className="mobile-quick-nav" aria-label="Navigation rapide mobile">
        <Link href="/">Accueil</Link>
        <Link href="/watchlist">Liste</Link>
        <a href="#top">Top</a>
      </nav>
      <footer className="legal-footer">Plateforme conforme aux prescriptions de la HAAC. Contenu sous responsabilite de l'editeur.</footer>
    </main>
  );
}




