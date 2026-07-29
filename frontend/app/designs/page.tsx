"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, Edit3, LoaderCircle, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Header } from "@/components/header";
import { apiFetch, listAssets } from "@/lib/api";

export default function DesignsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const query = useQuery({ queryKey: ["design-library", search, archived], queryFn: () => listAssets(search, archived) });
  const action = useMutation({
    mutationFn: ({ id, operation }: { id: string; operation: "archive" | "restore" | "delete" }) =>
      apiFetch(operation === "delete" ? `/assets/${id}` : `/assets/${id}/${operation}`, { method: operation === "delete" ? "DELETE" : "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["design-library"] }),
  });
  return (
    <><Header /><main className="simple-page">
      <div className="page-heading"><span>BIBLIOTHÈQUE PRIVÉE</span><h1>Mes designs</h1><p>Recherchez, archivez, restaurez, corrigez et réutilisez les versions de cette session.</p></div>
      <div className="library-toolbar">
        <label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom…" /></label>
        <button type="button" className={archived ? "active" : ""} onClick={() => setArchived(!archived)}><Archive size={17} /> {archived ? "Voir les actifs" : "Voir les archives"}</button>
      </div>
      {query.isLoading ? <p className="empty-state"><LoaderCircle className="spin" /> Chargement…</p> : (
        <div className="design-library-grid">
          {query.data?.items.map((asset) => (
            <article key={asset.id}>
              <div className="design-library-preview checkerboard"><img src={asset.final_download_url ?? asset.original_download_url ?? ""} alt={`Aperçu de ${asset.name}`} /></div>
              <div className="design-library-copy"><span className={`status-dot ${asset.status}`} /> <strong>{asset.name}</strong><small>{asset.width} × {asset.height} px · {asset.quality_score ?? "—"}/100</small></div>
              <div className="design-library-actions">
                {asset.final_download_url && <a href={asset.final_download_url} className="icon-button" aria-label="Télécharger"><Download size={16} /></a>}
                {asset.final_download_url && <Link href={`/editor/${asset.id}`} className="icon-button" aria-label="Corriger le masque"><Edit3 size={16} /></Link>}
                <button type="button" className="icon-button" onClick={() => action.mutate({ id: asset.id, operation: archived ? "restore" : "archive" })} aria-label={archived ? "Restaurer" : "Archiver"}>{archived ? <RotateCcw size={16} /> : <Archive size={16} />}</button>
                <button type="button" className="icon-button danger" onClick={() => action.mutate({ id: asset.id, operation: "delete" })} aria-label="Supprimer"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main></>
  );
}
