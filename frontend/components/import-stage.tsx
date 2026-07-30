"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ClipboardPaste,
  FileImage,
  Edit3,
  FolderSearch,
  LoaderCircle,
  LockKeyhole,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  cancelJob,
  createBackgroundJob,
  getJob,
  listAssets,
  streamJobEvents,
  uploadAsset,
} from "@/lib/api";
import type { Asset, ProcessingJob, RemovalMode } from "@/lib/types";
import { useStudio } from "@/store/studio";

const externalRemovalProvider =
  process.env.NEXT_PUBLIC_BACKGROUND_PROVIDER === "removebg";

const modes: Array<{ value: RemovalMode; label: string; detail: string }> = [
  { value: "automatic", label: "Automatique", detail: "Le moteur recommande le meilleur profil" },
  { value: "person_hair", label: "Personne et cheveux", detail: "Mèches, barbe, visage et vêtements" },
  { value: "logo_text", label: "Logo et texte", detail: "Blanc interne et typographies protégés" },
  { value: "complex_illustration", label: "Illustration complexe", detail: "Couleurs et contours fins" },
  { value: "product", label: "Objet ou produit", detail: "Volumes et ombres maîtrisées" },
  { value: "white_background", label: "Fond blanc", detail: "Réduction des halos clairs" },
  { value: "black_background", label: "Fond noir", detail: "Détails sombres protégés" },
  { value: "gray_background", label: "Fond gris", detail: "Contours et gris internes préservés" },
  { value: "colored_background", label: "Fond coloré", detail: "Connectivité et couleur dominante" },
  { value: "clean_transparent", label: "Déjà transparent", detail: "Nettoyage sans détériorer l’alpha existant" },
  { value: "preserve_shadows", label: "Préserver les ombres", detail: "Transparence douce et ombres utiles" },
  { value: "remove_shadows", label: "Supprimer les ombres", detail: "Sujet net sans ombre extérieure" },
  { value: "dtf_high_precision", label: "DTF haute précision", detail: "Préservation maximale du design" },
];

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Suivi annulé", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 800);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Suivi annulé", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

function AssetPreview({ asset }: { asset: Asset }) {
  const [position, setPosition] = useState(50);
  const original = asset.original_download_url;
  const result = asset.final_download_url;
  return (
    <div className="asset-preview checkerboard">
      {original ? <img src={original} alt={`Original de ${asset.name}`} /> : <FileImage size={40} />}
      {result && (
        <div className="result-layer" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img src={result} alt={`Résultat transparent de ${asset.name}`} />
        </div>
      )}
      {result && (
        <label className="comparison-slider">
          <span className="sr-only">Comparer avant et après</span>
          <input
            type="range"
            min="0"
            max="100"
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
          />
        </label>
      )}
      <span className="preview-label before">Avant</span>
      {result && <span className="preview-label after">Après</span>}
    </div>
  );
}

function UploadZone() {
  const addAsset = useStudio((state) => state.addAsset);
  const uploads = useStudio((state) => state.uploads);
  const updateUpload = useStudio((state) => state.updateUpload);
  const input = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const [dragging, setDragging] = useState(false);

  const processFiles = useCallback(
    async (incoming: File[]) => {
      const files = incoming.slice(0, 25);
      const queue = [...files];
      async function worker() {
        while (queue.length) {
          const file = queue.shift();
          if (!file) return;
          const id = crypto.randomUUID();
          const controller = new AbortController();
          controllers.current.set(id, controller);
          updateUpload({ id, fileName: file.name, progress: 0, state: "uploading" });
          try {
            const asset = await uploadAsset(
              file,
              (progress) =>
                updateUpload({ id, fileName: file.name, progress, state: "uploading" }),
              controller.signal,
            );
            addAsset(asset);
            updateUpload({ id, fileName: file.name, progress: 100, state: "completed" });
          } catch (error) {
            const cancelled = error instanceof DOMException && error.name === "AbortError";
            updateUpload({
              id,
              fileName: file.name,
              progress: 0,
              state: cancelled ? "cancelled" : "failed",
              error: error instanceof Error ? error.message : "Import impossible.",
            });
          } finally {
            controllers.current.delete(id);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
    },
    [addAsset, updateUpload],
  );

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) void processFiles(files);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [processFiles]);

  return (
    <div>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept=".png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.pdf,.svg,.psd,.ai"
        onChange={(event) => void processFiles(Array.from(event.target.files ?? []))}
      />
      <div
        className={`upload-zone ${dragging ? "dragging" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") input.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void processFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="upload-icon"><UploadCloud size={28} /></div>
        <strong>Déposez jusqu’à 25 fichiers</strong>
        <p>Glissez-déposez, collez depuis le presse-papiers ou sélectionnez vos originaux.</p>
        <button type="button" className="primary-button" onClick={(event) => { event.stopPropagation(); input.current?.click(); }}>
          Parcourir les fichiers
        </button>
        <span className="upload-types">PNG · JPG · WebP · TIFF · BMP · PDF · SVG · PSD · AI</span>
        <span className="paste-hint"><ClipboardPaste size={14} /> Ctrl/Cmd + V accepté</span>
      </div>
      <div className="recommendations">
        <span><CheckCircle2 size={15} /> PNG transparent recommandé</span>
        <span><CheckCircle2 size={15} /> 300 DPI à la taille d’impression</span>
        <span><LockKeyhole size={15} /> Traitement sur votre serveur</span>
      </div>
      {!!uploads.length && (
        <div className="upload-list" aria-live="polite">
          {uploads.slice(-8).map((entry) => (
            <div className={`upload-row ${entry.state}`} key={entry.id}>
              <span className="upload-state-icon">
                {entry.state === "uploading" && <LoaderCircle className="spin" size={18} />}
                {entry.state === "completed" && <CheckCircle2 size={18} />}
                {entry.state === "failed" && <AlertCircle size={18} />}
                {entry.state === "cancelled" && <X size={18} />}
              </span>
              <div>
                <strong>{entry.fileName}</strong>
                <small>{entry.error ?? `${entry.progress} %`}</small>
                <span className="progress-track"><span style={{ width: `${entry.progress}%` }} /></span>
              </div>
              {entry.state === "uploading" && (
                <button type="button" onClick={() => controllers.current.get(entry.id)?.abort()} aria-label={`Annuler ${entry.fileName}`}>
                  <X size={17} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Library() {
  const [search, setSearch] = useState("");
  const setAssets = useStudio((state) => state.setAssets);
  const assets = useStudio((state) => state.assets);
  const selected = useStudio((state) => state.selectedAssetId);
  const selectAsset = useStudio((state) => state.selectAsset);
  const query = useQuery({
    queryKey: ["assets", search],
    queryFn: () => listAssets(search),
  });
  useEffect(() => {
    if (query.data) setAssets(query.data.items);
  }, [query.data, setAssets]);
  return (
    <div className="library-panel">
      <label className="search-field">
        <Search size={18} />
        <span className="sr-only">Rechercher un design</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom…" />
      </label>
      {query.isLoading && <p className="empty-library"><LoaderCircle className="spin" /> Chargement de la bibliothèque…</p>}
      {!query.isLoading && !assets.length && (
        <p className="empty-library"><FolderSearch size={30} /> Aucun design dans cette session.</p>
      )}
      <div className="asset-grid compact">
        {assets.map((asset) => (
          <button
            type="button"
            key={asset.id}
            className={`library-card ${selected === asset.id ? "selected" : ""}`}
            onClick={() => selectAsset(asset.id)}
          >
            <span className="library-thumb checkerboard">
              {asset.final_download_url || asset.original_download_url ? (
                <img src={asset.final_download_url ?? asset.original_download_url ?? ""} alt="" />
              ) : <FileImage />}
            </span>
            <span><strong>{asset.name}</strong><small>{asset.width} × {asset.height} px</small></span>
            {asset.archived && <Archive size={15} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProcessingPanel({ asset }: { asset: Asset }) {
  const queryClient = useQueryClient();
  const mode = useStudio((state) => state.mode);
  const setMode = useStudio((state) => state.setMode);
  const jobs = useStudio((state) => state.jobs);
  const setJob = useStudio((state) => state.setJob);
  const applyJobEvent = useStudio((state) => state.applyJobEvent);
  const patchAsset = useStudio((state) => state.patchAsset);
  const [error, setError] = useState("");
  const streamController = useRef<AbortController | null>(null);
  const job = useMemo(
    () => Object.values(jobs).find((item) => item.asset_id === asset.id && !["failed", "cancelled"].includes(item.state)),
    [asset.id, jobs],
  );

  useEffect(() => () => streamController.current?.abort(), []);

  async function start() {
    setError("");
    try {
      const created = await createBackgroundJob(asset.id, mode, {
        protect_details: true,
        remove_haze: true,
        decontaminate: true,
        cleanup: "normal",
        black_background_mode: mode === "black_background" ? "smart" : "off",
      });
      setJob(created);
      const controller = new AbortController();
      streamController.current = controller;
      try {
        await streamJobEvents(
          created.id,
          (event) => applyJobEvent(created.id, event),
          controller.signal,
        );
      } catch (streamError) {
        if (
          streamError instanceof Error &&
          streamError.name === "AbortError"
        ) {
          throw streamError;
        }
        let snapshot = await getJob(created.id);
        setJob(snapshot);
        while (!["completed", "failed", "cancelled"].includes(snapshot.state)) {
          await waitForNextPoll(controller.signal);
          snapshot = await getJob(created.id);
          setJob(snapshot);
        }
      }
      const completed = await getJob(created.id);
      setJob(completed);
      if (completed.state === "completed") {
        const refreshed = await apiFetch<Asset>(`/assets/${asset.id}`);
        patchAsset(asset.id, refreshed);
        await queryClient.invalidateQueries({ queryKey: ["assets"] });
      } else if (completed.error_message) {
        setError(completed.error_message);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Traitement impossible.");
    }
  }

  return (
    <div className="processing-panel">
      <div className="mode-header">
        <span><Sparkles size={18} /> Profil de détourage</span>
        <small>
          {externalRemovalProvider ? "remove.bg API payante" : "BiRefNet ONNX local"}
        </small>
      </div>
      {externalRemovalProvider && (
        <p className="inline-warning">
          Ce mode transmet l’image à remove.bg et consomme un crédit API.
          Les couleurs et dimensions originales restent préservées localement.
        </p>
      )}
      <div className="mode-grid">
        {modes.map((item) => (
          <button type="button" key={item.value} className={mode === item.value ? "active" : ""} onClick={() => setMode(item.value)}>
            <strong>{item.label}</strong><small>{item.detail}</small>
          </button>
        ))}
      </div>
      {job && !["completed", "failed", "cancelled"].includes(job.state) ? (
        <div className="job-progress" aria-live="polite">
          <div><strong>{job.stage_message}</strong><span>{job.progress} %</span></div>
          <span className="progress-track"><span style={{ width: `${job.progress}%` }} /></span>
          <button type="button" className="text-button danger" onClick={() => void cancelJob(job.id)}>
            Annuler le traitement
          </button>
        </div>
      ) : (
        <button type="button" className="primary-button full" onClick={() => void start()}>
          <Sparkles size={18} /> Supprimer le fond
        </button>
      )}
      {asset.final_download_url && <Link className="secondary-button full editor-link" href={`/editor/${asset.id}`}><Edit3 size={17} /> Corriger le masque manuellement</Link>}
      {error && <p className="inline-error"><AlertCircle size={17} /> {error}</p>}
    </div>
  );
}

export function ImportStage() {
  const tab = useStudio((state) => state.activeTab);
  const setTab = useStudio((state) => state.setTab);
  const assets = useStudio((state) => state.assets);
  const selectedAssetId = useStudio((state) => state.selectedAssetId);
  const selected = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  return (
    <section className="stage-card" aria-labelledby="import-title">
      <div className="stage-heading">
        <span className="stage-kicker">ÉTAPE 1</span>
        <div><h2 id="import-title">Importez votre design</h2><p>Le fond sera supprimé localement, sans modifier votre texte, vos couleurs ou votre sujet.</p></div>
      </div>
      <div className="tab-list" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "new"} className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>
          Nouveau fichier
        </button>
        <button type="button" role="tab" aria-selected={tab === "library"} className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          Mes designs
        </button>
      </div>
      {tab === "new" ? <UploadZone /> : <Library />}
      {selected && (
        <div className="selected-workspace">
          <div className="asset-inspector">
            <AssetPreview asset={selected} />
            <div className="asset-meta">
              <div><strong>{selected.name}</strong><span>{formatBytes(selected.byte_size)}</span></div>
              <dl>
                <div><dt>Pixels</dt><dd>{selected.width} × {selected.height}</dd></div>
                <div><dt>Format</dt><dd>{selected.mime_type.replace("image/", "").toUpperCase()}</dd></div>
                <div><dt>Transparence</dt><dd>{selected.has_transparency ? "Présente" : "Absente"}</dd></div>
                <div><dt>DPI</dt><dd>{selected.dpi_x ? Math.round(selected.dpi_x) : "Non défini"}</dd></div>
                <div><dt>Profil</dt><dd>{selected.color_profile}</dd></div>
                <div><dt>Qualité</dt><dd>{selected.quality_score ?? "À analyser"}</dd></div>
              </dl>
            </div>
          </div>
          <ProcessingPanel asset={selected} />
        </div>
      )}
    </section>
  );
}
