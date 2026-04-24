"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "../lib/catalog";
import { getApiUrl, type AuthUser, type LoginResponse, type PersonalState, TOKEN_KEY } from "../lib/session";
import StudioUploader from "./studio-uploader";

type SubscriptionPlan = "monthly" | "yearly";
type SubscriptionStatus = "active" | "canceled";
type BillingPaymentMethod = "card" | "mobile_money" | "paypal";
type BillingTransactionStatus = "paid" | "failed";
type BillingStatusFilter = "all" | BillingTransactionStatus;
type BillingPlanFilter = "all" | SubscriptionPlan;

type SubscriptionRecord = {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  renewAt: string | null;
  canceledAt: string | null;
};

type BillingTransactionRecord = {
  id: string;
  receiptCode: string;
  userId: string;
  plan: SubscriptionPlan;
  amountCents: number;
  currency: string;
  paymentMethod: BillingPaymentMethod;
  status: BillingTransactionStatus;
  createdAt: string;
};

type MoodItem = {
  key: string;
  label: string;
};

type TasteGraph = {
  updatedAt: string;
  genres: Array<{ key: string; score: number }>;
  moods: Array<{ key: string; score: number }>;
  signals: {
    watchlistCount: number;
    progressCount: number;
  };
};

type CollaboratorMessageForm = {
  name: string;
  email: string;
  organization: string;
  interestArea: string;
  message: string;
};

type PublicFeedbackForm = {
  name: string;
  email: string;
  rating: number;
  comment: string;
};

type SubmissionForm = {
  creatorName: string;
  creatorEmail: string;
  title: string;
  type: string;
  synopsis: string;
  pitch: string;
};

function tone(index: number): string {
  const tones = ["#6f5230", "#3a4f63", "#633a46", "#4f5f33", "#3b365f", "#69533b"];
  return tones[index % tones.length];
}

function pick<T>(items: T[], start: number, count: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) out.push(items[(start + i) % items.length]);
  return out;
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("fr-FR");
}

function matchesCatalog(item: CatalogItem, query: string, type: string, region: string): boolean {
  if (type !== "all" && item.type !== type) return false;
  if (region !== "all" && !(item.regions ?? []).includes(region)) return false;
  if (!query) return true;
  const source = `${item.title} ${item.synopsis} ${item.type} ${(item.genres ?? []).join(" ")} ${(item.moods ?? []).join(" ")}`.toLowerCase();
  return source.includes(query);
}

export default function StreamingHomeClient({ items }: { items: CatalogItem[] }) {
  const apiUrl = useMemo(() => getApiUrl(), []);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("Muse Viewer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingTransactionRecord[]>([]);
  const [billingStatusFilter, setBillingStatusFilter] = useState<BillingStatusFilter>("all");
  const [billingPlanFilter, setBillingPlanFilter] = useState<BillingPlanFilter>("all");

  const [moods, setMoods] = useState<MoodItem[]>([{ key: "all", label: "Tous" }]);
  const [activeMood, setActiveMood] = useState("all");
  const [recommendations, setRecommendations] = useState<CatalogItem[]>([]);
  const [tasteGraph, setTasteGraph] = useState<TasteGraph | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogType, setCatalogType] = useState("all");
  const [catalogRegion, setCatalogRegion] = useState("all");
  const [collabMessage, setCollabMessage] = useState<CollaboratorMessageForm>({
    name: "",
    email: "",
    organization: "",
    interestArea: "",
    message: ""
  });
  const [publicFeedback, setPublicFeedback] = useState<PublicFeedbackForm>({
    name: "",
    email: "",
    rating: 5,
    comment: ""
  });
  const [submission, setSubmission] = useState<SubmissionForm>({
    creatorName: "",
    creatorEmail: "",
    title: "",
    type: "film",
    synopsis: "",
    pitch: ""
  });
  const [collabStatus, setCollabStatus] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    setToken(raw);
    void loadSession(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadMoods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadBillingHistory(token, billingStatusFilter, billingPlanFilter);
  }, [token, billingStatusFilter, billingPlanFilter]);

  useEffect(() => {
    void loadRecommendations(activeMood);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMood]);

  async function loadMoods() {
    try {
      const res = await fetch(`${apiUrl}/api/v1/catalog/moods`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: MoodItem[] };
      if (!Array.isArray(data.items) || data.items.length === 0) return;
      setMoods([{ key: "all", label: "Tous" }, ...data.items]);
    } catch {
      setMoods([{ key: "all", label: "Tous" }]);
    }
  }

  async function loadRecommendations(mood: string) {
    try {
      const params = new URLSearchParams({ mood, limit: "6" });
      const res = await fetch(`${apiUrl}/api/v1/catalog/recommendations?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setRecommendations([]);
        return;
      }
      const data = (await res.json()) as { items?: CatalogItem[] };
      setRecommendations(data.items ?? []);
    } catch {
      setRecommendations([]);
    }
  }

  function buildBillingHistoryUrl(status: BillingStatusFilter, plan: BillingPlanFilter): string {
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("status", status);
    params.set("plan", plan);
    return `${apiUrl}/api/v1/me/billing/history?${params.toString()}`;
  }

  async function loadBillingHistory(jwtToken: string, status: BillingStatusFilter, plan: BillingPlanFilter) {
    const res = await fetch(buildBillingHistoryUrl(status, plan), {
      headers: { Authorization: `Bearer ${jwtToken}` },
      cache: "no-store"
    });

    if (!res.ok) {
      setBillingHistory([]);
      return;
    }

    const data = (await res.json()) as { items?: BillingTransactionRecord[] };
    setBillingHistory(data.items ?? []);
  }

  async function loadTasteGraph(jwtToken: string) {
    const res = await fetch(`${apiUrl}/api/v1/me/taste-graph`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
      cache: "no-store"
    });

    if (!res.ok) {
      setTasteGraph(null);
      return;
    }

    const data = (await res.json()) as TasteGraph;
    setTasteGraph(data);
  }

  async function loadSession(jwtToken: string) {
    const headers = { Authorization: `Bearer ${jwtToken}` };

    try {
      const [meRes, stateRes, subRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/auth/me`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/me/state`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/me/subscription`, { headers, cache: "no-store" })
      ]);

      if (!meRes.ok || !stateRes.ok || !subRes.ok) {
        throw new Error("Session invalide");
      }

      const me = (await meRes.json()) as AuthUser;
      const state = (await stateRes.json()) as PersonalState;
      const subData = (await subRes.json()) as { subscription?: SubscriptionRecord | null };

      setUser(me);
      setWatchlist(state.watchlist ?? []);
      setProgress(state.progress ?? {});
      setSubscription(subData.subscription ?? null);
      await Promise.all([
        loadBillingHistory(jwtToken, billingStatusFilter, billingPlanFilter),
        loadTasteGraph(jwtToken)
      ]);
    } catch {
      setUser(null);
      setToken(null);
      setWatchlist([]);
      setProgress({});
      setSubscription(null);
      setBillingHistory([]);
      setTasteGraph(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    const endpoint = authMode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
    const payload = authMode === "login" ? { email, password } : { name, email, password };

    try {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(authMode === "login" ? "Identifiants invalides" : "Inscription impossible");
      }

      const data = (await res.json()) as LoginResponse;
      setToken(data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      await loadSession(data.token);
      setPassword("");
      setAuthError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur d'authentification";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    setWatchlist([]);
    setProgress({});
    setSubscription(null);
    setBillingHistory([]);
    setTasteGraph(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function toggleWatchlist(contentId: string) {
    if (!token) {
      setAuthError("Connecte-toi pour utiliser Ma Liste.");
      return;
    }

    const already = watchlist.includes(contentId);
    const method = already ? "DELETE" : "POST";
    const url = already
      ? `${apiUrl}/api/v1/me/watchlist/${encodeURIComponent(contentId)}`
      : `${apiUrl}/api/v1/me/watchlist`;

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    };

    if (!already) {
      init.body = JSON.stringify({ contentId });
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      setAuthError("Action impossible. Reconnecte-toi.");
      return;
    }

    const data = (await res.json()) as { items: string[] };
    setWatchlist(data.items ?? []);
    await loadTasteGraph(token);
  }

  async function checkout(plan: SubscriptionPlan) {
    if (!token) {
      setAuthError("Connecte-toi pour t'abonner.");
      return;
    }

    const res = await fetch(`${apiUrl}/api/v1/me/billing/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ plan, paymentMethod: "card" })
    });

    const data = (await res.json()) as {
      error?: string;
      transaction?: BillingTransactionRecord;
      subscription?: SubscriptionRecord | null;
    };

    if (!res.ok) {
      setAuthError(data.error ?? "Paiement impossible.");
      await loadBillingHistory(token, billingStatusFilter, billingPlanFilter);
      return;
    }

    setSubscription(data.subscription ?? null);
    setAuthError(null);
    await loadBillingHistory(token, billingStatusFilter, billingPlanFilter);
  }

  async function cancelSubscription() {
    if (!token) return;

    const res = await fetch(`${apiUrl}/api/v1/me/subscription/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      setAuthError("Impossible d'annuler l'abonnement.");
      return;
    }

    const data = (await res.json()) as { subscription?: SubscriptionRecord | null };
    setSubscription(data.subscription ?? null);
    setAuthError(null);
  }


  async function submitCollaboratorMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCollabStatus(null);

    const res = await fetch(`${apiUrl}/api/v1/public/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collabMessage)
    });

    if (!res.ok) {
      setCollabStatus("Impossible d'envoyer le message pour le moment.");
      return;
    }

    setCollabStatus("Message collaborateur envoye.");
    setCollabMessage({ name: "", email: "", organization: "", interestArea: "", message: "" });
  }

  async function submitPublicFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackStatus(null);

    const res = await fetch(`${apiUrl}/api/v1/public/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publicFeedback)
    });

    if (!res.ok) {
      setFeedbackStatus("Impossible d'envoyer l'avis.");
      return;
    }

    setFeedbackStatus("Avis envoye. Merci.");
    setPublicFeedback({ name: "", email: "", rating: 5, comment: "" });
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionStatus(null);

    const res = await fetch(`${apiUrl}/api/v1/public/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });

    if (!res.ok) {
      setSubmissionStatus("Soumission impossible pour le moment.");
      return;
    }

    setSubmissionStatus("Projet soumis a l'equipe editoriale.");
    setSubmission({
      creatorName: "",
      creatorEmail: "",
      title: "",
      type: "film",
      synopsis: "",
      pitch: ""
    });
  }
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);

  const enriched = useMemo(
    () => items.map((item) => ({ ...item, progress: progress[item.id] ?? item.progress })),
    [items, progress]
  );

  const catalogTypeOptions = useMemo(() => Array.from(new Set(enriched.map((item) => item.type))).sort(), [enriched]);
  const catalogRegionOptions = useMemo(() => Array.from(new Set(enriched.flatMap((item) => item.regions ?? []))).sort(), [enriched]);

  const filteredCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    return enriched.filter((item) => matchesCatalog(item, query, catalogType, catalogRegion));
  }, [enriched, catalogQuery, catalogType, catalogRegion]);

  if (enriched.length === 0) {
    return (
      <main className="stream-shell" id="top">
        <p>Catalogue vide pour le moment.</p>
      </main>
    );
  }

  const feed = filteredCatalog.length > 0 ? filteredCatalog : enriched;
  const featured = feed[0];
  const top10 = [...feed].sort((a, b) => b.score - a.score).slice(0, 10);
  const continueWatching = feed.filter((item) => item.progress > 0).slice(0, 4);
  const rails = [
    { key: "new", title: "Nouveautes Muse", items: pick(feed, 0, Math.min(6, feed.length)) },
    { key: "diaspora", title: "Selection Diaspora", items: pick(feed, 2, Math.min(6, feed.length)) },
    { key: "docs", title: "Documentaires & Regards", items: pick(feed, 1, Math.min(6, feed.length)) }
  ];

  const subscriptionLabel = subscription
    ? `${subscription.plan === "monthly" ? "Mensuel" : "Annuel"} - ${subscription.status === "active" ? "Actif" : "Annule"}`
    : "Aucun abonnement";

  return (
    <main className="stream-shell" id="top">
      <div className="stream-grain" />

      <header className="top-nav">
        <div className="brand-wrap">
          <span className="brand-mark">MUSE ORIGIN STUDIO.</span>
          <span className="brand-sub">where creativity meets professional production</span>
        </div>
        <nav className="menu">
          <Link href="/">Accueil</Link>
          <Link href="/vision">Vision</Link>
          <a href="#catalogue">Catalogue</a>
          <a href="#mood">MoodEngine</a>
          <a href="#collab">Studio</a>
          <Link href="/watchlist">Ma Liste</Link>
        </nav>
        {user ? (
          <button className="profile-btn" onClick={logout}>{user.name}</button>
        ) : (
          <button className="profile-btn" onClick={() => setAuthMode((v) => (v === "login" ? "register" : "login"))}>
            {authMode === "login" ? "Connexion" : "Inscription"}
          </button>
        )}
      </header>

      {!user && (
        <section className="auth-panel">
          <h3>{authMode === "login" ? "Connexion" : "Creation de compte"}</h3>
          <form onSubmit={submitAuth} className="auth-form">
            {authMode === "register" && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" required />
            )}
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" type="password" required />
            <button className="btn-primary" type="submit" disabled={authLoading}>
              {authLoading ? "Chargement..." : authMode === "login" ? "Se connecter" : "S'inscrire"}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === "login" ? "Pas de compte ?" : "Deja inscrit ?"}{" "}
            <button type="button" onClick={() => setAuthMode((v) => (v === "login" ? "register" : "login"))}>
              {authMode === "login" ? "Creer un compte" : "Se connecter"}
            </button>
          </p>
          {authError && <p className="auth-error">{authError}</p>}
        </section>
      )}

      {user && (
        <section className="subscription-panel">
          <p>Abonnement: <strong>{subscriptionLabel}</strong></p>
          <div className="hero-actions" style={{ marginTop: 8 }}>
            <button className="btn-secondary" onClick={() => checkout("monthly")}>Payer mensuel (9,99 EUR)</button>
            <button className="btn-secondary" onClick={() => checkout("yearly")}>Payer annuel (99,00 EUR)</button>
            {subscription?.status === "active" && (
              <button className="btn-secondary" onClick={cancelSubscription}>Annuler</button>
            )}
          </div>
          <div className="billing-filters">
            <button className="btn-secondary" onClick={() => setBillingStatusFilter("all")}>Tous</button>
            <button className="btn-secondary" onClick={() => setBillingStatusFilter("paid")}>Payes</button>
            <button className="btn-secondary" onClick={() => setBillingStatusFilter("failed")}>Echecs</button>
            <button className="btn-secondary" onClick={() => setBillingPlanFilter("all")}>Plans</button>
            <button className="btn-secondary" onClick={() => setBillingPlanFilter("monthly")}>Mensuel</button>
            <button className="btn-secondary" onClick={() => setBillingPlanFilter("yearly")}>Annuel</button>
          </div>
          {billingHistory.length > 0 && (
            <div className="billing-list">
              {billingHistory.slice(0, 5).map((txn) => (
                <p key={txn.id}>
                  {txn.receiptCode} - {txn.plan} - {(txn.amountCents / 100).toFixed(2)} {txn.currency} - {txn.status} - {formatDate(txn.createdAt)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section id="catalogue" className="rail-block">
        <div className="rail-head">
          <h2>Catalogue Explorer</h2>
          <span>{filteredCatalog.length} resultat(s)</span>
        </div>
        <div className="collab-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
          <input value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Rechercher titre, genre, humeur..." />
          <select value={catalogType} onChange={(e) => setCatalogType(e.target.value)}>
            <option value="all">Tous les types</option>
            {catalogTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={catalogRegion} onChange={(e) => setCatalogRegion(e.target.value)}>
            <option value="all">Toutes les regions</option>
            {catalogRegionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
        {filteredCatalog.length === 0 ? <p className="auth-switch">Aucun contenu ne correspond a ces filtres.</p> : null}
      </section>

      <section className="rail-block">
        <div className="rail-head">
          <h2>Demarrer Rapidement</h2>
          <span>3 actions prioritaires</span>
        </div>
        <div className="top-grid">
          <article className="top-card">
            <span className="top-rank">1</span>
            <div>
              <p className="mini-type">Decouverte</p>
              <h3>Choisis une humeur</h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Active MoodEngine pour filtrer les contenus selon ton energie.</p>
            </div>
          </article>
          <article className="top-card">
            <span className="top-rank">2</span>
            <div>
              <p className="mini-type">Engagement</p>
              <h3>Ajoute 3 favoris</h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Cela alimente TasteGraph et personnalise tes recommandations.</p>
            </div>
          </article>
          <article className="top-card">
            <span className="top-rank">3</span>
            <div>
              <p className="mini-type">Createur</p>
              <h3>Soumets ton projet</h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Utilise l'uploader guide pour lancer le pipeline QC/HAAC.</p>
            </div>
          </article>
        </div>
      </section>
      <section id="mood" className="rail-block mood-block">
        <div className="rail-head">
          <h2>MoodEngine</h2>
          <span>Navigation emotionnelle</span>
        </div>
        <div className="mood-chip-row">
          {moods.map((mood) => (
            <button
              key={mood.key}
              className={mood.key === activeMood ? "mood-chip active" : "mood-chip"}
              onClick={() => setActiveMood(mood.key)}
            >
              {mood.label}
            </button>
          ))}
        </div>
        {recommendations.length > 0 && (
          <div className="rail-row" style={{ marginTop: 12 }}>
            {recommendations.map((item, itemIndex) => (
              <article key={`reco-${item.id}`} className="rail-card">
                <Link href={`/content/${item.id}`}>
                  <div className="thumb" style={{ background: `linear-gradient(140deg, ${tone(itemIndex)} 0%, #181818 80%)` }} />
                </Link>
                <div className="card-body">
                  <p className="mini-type">Reco {activeMood === "all" ? "globale" : activeMood}</p>
                  <h3><Link href={`/content/${item.id}`}>{item.title}</Link></h3>
                  <p>{item.synopsis}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {tasteGraph && (
        <section className="rail-block taste-block">
          <div className="rail-head">
            <h2>TasteGraph transparent</h2>
            <span>{formatDate(tasteGraph.updatedAt)}</span>
          </div>
          <div className="taste-grid">
            <article className="taste-card">
              <h3>Genres dominants</h3>
              {tasteGraph.genres.length === 0 ? <p>Aucun signal pour le moment.</p> : tasteGraph.genres.map((entry) => (
                <p key={`genre-${entry.key}`}>{entry.key}: {entry.score}</p>
              ))}
            </article>
            <article className="taste-card">
              <h3>Humeurs dominantes</h3>
              {tasteGraph.moods.length === 0 ? <p>Aucun signal pour le moment.</p> : tasteGraph.moods.map((entry) => (
                <p key={`mood-${entry.key}`}>{entry.key}: {entry.score}</p>
              ))}
            </article>
            <article className="taste-card">
              <h3>Signaux utilises</h3>
              <p>Favoris: {tasteGraph.signals.watchlistCount}</p>
              <p>Progressions: {tasteGraph.signals.progressCount}</p>
            </article>
          </div>
        </section>
      )}

      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-kicker">Production originale Muse</p>
          <h1>{featured.title}</h1>
          <p className="hero-meta">{featured.type.toUpperCase()} - {featured.year} - {featured.duration}</p>
          <p className="hero-copy">{featured.synopsis}</p>
          <div className="hero-actions">
            <Link className="btn-primary" href={`/content/${featured.id}`}>Lire</Link>
            <button className="btn-secondary" onClick={() => toggleWatchlist(featured.id)}>
              {watchlistSet.has(featured.id) ? "Retirer de Ma Liste" : "Ajouter a Ma Liste"}
            </button>
          </div>
        </div>
      </section>

      <section className="rail-block">
        <div className="rail-head">
          <h2>Top 10 en ce moment</h2>
          <span>Classement dynamique</span>
        </div>
        <div className="top-grid">
          {top10.map((item, idx) => (
            <Link key={item.id} className="top-card" href={`/content/${item.id}`}>
              <span className="top-rank">{idx + 1}</span>
              <div>
                <p className="mini-type">{item.type}</p>
                <h3>{item.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {continueWatching.length > 0 && (
        <section className="rail-block">
          <div className="rail-head">
            <h2>Reprendre la lecture</h2>
            <span>Continue ou tu t'es arrete</span>
          </div>
          <div className="continue-grid">
            {continueWatching.map((item, index) => (
              <Link key={item.id} className="continue-card" href={`/content/${item.id}`}>
                <div className="thumb" style={{ background: `linear-gradient(140deg, ${tone(index)} 0%, #181818 80%)` }} />
                <div className="continue-body">
                  <p className="mini-type">{item.type}</p>
                  <h3>{item.title}</h3>
                  <div className="progress-line"><span style={{ width: `${item.progress}%` }} /></div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rails.map((rail, railIndex) => (
        <section key={rail.key} className="rail-block">
          <div className="rail-head">
            <h2>{rail.title}</h2>
            <span>Voir tout</span>
          </div>
          <div className="rail-row">
            {rail.items.map((item, itemIndex) => (
              <article key={item.id} className="rail-card">
                <Link href={`/content/${item.id}`}>
                  <div className="thumb" style={{ background: `linear-gradient(140deg, ${tone(railIndex + itemIndex)} 0%, #181818 80%)` }} />
                </Link>
                <div className="card-body">
                  <p className="mini-type">{item.type}</p>
                  <h3><Link href={`/content/${item.id}`}>{item.title}</Link></h3>
                  <p>{item.synopsis}</p>
                  <small>{item.year} - {item.duration}</small>
                  <button className="ghost-btn" onClick={() => toggleWatchlist(item.id)}>
                    {watchlistSet.has(item.id) ? "Retirer" : "Ajouter"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section id="collab" className="rail-block collab-block">
        <div className="rail-head">
          <h2>Espace Collaborateurs</h2>
          <span>Messages, avis et soumissions</span>
        </div>
        <div className="collab-grid">
          <form className="collab-card" onSubmit={submitCollaboratorMessage}>
            <h3>Message d'interet</h3>
            <input value={collabMessage.name} onChange={(e) => setCollabMessage((v) => ({ ...v, name: e.target.value }))} placeholder="Nom" required />
            <input value={collabMessage.email} onChange={(e) => setCollabMessage((v) => ({ ...v, email: e.target.value }))} placeholder="Email" type="email" required />
            <input value={collabMessage.organization} onChange={(e) => setCollabMessage((v) => ({ ...v, organization: e.target.value }))} placeholder="Organisation" />
            <input value={collabMessage.interestArea} onChange={(e) => setCollabMessage((v) => ({ ...v, interestArea: e.target.value }))} placeholder="Interet (invest, prod, distribution...)" />
            <textarea value={collabMessage.message} onChange={(e) => setCollabMessage((v) => ({ ...v, message: e.target.value }))} placeholder="Votre message" required />
            <button className="btn-primary" type="submit">Envoyer</button>
            {collabStatus ? <p className="auth-switch" style={{ marginTop: 2 }}>{collabStatus}</p> : null}
          </form>

          <form className="collab-card" onSubmit={submitPublicFeedback}>
            <h3>Donner un avis</h3>
            <input value={publicFeedback.name} onChange={(e) => setPublicFeedback((v) => ({ ...v, name: e.target.value }))} placeholder="Nom" required />
            <input value={publicFeedback.email} onChange={(e) => setPublicFeedback((v) => ({ ...v, email: e.target.value }))} placeholder="Email" type="email" />
            <label className="mini-type">Note: {publicFeedback.rating}/5</label>
            <input type="range" min={1} max={5} value={publicFeedback.rating} onChange={(e) => setPublicFeedback((v) => ({ ...v, rating: Number(e.target.value) }))} />
            <textarea value={publicFeedback.comment} onChange={(e) => setPublicFeedback((v) => ({ ...v, comment: e.target.value }))} placeholder="Votre retour produit" required />
            <button className="btn-primary" type="submit">Publier l'avis</button>
            {feedbackStatus ? <p className="auth-switch" style={{ marginTop: 2 }}>{feedbackStatus}</p> : null}
          </form>

          <StudioUploader />

          <form className="collab-card" onSubmit={submitProject}>
            <h3>Soumettre un projet</h3>
            <input value={submission.creatorName} onChange={(e) => setSubmission((v) => ({ ...v, creatorName: e.target.value }))} placeholder="Nom createur" required />
            <input value={submission.creatorEmail} onChange={(e) => setSubmission((v) => ({ ...v, creatorEmail: e.target.value }))} placeholder="Email createur" type="email" required />
            <input value={submission.title} onChange={(e) => setSubmission((v) => ({ ...v, title: e.target.value }))} placeholder="Titre du projet" required />
            <input value={submission.type} onChange={(e) => setSubmission((v) => ({ ...v, type: e.target.value }))} placeholder="Type: film, serie, doc..." required />
            <textarea value={submission.synopsis} onChange={(e) => setSubmission((v) => ({ ...v, synopsis: e.target.value }))} placeholder="Synopsis" required />
            <textarea value={submission.pitch} onChange={(e) => setSubmission((v) => ({ ...v, pitch: e.target.value }))} placeholder="Pitch editorial" required />
            <button className="btn-primary" type="submit">Soumettre</button>
            {submissionStatus ? <p className="auth-switch" style={{ marginTop: 2 }}>{submissionStatus}</p> : null}
          </form>
        </div>

      </section>

      <nav className="mobile-quick-nav" aria-label="Navigation rapide mobile">
        <a href="#top">Top</a>
        <a href="#collab">Studio</a>
        <Link href="/watchlist">Liste</Link>
      </nav>

      <footer className="legal-footer">Plateforme conforme aux prescriptions de la HAAC. Contenu sous responsabilite de l'editeur.</footer>
    </main>
  );
}

