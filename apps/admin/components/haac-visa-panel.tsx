"use client";

import { useState } from "react";

type HaacItem = {
  id: string;
  title: string;
  haacStatus: "DRAFT" | "QUARANTAINE" | "VISA_OK" | "REJETE_HAAC" | "+16" | "+18";
  posterPath: string | null;
  qcStatus: string;
  aiDubLangs: string[];
};

type FlagItem = {
  id: number;
  flagType: string;
  severity: number;
  aiConfidence: number;
  evidence: string | null;
};

function recommendAction(item: HaacItem, flags: FlagItem[]): "VISA_OK" | "+16" | "+18" | "REJETE_HAAC" {
  if (item.qcStatus !== "PASSED") return "REJETE_HAAC";
  const maxSeverity = flags.reduce((max, f) => Math.max(max, f.severity), 0);
  if (maxSeverity >= 5) return "REJETE_HAAC";
  if (maxSeverity >= 4) return "+18";
  if (maxSeverity === 3) return "+16";
  return "VISA_OK";
}

export default function HaacVisaPanel({
  items,
  flagsByContent,
  onAction,
  onDub
}: {
  items: HaacItem[];
  flagsByContent: Record<string, FlagItem[]>;
  onAction: (contentId: string, action: "VISA_OK" | "+16" | "+18" | "REJETE_HAAC", reason?: string) => void;
  onDub: (contentId: string, lang: "fon" | "mina" | "yoruba" | "dendi") => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [dubLangs, setDubLangs] = useState<Record<string, "fon" | "mina" | "yoruba" | "dendi">>({});

  return (
    <section className="admin-panel">
      <h2>Visa HAAC</h2>
      <div className="admin-list">
        {items.map((item) => {
          const flags = flagsByContent[item.id] ?? [];
          const recommendation = recommendAction(item, flags);
          const canVisaOk = item.qcStatus === "PASSED";

          return (
            <article key={item.id} className="admin-item">
              <p><strong>{item.title}</strong></p>
              <p>
                Statut HAAC: <strong>{item.haacStatus}</strong> · QC: <strong>{item.qcStatus}</strong>
              </p>
              <p className="decision-chip">Action recommandee: {recommendation}</p>

              {item.posterPath ? <img src={item.posterPath} alt={item.title} style={{ width: 140, borderRadius: 8, border: "1px solid var(--line)" }} /> : null}

              <div style={{ marginTop: 8 }}>
                {flags.length === 0 ? <p style={{ margin: "4px 0", color: "var(--muted)" }}>Aucun flag detecte.</p> : null}
                {flags.map((flag) => (
                  <p key={flag.id} style={{ margin: "4px 0", color: "var(--muted)" }}>
                    {flag.flagType} sev={flag.severity} conf={flag.aiConfidence.toFixed(2)} {flag.evidence ? `(${flag.evidence})` : ""}
                  </p>
                ))}
              </div>

              <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>Motif admin (optionnel)</span>
                <textarea
                  value={reasons[item.id] ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Ex: violence explicite, necessite classification +18"
                  style={{ background: "#10182b", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: 8, minHeight: 68 }}
                />
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button className="admin-action primary" disabled={!canVisaOk} title={canVisaOk ? "Accorder le visa" : "QC doit etre PASSED"} onClick={() => onAction(item.id, "VISA_OK", reasons[item.id])}>VISA_OK</button>
                <button className="admin-action" onClick={() => onAction(item.id, "+16", reasons[item.id])}>METTRE +16</button>
                <button className="admin-action" onClick={() => onAction(item.id, "+18", reasons[item.id])}>METTRE +18</button>
                <button className="admin-action" onClick={() => onAction(item.id, "REJETE_HAAC", reasons[item.id])}>REJETE_HAAC</button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                <select
                  value={dubLangs[item.id] ?? "fon"}
                  onChange={(e) => setDubLangs((prev) => ({ ...prev, [item.id]: e.target.value as "fon" | "mina" | "yoruba" | "dendi" }))}
                  style={{ background: "#10182b", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px" }}
                >
                  <option value="fon">Fon</option>
                  <option value="mina">Mina</option>
                  <option value="yoruba">Yoruba</option>
                  <option value="dendi">Dendi</option>
                </select>
                <button className="admin-action" onClick={() => onDub(item.id, dubLangs[item.id] ?? "fon")}>Lancer doublage IA</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
