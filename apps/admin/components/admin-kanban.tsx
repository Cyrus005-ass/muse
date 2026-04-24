"use client";

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

const columns = ["UPLOADED", "QC", "DROITS", "VISA_HAAC", "PROGRAMME", "PUBLIE", "NEED_RESUBMIT", "QUARANTAINE"];

function nextActionsFor(status: string): string[] {
  if (status === "UPLOADED") return ["QC", "DROITS", "NEED_RESUBMIT"];
  if (status === "QC") return ["DROITS", "VISA_HAAC", "NEED_RESUBMIT"];
  if (status === "DROITS") return ["VISA_HAAC", "PROGRAMME", "NEED_RESUBMIT"];
  if (status === "VISA_HAAC") return ["PROGRAMME", "PUBLIE", "QUARANTAINE"];
  if (status === "PROGRAMME") return ["PUBLIE", "QUARANTAINE", "NEED_RESUBMIT"];
  if (status === "PUBLIE") return ["PROGRAMME", "QUARANTAINE", "NEED_RESUBMIT"];
  if (status === "QUARANTAINE") return ["QC", "DROITS", "NEED_RESUBMIT"];
  return ["UPLOADED", "QC", "DROITS"];
}

export default function AdminKanban({
  items,
  onMove
}: {
  items: StudioSubmission[];
  onMove: (id: number, status: string) => void;
}) {
  return (
    <section className="admin-panel">
      <h2>Studio & Droits</h2>
      <div className="kanban-grid">
        {columns.map((col) => {
          const colItems = items.filter((item) => item.status === col);
          return (
            <article key={col} className="kanban-col">
              <h3>{col} ({colItems.length})</h3>
              {colItems.length === 0 ? <p style={{ color: "var(--muted)" }}>Aucun item</p> : null}
              {colItems.map((item) => (
                <div key={item.id} className="kanban-card">
                  <p><strong>{item.title}</strong></p>
                  <p style={{ color: "var(--muted)" }}>{item.synopsis}</p>
                  <p>{item.originalLang.toUpperCase()} · {item.contentId}</p>
                  {item.adminNote ? <p style={{ color: "#ffcb96" }}>Note: {item.adminNote}</p> : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {nextActionsFor(col).map((status) => (
                      <button key={status} className="admin-action" onClick={() => onMove(item.id, status)}>{status}</button>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}
