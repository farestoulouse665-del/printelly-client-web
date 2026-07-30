"use client";

import { Activity, Cpu, Database, LoaderCircle, MemoryStick, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { apiFetch } from "@/lib/api";

type Dashboard = {
  counts: { assets: number; jobs_active: number; reviews_pending: number; orders: number; queue: number | null };
  resources: { cpu_percent: number; memory_percent: number; memory_available_bytes: number };
  services: { redis: string };
};
type AdminJob = { id: string; asset_id: string; state: string; progress: number; message: string; attempt: number; error_code: string | null };
type Review = { id: string; asset_id: string; status: string; ai_confidence: number; customer_notes: string; operator_notes: string };

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setToken(sessionStorage.getItem("transferlab-admin-token") ?? ""); }, []);

  async function load(value = token) {
    if (!value) return;
    setBusy(true);
    setError("");
    const init = { headers: { "X-Admin-Token": value } };
    try {
      const [overview, activeJobs, pendingReviews] = await Promise.all([
        apiFetch<Dashboard>("/admin/dashboard", init, false),
        apiFetch<AdminJob[]>("/admin/jobs", init, false),
        apiFetch<Review[]>("/admin/reviews", init, false),
      ]);
      sessionStorage.setItem("transferlab-admin-token", value);
      setDashboard(overview);
      setJobs(activeJobs);
      setReviews(pendingReviews);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accès impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    await load();
  }

  async function decide(reviewId: string, status: "approved" | "rejected" | "needs_changes") {
    try {
      await apiFetch(`/admin/reviews/${reviewId}/decision`, {
        method: "POST",
        headers: { "X-Admin-Token": token },
        body: JSON.stringify({ status, operator_notes: "Décision enregistrée depuis le tableau de bord." }),
      }, false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Décision impossible.");
    }
  }

  return (
    <><Header /><main className="simple-page">
      <div className="page-heading"><span>ADMINISTRATION PROTÉGÉE</span><h1>Pilotage Background Studio</h1><p>Les métriques proviennent de PostgreSQL, Redis et du système hôte. Les actions sensibles sont auditées.</p></div>
      {!dashboard ? (
        <form className="admin-login" onSubmit={login}>
          <ShieldCheck size={30} /><label><span>Jeton administrateur</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="current-password" /></label>
          <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} Ouvrir l’administration</button>
          {error && <p className="inline-error">{error}</p>}
        </form>
      ) : (
        <div className="admin-dashboard">
          <div className="metric-grid">
            <article><Database /><span><small>Designs</small><strong>{dashboard.counts.assets}</strong></span></article>
            <article><Activity /><span><small>Jobs actifs</small><strong>{dashboard.counts.jobs_active}</strong></span></article>
            <article><Cpu /><span><small>CPU</small><strong>{dashboard.resources.cpu_percent} %</strong></span></article>
            <article><MemoryStick /><span><small>Mémoire</small><strong>{dashboard.resources.memory_percent} %</strong></span></article>
          </div>
          <div className="admin-columns">
            <section><div className="admin-section-title"><h2>File de traitements</h2><button type="button" onClick={() => void load()}>Actualiser</button></div><div className="admin-table">{jobs.map((job) => <div key={job.id}><span className={`status-dot ${job.state}`} /><code>{job.id.slice(0, 8)}</code><span>{job.message}</span><strong>{job.progress} %</strong></div>)}</div></section>
            <section><div className="admin-section-title"><h2>Vérifications humaines</h2><span>{dashboard.counts.reviews_pending} en attente</span></div><div className="review-list">{reviews.map((review) => <article key={review.id}><div><strong>{review.asset_id.slice(0, 8)}</strong><small>Confiance IA : {Math.round(review.ai_confidence * 100)} %</small><p>{review.customer_notes || "Aucune note client."}</p></div>{review.status === "requested" && <div><button type="button" onClick={() => void decide(review.id, "approved")}>Approuver</button><button type="button" onClick={() => void decide(review.id, "needs_changes")}>À corriger</button><button type="button" className="danger" onClick={() => void decide(review.id, "rejected")}>Refuser</button></div>}</article>)}</div></section>
          </div>
        </div>
      )}
    </main></>
  );
}
