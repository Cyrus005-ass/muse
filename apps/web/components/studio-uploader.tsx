"use client";

import { FormEvent, useMemo, useState } from "react";
import { getApiUrl, TOKEN_KEY } from "../lib/session";

type Step = 1 | 2 | 3 | 4;

export default function StudioUploader() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [step, setStep] = useState<Step>(1);

  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [originalLang, setOriginalLang] = useState("fr");
  const [allowAiDub, setAllowAiDub] = useState(false);
  const [rightsCertified, setRightsCertified] = useState(false);

  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [rights, setRights] = useState<File | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function canGoStep2() {
    return title.trim().length >= 2 && synopsis.trim().length >= 20;
  }

  function canGoStep3() {
    return !!video;
  }

  function canSubmit() {
    return !!video && rightsCertified;
  }

  function resetForm() {
    setStep(1);
    setTitle("");
    setSynopsis("");
    setOriginalLang("fr");
    setAllowAiDub(false);
    setRightsCertified(false);
    setVideo(null);
    setPoster(null);
    setRights(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    if (!canSubmit()) {
      setStatus("Video obligatoire et certification des droits requise.");
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setStatus("Connecte-toi avant de soumettre un contenu.");
      return;
    }

    const form = new FormData();
    form.append("title", title);
    form.append("synopsis", synopsis);
    form.append("original_lang", originalLang);
    form.append("allow_ai_dub", allowAiDub ? "true" : "false");
    form.append("video", video as Blob);
    if (poster) form.append("poster", poster);
    if (rights) form.append("rights", rights);

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/creator/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error ?? "Soumission impossible.");
        return;
      }

      setStatus(`Soumission envoyee: ${data.contentId}. Etapes suivantes: QC -> HAAC -> Visa admin.`);
      resetForm();
    } catch {
      setStatus("Erreur reseau pendant l'upload.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="collab-card studio-uploader" onSubmit={submit}>
      <h3>Studio Uploader createur</h3>
      <p className="studio-subtitle">Parcours guide en 4 etapes pour reduire les erreurs de soumission.</p>

      <div className="studio-steps" role="tablist" aria-label="Etapes soumission">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={step === n ? "studio-step active" : "studio-step"}
            onClick={() => setStep(n as Step)}
            aria-selected={step === n}
          >
            {n}. {n === 1 ? "Projet" : n === 2 ? "Media" : n === 3 ? "Droits" : "Confirmation"}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section className="studio-panel">
          <label className="mini-type">Titre</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" required />

          <label className="mini-type">Synopsis</label>
          <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} placeholder="Synopsis (min 20 caracteres)" required />

          <label className="mini-type">Langue originale</label>
          <select value={originalLang} onChange={(e) => setOriginalLang(e.target.value)}>
            <option value="fr">Francais</option>
            <option value="fon">Fon</option>
            <option value="mina">Mina</option>
            <option value="yoruba">Yoruba</option>
            <option value="dendi">Dendi</option>
          </select>

          <button type="button" className="btn-secondary" disabled={!canGoStep2()} onClick={() => setStep(2)}>
            Continuer vers media
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="studio-panel">
          <label className="mini-type">Video mp4 (obligatoire)</label>
          <input type="file" accept="video/mp4" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} required />

          <label className="mini-type">Poster jpg/png (optionnel)</label>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPoster(e.target.files?.[0] ?? null)} />

          <p className="studio-hint">Etat media: {video ? "video chargee" : "video manquante"}</p>

          <div className="studio-actions-row">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Retour</button>
            <button type="button" className="btn-secondary" disabled={!canGoStep3()} onClick={() => setStep(3)}>Continuer vers droits</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="studio-panel">
          <label className="mini-type">Contrat / droits PDF (recommande)</label>
          <input type="file" accept="application/pdf" onChange={(e) => setRights(e.target.files?.[0] ?? null)} />

          <label className="checkbox-row">
            <input type="checkbox" checked={allowAiDub} onChange={(e) => setAllowAiDub(e.target.checked)} />
            <span>J'autorise le doublage IA en langues nationales.</span>
          </label>

          <label className="checkbox-row">
            <input type="checkbox" checked={rightsCertified} onChange={(e) => setRightsCertified(e.target.checked)} />
            <span>Je certifie detenir les droits. Art. 538 Code Penal BJ.</span>
          </label>

          <div className="studio-actions-row">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>Retour</button>
            <button type="button" className="btn-secondary" disabled={!rightsCertified} onClick={() => setStep(4)}>Continuer vers confirmation</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="studio-panel">
          <p className="studio-summary"><strong>Resume:</strong> {title || "Sans titre"} · {originalLang.toUpperCase()} · {video ? "Video OK" : "Video manquante"} · {rightsCertified ? "Droits certifies" : "Droits non certifies"}</p>
          <p className="studio-hint">Apres envoi: transcode HLS, QC auto, scan HAAC, puis validation admin.</p>

          <div className="studio-actions-row">
            <button type="button" className="btn-secondary" onClick={() => setStep(3)}>Retour</button>
            <button className="btn-primary" type="submit" disabled={loading || !canSubmit()}>
              {loading ? "Upload en cours..." : "Soumettre au studio"}
            </button>
          </div>
        </section>
      )}

      {status ? <p className="auth-switch" style={{ marginTop: 8 }}>{status}</p> : null}
    </form>
  );
}

