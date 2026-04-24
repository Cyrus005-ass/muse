"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminKanban from "../components/admin-kanban";
import HaacVisaPanel from "../components/haac-visa-panel";

type Stats = {
  totals: {
    users: number;
    activeSubscriptions: number;
    watchMinutesToday: number;
    pendingContents: number;
  };
  inbox: {
    messagesNew: number;
    feedbackNew: number;
  };
  revenue: {
    monthlyRecurringRevenue: number;
    currency: string;
  };
};

type ContentItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  source: "catalog" | "submission";
};

type CollaboratorMessage = {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  interestArea: string | null;
  message: string;
  status: "new" | "reviewed" | "contacted" | "archived";
  createdAt: string;
};

type FeedbackItem = {
  id: string;
  name: string;
  email: string | null;
  rating: number;
  comment: string;
  status: "new" | "reviewed" | "featured" | "archived";
  createdAt: string;
};

type SubmissionItem = {
  id: string;
  creatorName: string;
  creatorEmail: string;
  title: string;
  type: string;
  synopsis: string;
  pitch: string;
  status: "submitted" | "under_review" | "approved" | "rejected" | "published";
  publishedCatalogId: string | null;
  createdAt: string;
};

type AdminAuditItem = {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  payloadJson: string | null;
  createdAt: string;
};

type StudioSubmission = {
  id: number;
  title: string;
  synopsis: string;
  originalLang: string;
  status: string;
  adminNote: string | null;
  contentId: string;
  createdAt: string;
};

type HaacQueueItem = {
  id: string;
  title: string;
  haacStatus: "DRAFT" | "QUARANTAINE" | "VISA_OK" | "REJETE_HAAC" | "+16" | "+18";
  posterPath: string | null;
  qcStatus: string;
  aiDubLangs: string[];
};

type HaacFlagItem = {
  id: number;
  flagType: string;
  severity: number;
  aiConfidence: number;
  evidence: string | null;
};

type RevenuePendingItem = {
  creatorId: string;
  dueAmount: number;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

const TOKEN_KEY = "muse_admin_token";
const LOCAL_API_URL = "http://localhost:4000";

type AdminTab = "contents" | "submissions" | "messages" | "feedback" | "audit" | "studio" | "haac" | "revenue";

function resolveApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return LOCAL_API_URL;
  return raw.replace(/\/+$/, "");
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 700 }}>{value}</p>
    </article>
  );
}

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("fr-FR");
}

function matchQuery(query: string, text: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query);
}

export default function AdminPage() {
  const apiUrl = useMemo(() => resolveApiUrl(), []);

  const [email, setEmail] = useState("admin@muse.local");
  const [password, setPassword] = useState("Admin@1234");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [messages, setMessages] = useState<CollaboratorMessage[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditItem[]>([]);
  const [studioSubmissions, setStudioSubmissions] = useState<StudioSubmission[]>([]);
  const [haacQueue, setHaacQueue] = useState<HaacQueueItem[]>([]);
  const [haacFlagsByContent, setHaacFlagsByContent] = useState<Record<string, HaacFlagItem[]>>({});
  const [revenuePending, setRevenuePending] = useState<RevenuePendingItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("contents");
  const [searchQuery, setSearchQuery] = useState("");

  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : null), [token]);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const loadDashboard = useCallback(async (jwtToken: string) => {
    setLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${jwtToken}` };

      const [meRes, statsRes, contentsRes, messagesRes, feedbackRes, submissionsRes, auditRes, studioRes, haacRes, revenueRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/auth/me`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/stats`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/contents`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/inbox/messages?limit=100`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/feedback?limit=100`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/submissions?limit=100`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/audit?limit=150`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/studio/submissions?limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/haac/queue?limit=200`, { headers, cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/admin/revenue/pending`, { headers, cache: "no-store" })
      ]);

      if (!meRes.ok) throw new Error("Session invalide");
      const meData = (await meRes.json()) as AuthUser;
      if (meData.role !== "admin") throw new Error("Compte sans role admin");

      if (!statsRes.ok || !contentsRes.ok || !messagesRes.ok || !feedbackRes.ok || !submissionsRes.ok || !auditRes.ok || !studioRes.ok || !haacRes.ok || !revenueRes.ok) {
        throw new Error("Impossible de charger les donnees admin");
      }

      const statsData = (await statsRes.json()) as Stats;
      const contentsData = (await contentsRes.json()) as { items?: ContentItem[] };
      const messagesData = (await messagesRes.json()) as { items?: CollaboratorMessage[] };
      const feedbackData = (await feedbackRes.json()) as { items?: FeedbackItem[] };
      const submissionsData = (await submissionsRes.json()) as { items?: SubmissionItem[] };
      const auditData = (await auditRes.json()) as { items?: AdminAuditItem[] };
      const studioData = (await studioRes.json()) as { items?: StudioSubmission[] };
      const haacData = (await haacRes.json()) as { items?: HaacQueueItem[] };
      const revenueData = (await revenueRes.json()) as { items?: RevenuePendingItem[] };

      setUser(meData);
      setStats(statsData);
      setContents(contentsData.items ?? []);
      setMessages(messagesData.items ?? []);
      setFeedback(feedbackData.items ?? []);
      setSubmissions(submissionsData.items ?? []);
      setAuditLogs(auditData.items ?? []);
      setStudioSubmissions(studioData.items ?? []);
      const nextHaac = haacData.items ?? [];
      setHaacQueue(nextHaac);
      setRevenuePending(revenueData.items ?? []);

      const flagsEntries = await Promise.all(nextHaac.map(async (item) => {
        const res = await fetch(`${apiUrl}/api/v1/admin/haac/flags/${encodeURIComponent(item.id)}`, { headers, cache: "no-store" });
        if (!res.ok) return [item.id, []] as const;
        const payload = (await res.json()) as { items?: HaacFlagItem[] };
        return [item.id, payload.items ?? []] as const;
      }));
      setHaacFlagsByContent(Object.fromEntries(flagsEntries));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inattendue";
      setError(message);
      setToken(null);
      setUser(null);
      setStats(null);
      setContents([]);
      setMessages([]);
      setFeedback([]);
      setSubmissions([]);
      setAuditLogs([]);
      setStudioSubmissions([]);
      setHaacQueue([]);
      setHaacFlagsByContent({});
      setRevenuePending([]);
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
      setActionLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    setToken(stored);
    void loadDashboard(stored);
  }, [loadDashboard]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setAdminNotice(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) throw new Error("Email ou mot de passe invalide");

      const data = (await res.json()) as LoginResponse;
      if (data.user.role !== "admin") throw new Error("Compte sans role admin");

      setToken(data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      await loadDashboard(data.token);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur de connexion";
      setError(message);
      setLoading(false);
    }
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    setStats(null);
    setContents([]);
    setMessages([]);
    setFeedback([]);
    setSubmissions([]);
    setAuditLogs([]);
    setStudioSubmissions([]);
    setHaacQueue([]);
    setHaacFlagsByContent({});
    setRevenuePending([]);
    setError(null);
    setAdminNotice(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function updateMessageStatus(id: string, status: CollaboratorMessage["status"]) {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/inbox/messages/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      setActionLoading(false);
      return;
    }
    setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    setActionLoading(false);
  }

  async function updateFeedbackStatus(id: string, status: FeedbackItem["status"]) {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      setActionLoading(false);
      return;
    }
    setFeedback((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    setActionLoading(false);
  }

  async function updateSubmissionStatus(id: string, status: SubmissionItem["status"], publishToCatalog = false) {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/submissions/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status, publishToCatalog })
    });
    if (!res.ok) {
      setActionLoading(false);
      return;
    }

    const data = (await res.json()) as { item?: SubmissionItem };
    if (data.item) {
      setSubmissions((prev) => prev.map((item) => (item.id === id ? data.item as SubmissionItem : item)));
    }
    await loadDashboard(token);
  }

  async function updateStudioStatus(id: number, status: string) {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/studio/submissions/${id}/status`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      setAdminNotice("Mise a jour impossible pour ce dossier studio.");
      setActionLoading(false);
      return;
    }
    setAdminNotice("Statut studio mis a jour.");
    await loadDashboard(token);
  }

  async function applyHaacAction(contentId: string, action: "VISA_OK" | "+16" | "+18" | "REJETE_HAAC", reason?: string) {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/haac/visa`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, action, reason: reason?.trim() || undefined })
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; qcStatus?: string };
      setAdminNotice(data.error ? `${data.error}${data.qcStatus ? ` (QC=${data.qcStatus})` : ""}` : "Action HAAC refusee.");
      setActionLoading(false);
      return;
    }

    setAdminNotice(`Decision HAAC appliquee: ${action}.`);
    await loadDashboard(token);
  }

  async function launchAiDub(contentId: string, lang: "fon" | "mina" | "yoruba" | "dendi") {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/dub`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, lang })
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setAdminNotice(data.error ?? "Doublage IA non lance.");
      setActionLoading(false);
      return;
    }

    setAdminNotice(`Doublage IA en file d'attente (${lang.toUpperCase()}).`);
    setActionLoading(false);
  }

  async function markRevenuePaid(creatorId: string) {
    if (!authHeaders || !token) return;
    setActionLoading(true);
    const res = await fetch(`${apiUrl}/api/v1/admin/revenue/mark-paid`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId })
    });

    if (!res.ok) {
      setAdminNotice("Paiement non confirme.");
      setActionLoading(false);
      return;
    }

    setAdminNotice(`Paiement marque regle pour ${creatorId}.`);
    await loadDashboard(token);
  }

  const filteredContents = contents.filter((item) => matchQuery(normalizedQuery, `${item.title} ${item.type} ${item.status} ${item.id}`));
  const filteredSubmissions = submissions.filter((item) => matchQuery(normalizedQuery, `${item.title} ${item.creatorName} ${item.creatorEmail} ${item.status}`));
  const filteredMessages = messages.filter((item) => matchQuery(normalizedQuery, `${item.name} ${item.email} ${item.message} ${item.status}`));
  const filteredFeedback = feedback.filter((item) => matchQuery(normalizedQuery, `${item.name} ${item.email ?? ""} ${item.comment} ${item.status}`));
  const filteredAudit = auditLogs.filter((item) => matchQuery(normalizedQuery, `${item.action} ${item.actorEmail} ${item.entityType} ${item.entityId}`));
  const filteredRevenue = revenuePending.filter((item) => matchQuery(normalizedQuery, `${item.creatorId} ${item.dueAmount}`));

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px 50px" }}>
      <header style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "0.04em", textTransform: "uppercase" }}>MUSE ORIGIN STUDIO.</h1>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>where creativity meets professional production - Admin control panel</p>
        </div>
        {token && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => token && loadDashboard(token)}
              className="admin-action"
              disabled={loading || actionLoading}
            >
              Actualiser
            </button>
            <button
              onClick={handleLogout}
              style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", cursor: "pointer" }}
            >
              Se deconnecter
            </button>
          </div>
        )}
      </header>

      {!token ? (
        <section style={{ maxWidth: 460, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0, color: "var(--accent)" }}>Connexion admin</h2>
          <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                style={{ background: "#0f141d", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Mot de passe</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                style={{ background: "#0f141d", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              style={{ background: "var(--accent)", color: "#1a1a1a", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
          {error && <p style={{ color: "#ff8c8c", marginBottom: 0 }}>{error}</p>}
        </section>
      ) : (
        <>
          {user && (
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Connecte en tant que <strong style={{ color: "var(--text)" }}>{user.name}</strong> ({user.email})
            </p>
          )}

          {loading && <p style={{ color: "var(--muted)" }}>Chargement du dashboard...</p>}
          {error && <p style={{ color: "#ff8c8c" }}>{error}</p>}

          {stats && (
            <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 18 }}>
              <StatCard label="Utilisateurs" value={stats.totals.users} />
              <StatCard label="Abonnements actifs" value={stats.totals.activeSubscriptions} />
              <StatCard label="Minutes vues (jour)" value={stats.totals.watchMinutesToday} />
              <StatCard label="Contenus en attente" value={stats.totals.pendingContents} />
              <StatCard label="Inbox messages (new)" value={stats.inbox.messagesNew} />
              <StatCard label="Avis (new)" value={stats.inbox.feedbackNew} />
              <StatCard label="MRR" value={`${stats.revenue.monthlyRecurringRevenue} ${stats.revenue.currency}`} />
            </section>
          )}

          <section style={{ marginBottom: 12 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher (titre, email, statut, action, creatorId...)"
              style={{ width: "100%", background: "#0f141d", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}
            />
          </section>

          <section className="admin-tab-row">
            <button className={activeTab === "contents" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("contents")}>Catalogue ({filteredContents.length})</button>
            <button className={activeTab === "submissions" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("submissions")}>Soumissions ({filteredSubmissions.length})</button>
            <button className={activeTab === "messages" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("messages")}>Messages ({filteredMessages.length})</button>
            <button className={activeTab === "feedback" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("feedback")}>Avis ({filteredFeedback.length})</button>
            <button className={activeTab === "audit" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("audit")}>Audit ({filteredAudit.length})</button>
            <button className={activeTab === "studio" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("studio")}>Studio & Droits</button>
            <button className={activeTab === "haac" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("haac")}>Visa HAAC ({haacQueue.length})</button>
            <button className={activeTab === "revenue" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveTab("revenue")}>Revenus ({filteredRevenue.length})</button>
          </section>

          {adminNotice && <p className="admin-notice">{adminNotice}</p>}

          {activeTab === "contents" && (
            <section className="admin-panel">
              <h2>Contenus publies et catalogues</h2>
              <div className="admin-list">
                {filteredContents.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun resultat.</p> : null}
                {filteredContents.map((item) => (
                  <article key={item.id} className="admin-item">
                    <p><strong>{item.title}</strong></p>
                    <p>{item.type} - {item.status} - source: {item.source}</p>
                    <small>{item.id}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "submissions" && (
            <section className="admin-panel">
              <h2>Soumissions createurs</h2>
              <div className="admin-list">
                {filteredSubmissions.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun resultat.</p> : null}
                {filteredSubmissions.map((item) => (
                  <article key={item.id} className="admin-item">
                    <p><strong>{item.title}</strong> ({item.type})</p>
                    <p>{item.creatorName} - {item.creatorEmail}</p>
                    <p>{item.synopsis}</p>
                    <p style={{ color: "var(--muted)" }}>Pitch: {item.pitch}</p>
                    <p>Statut: <strong>{item.status}</strong> {item.publishedCatalogId ? `- ${item.publishedCatalogId}` : ""}</p>
                    <p style={{ color: "var(--muted)" }}>{fmtDate(item.createdAt)}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateSubmissionStatus(item.id, "under_review")}>Review</button>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateSubmissionStatus(item.id, "approved")}>Approve</button>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateSubmissionStatus(item.id, "rejected")}>Reject</button>
                      <button disabled={actionLoading} className="admin-action primary" onClick={() => updateSubmissionStatus(item.id, "published", true)}>Publier</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "messages" && (
            <section className="admin-panel">
              <h2>Inbox collaborateurs</h2>
              <div className="admin-list">
                {filteredMessages.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun resultat.</p> : null}
                {filteredMessages.map((item) => (
                  <article key={item.id} className="admin-item">
                    <p><strong>{item.name}</strong> - {item.email}</p>
                    <p>{item.organization ?? "Sans organisation"} | {item.interestArea ?? "Interet non precise"}</p>
                    <p>{item.message}</p>
                    <p>Statut: <strong>{item.status}</strong> - {fmtDate(item.createdAt)}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateMessageStatus(item.id, "reviewed")}>Reviewed</button>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateMessageStatus(item.id, "contacted")}>Contacted</button>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateMessageStatus(item.id, "archived")}>Archive</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "feedback" && (
            <section className="admin-panel">
              <h2>Avis utilisateurs</h2>
              <div className="admin-list">
                {filteredFeedback.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun resultat.</p> : null}
                {filteredFeedback.map((item) => (
                  <article key={item.id} className="admin-item">
                    <p><strong>{item.name}</strong> ({item.rating}/5) - {item.email ?? "email non fourni"}</p>
                    <p>{item.comment}</p>
                    <p>Statut: <strong>{item.status}</strong> - {fmtDate(item.createdAt)}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateFeedbackStatus(item.id, "reviewed")}>Reviewed</button>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateFeedbackStatus(item.id, "featured")}>Feature</button>
                      <button disabled={actionLoading} className="admin-action" onClick={() => updateFeedbackStatus(item.id, "archived")}>Archive</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "audit" && (
            <section className="admin-panel">
              <h2>Journal d'audit admin</h2>
              <div className="admin-list">
                {filteredAudit.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun resultat.</p> : null}
                {filteredAudit.map((item) => (
                  <article key={item.id} className="admin-item">
                    <p><strong>{item.action}</strong> - {item.actorEmail}</p>
                    <p>{item.entityType}: {item.entityId}</p>
                    {item.payloadJson ? <p style={{ color: "var(--muted)" }}>{item.payloadJson}</p> : null}
                    <p style={{ color: "var(--muted)" }}>{fmtDate(item.createdAt)}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "studio" && (
            <AdminKanban items={studioSubmissions} onMove={updateStudioStatus} />
          )}

          {activeTab === "haac" && (
            <HaacVisaPanel items={haacQueue} flagsByContent={haacFlagsByContent} onAction={applyHaacAction} onDub={launchAiDub} />
          )}

          {activeTab === "revenue" && (
            <section className="admin-panel">
              <h2>Revenus createurs en attente</h2>
              <div className="admin-list">
                {filteredRevenue.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun paiement en attente.</p> : null}
                {filteredRevenue.map((item) => (
                  <article key={item.creatorId} className="admin-item" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <p><strong>{item.creatorId}</strong></p>
                      <p style={{ margin: 0, color: "var(--muted)" }}>Montant du: {item.dueAmount.toFixed(2)} EUR</p>
                    </div>
                    <button disabled={actionLoading} className="admin-action primary" onClick={() => markRevenuePaid(item.creatorId)}>
                      Marquer paye
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
