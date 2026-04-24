"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "../lib/catalog";
import { getApiUrl, TOKEN_KEY } from "../lib/session";

export default function WatchlistClient({ items }: { items: CatalogItem[] }) {
  const [token, setToken] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    setToken(raw);
    void loadWatchlist(raw);
  }, []);

  async function loadWatchlist(jwtToken: string) {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/me/watchlist`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        cache: "no-store"
      });
      if (!res.ok) throw new Error("Session invalide");
      const data = (await res.json()) as { items?: string[] };
      setIds(data.items ?? []);
    } catch {
      setError("Connecte-toi pour acceder a Ma Liste.");
      setIds([]);
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function remove(id: string) {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/api/v1/me/watchlist/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: string[] };
    setIds(data.items ?? []);
  }

  const selected = useMemo(() => {
    const set = new Set(ids);
    return items.filter((item) => set.has(item.id));
  }, [items, ids]);

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

      <section className="rail-block">
        <div className="rail-head">
          <h2>Mes favoris</h2>
          <span>{selected.length} contenu(x)</span>
        </div>

        {!token && (
          <div className="empty-box">
            <p>{error ?? "Connecte-toi depuis l'accueil pour voir ta liste."}</p>
            <Link className="btn-primary" href="/">Aller a l'accueil</Link>
          </div>
        )}

        {token && selected.length === 0 ? (
          <div className="empty-box">
            <p>Aucun favori pour le moment.</p>
            <Link className="btn-primary" href="/">Retour au catalogue</Link>
          </div>
        ) : null}

        {token && selected.length > 0 ? (
          <div className="watchlist-grid">
            {selected.map((item) => (
              <article key={item.id} className="rail-card">
                <Link href={`/content/${item.id}`} className="thumb" style={{ background: "linear-gradient(140deg, #6f5230 0%, #181818 80%)" }} />
                <div className="card-body">
                  <p className="mini-type">{item.type}</p>
                  <h3><Link href={`/content/${item.id}`}>{item.title}</Link></h3>
                  <p>{item.synopsis}</p>
                  <small>{item.year} - {item.duration}</small>
                  <button className="ghost-btn" onClick={() => remove(item.id)}>Retirer</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <nav className="mobile-quick-nav" aria-label="Navigation rapide mobile">
        <Link href="/">Accueil</Link>
        <a href="#top">Top</a>
        <Link href="/watchlist">Liste</Link>
      </nav>
    </main>
  );
}



