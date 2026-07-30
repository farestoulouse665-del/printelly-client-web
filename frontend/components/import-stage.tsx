"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ClipboardPaste,
  FileImage,
  Download,
  Edit3,
  FolderSearch,
  LoaderCircle,
  LockKeyhole,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
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
import { dpiForPrintSize, maximumPrintSizeAtDpi, qualityForDpi } from "@/lib/dtf";
import { parametersForRemovalMode, REMOVAL_PROFILES } from "@/lib/removal-profiles";
import type { Asset } from "@/lib/types";
import { useStudio } from "@/store/studio";

const backgroundProvider =
  process.env.NEXT_PUBLIC_BACKGROUND_PROVIDER ?? "local";
const externalRemovalProvider = backgroundProvider !== "local";
const externalProviderLabel =
  backgroundProvider === "photoroom" ? "PhotoRoom API" : "remove.bg API";

const MaskEditor = dynamic(
  () => import("@/components/mask-editor").then((module) => module.MaskEditor),
  {
    ssr: false,
    loading: () => (
      <div className="editor-loading">Chargement de l’atelier de retouche…</div>
    ),
  },
);

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

function AssetPreview({
  asset,
  resultUrl,
  onResultLoadError,
}: {
  asset: Asset;
  resultUrl: string | null;
  onResultLoadError: (assetId: string) => void;
}) {
  const original = asset.original_download_url;
  const result = resultUrl;
  const [view, setView] = useState<"result" | "original">(
    result ? "result" : "original",
  );
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);
  const [resultLoading, setResultLoading] = useState(Boolean(result));
  const [loadError, setLoadError] = useState("");
  const failedResultUrl = useRef<string | null>(null);

  useEffect(() => {
    setView(result ? "result" : "original");
    setLoadError("");
    failedResultUrl.current = null;
    if (!result) {
      setResultBlobUrl(null);
      setResultLoading(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setResultBlobUrl(null);
    setResultLoading(true);

    void fetch(result, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "image/png,image/*;q=0.9" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Aperçu indisponible (HTTP ${response.status}).`);
        }
        const blob = await response.blob();
        if (!blob.type.toLowerCase().startsWith("image/")) {
          throw new Error("Le serveur n’a pas retourné une image.");
        }
        objectUrl = URL.createObjectURL(blob);
        setResultBlobUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setResultLoading(false);
        setLoadError(
          cause instanceof Error
            ? `${cause.message} Nouvelle tentative en cours…`
            : "L’aperçu PNG n’a pas pu être chargé. Nouvelle tentative en cours…",
        );
        if (failedResultUrl.current !== result) {
          failedResultUrl.current = result;
          onResultLoadError(asset.id);
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.id, onResultLoadError, result]);

  const visibleUrl =
    view === "result" && result ? resultBlobUrl : original;
  const visibleLabel = view === "result" && result ? "Résultat" : "Original";
  const waitingForResult =
    view === "result" && Boolean(result) && !resultBlobUrl && !loadError;

  return (
    <div className="asset-preview checkerboard" aria-busy={waitingForResult}>
      {visibleUrl ? (
        <img
          key={visibleUrl}
          src={visibleUrl}
          alt={`${visibleLabel} de ${asset.name}`}
          onLoad={() => {
            setResultLoading(false);
            setLoadError("");
          }}
          onError={() => {
            setResultLoading(false);
            setLoadError(
              "Le PNG a été reçu mais son aperçu n’a pas pu être affiché. Nouvelle tentative en cours…",
            );
            if (
              view === "result" &&
              result &&
              failedResultUrl.current !== result
            ) {
              failedResultUrl.current = result;
              onResultLoadError(asset.id);
            }
          }}
        />
      ) : waitingForResult || resultLoading ? (
        <div className="preview-loading" role="status">
          <LoaderCircle className="spin" size={30} />
          <strong>Affichage du résultat transparent…</strong>
          <small>Le PNG final est chargé directement dans l’aperçu.</small>
        </div>
      ) : (
        <FileImage size={40} />
      )}
      {result && (
        <div className="preview-switch" role="group" aria-label="Choisir l’aperçu">
          <button
            type="button"
            className={view === "result" ? "active" : ""}
            aria-pressed={view === "result"}
            onClick={() => setView("result")}
          >
            Résultat
          </button>
          <button
            type="button"
            className={view === "original" ? "active" : ""}
            aria-pressed={view === "original"}
            onClick={() => setView("original")}
          >
            Original
          </button>
        </div>
      )}
      {loadError && (
        <p className="preview-load-error" role="alert">
          <AlertCircle size={16} /> {loadError}
        </p>
      )}
      <span className={`preview-label ${view === "result" ? "after" : "before"}`}>
        {visibleLabel}
      </span>
    </div>
  );
}

function UploadZone() {
  const queryClient = useQueryClient();
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
            void queryClient.invalidateQueries({ queryKey: ["assets"] });
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
    [addAsset, queryClient, updateUpload],
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
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void processFiles(files);
        }}
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
              {asset.preview_download_url || asset.final_download_url || asset.original_download_url ? (
                <img
                  src={
                    asset.preview_download_url ??
                    asset.final_download_url ??
                    asset.original_download_url ??
                    ""
                  }
                  alt=""
                />
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

function ProcessingPanel({
  asset,
  onResultReady,
  onOpenEditor,
}: {
  asset: Asset;
  onResultReady: (assetId: string, resultUrl: string) => void;
  onOpenEditor: () => void;
}) {
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

  useEffect(() => {
    return () => streamController.current?.abort();
  }, []);

  async function start() {
    setError("");
    try {
      const created = await createBackgroundJob(
        asset.id,
        mode,
        parametersForRemovalMode(mode),
      );
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
        if (completed.download_url) {
          onResultReady(asset.id, completed.download_url);
          patchAsset(asset.id, {
            final_download_url: completed.download_url,
            status: "processed",
            updated_at: completed.updated_at,
          });
        }
        const refreshed = await apiFetch<Asset>(`/assets/${asset.id}`);
        const finalResultUrl =
          refreshed.final_download_url ?? completed.download_url;
        const previewResultUrl =
          refreshed.preview_download_url ?? finalResultUrl;
        if (previewResultUrl) {
          onResultReady(asset.id, previewResultUrl);
        }
        patchAsset(asset.id, {
          ...refreshed,
          final_download_url: finalResultUrl,
        });
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
          {externalRemovalProvider ? externalProviderLabel : "BiRefNet ONNX local"}
        </small>
      </div>
      {externalRemovalProvider && (
        <p className="inline-warning">
          Ce mode transmet l’image au prestataire configuré et consomme un crédit API.
          Les couleurs et dimensions originales restent préservées localement.
        </p>
      )}
      <div className="mode-grid">
        {REMOVAL_PROFILES.map((profile) => (
          <button
            type="button"
            key={profile.mode}
            className={mode === profile.mode ? "active" : ""}
            aria-pressed={mode === profile.mode}
            onClick={() => setMode(profile.mode)}
          >
            <strong>{profile.label}</strong>
            <small>{profile.description}</small>
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
      {asset.final_download_url && (
        <>
          <p className="action-message" role="status">
            <CheckCircle2 size={17} />
            Résultat prêt : l’aperçu transparent est affiché à gauche.
          </p>
          <div className="result-actions">
            <button type="button" className="secondary-button full editor-link" onClick={onOpenEditor}>
              <Edit3 size={17} /> Retoucher le résultat ici
            </button>
            <a className="primary-button full" href={asset.final_download_url} download>
              <Download size={17} /> Télécharger le PNG transparent
            </a>
          </div>
        </>
      )}
      {error && <p className="inline-error"><AlertCircle size={17} /> {error}</p>}
    </div>
  );
}

export function ImportStage() {
  const tab = useStudio((state) => state.activeTab);
  const setTab = useStudio((state) => state.setTab);
  const assets = useStudio((state) => state.assets);
  const selectedAssetId = useStudio((state) => state.selectedAssetId);
  const jobs = useStudio((state) => state.jobs);
  const [liveResultUrls, setLiveResultUrls] = useState<Record<string, string>>({});
  const [printWidthCm, setPrintWidthCm] = useState(20);
  const [editorAssetId, setEditorAssetId] = useState<string | null>(null);
  const selected = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const registerResult = useCallback((assetId: string, resultUrl: string) => {
    setLiveResultUrls((current) => ({
      ...current,
      [assetId]: resultUrl,
    }));
  }, []);
  const renewResultUrl = useCallback(
    (assetId: string) => {
      window.setTimeout(() => {
        void apiFetch<Asset>(`/assets/${assetId}`)
          .then((refreshed) => {
            const refreshedResultUrl =
              refreshed.preview_download_url ?? refreshed.final_download_url;
            if (refreshedResultUrl) {
              registerResult(assetId, refreshedResultUrl);
            }
          })
          .catch(() => {
            // The visible error remains available to the user.
          });
      }, 1000);
    },
    [registerResult],
  );
  const completedResultUrl = useMemo(() => {
    if (!selected) return null;
    return (
      Object.values(jobs)
        .filter(
          (job) =>
            job.asset_id === selected.id &&
            job.state === "completed" &&
            Boolean(job.download_url),
        )
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0]
        ?.download_url ?? null
    );
  }, [jobs, selected]);
  const selectedResultUrl = selected
    ? (
        liveResultUrls[selected.id] ??
        (selected.status === "processed"
          ? selected.preview_download_url
          : null) ??
        completedResultUrl ??
        selected.final_download_url ??
        null
      )
    : null;
  const printHeightCm = selected
    ? (printWidthCm * selected.height) / Math.max(1, selected.width)
    : 0;
  const availablePrintDpi = selected
    ? Math.round(
        dpiForPrintSize(
          selected.width,
          selected.height,
          printWidthCm,
          printHeightCm,
        ),
      )
    : null;
  const maximumAt300Dpi = selected
    ? maximumPrintSizeAtDpi(selected.width, selected.height, 300)
    : null;
  const dpiTone =
    availablePrintDpi && availablePrintDpi > 0
      ? qualityForDpi(availablePrintDpi).tone
      : "good";
  const embeddedDpi =
    selected?.dpi_x || selected?.dpi_y
      ? [selected.dpi_x, selected.dpi_y]
          .filter((value): value is number => typeof value === "number")
          .map((value) => Math.round(value))
          .join(" × ")
      : "Métadonnée absente";
  return (
    <section className="stage-card" aria-labelledby="import-title">
      <div className="stage-heading">
        <span className="stage-kicker">STUDIO</span>
        <div><h2 id="import-title">Importez votre design</h2><p>Le moteur configuré supprime le fond sans modifier votre texte, vos couleurs ou votre sujet.</p></div>
      </div>
      <div className="tab-list" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "new"} className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>
          Nouveau fichier
        </button>
        <button type="button" role="tab" aria-selected={tab === "library"} className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          Images de cette session
        </button>
      </div>
      {tab === "new" ? <UploadZone /> : <Library />}
      {selected && (
        <div className="selected-workspace">
          <div className="asset-inspector">
            <AssetPreview
              key={`${selected.id}:${selectedResultUrl ?? "original"}:${selected.updated_at}`}
              asset={selected}
              resultUrl={selectedResultUrl}
              onResultLoadError={renewResultUrl}
            />
            <div className="asset-meta">
              <div><strong>{selected.name}</strong><span>{formatBytes(selected.byte_size)}</span></div>
              <dl>
                <div><dt>Pixels</dt><dd>{selected.width} × {selected.height}</dd></div>
                <div><dt>Format</dt><dd>{selected.mime_type.replace("image/", "").toUpperCase()}</dd></div>
                <div><dt>Transparence</dt><dd>{selected.has_transparency ? "Présente" : "Absente"}</dd></div>
                <div><dt>DPI intégré</dt><dd>{embeddedDpi}</dd></div>
                <div><dt>Profil</dt><dd>{selected.color_profile}</dd></div>
                <div><dt>Qualité</dt><dd>{selected.quality_score ?? "À analyser"}</dd></div>
              </dl>
              <div className={`dpi-capacity ${dpiTone}`} role="status">
                <strong>
                  {availablePrintDpi
                    ? `${availablePrintDpi} DPI disponibles à ${printWidthCm.toFixed(1)} × ${printHeightCm.toFixed(1)} cm`
                    : `300 DPI jusqu’à ${maximumAt300Dpi?.widthCm.toFixed(1)} × ${maximumAt300Dpi?.heightCm.toFixed(1)} cm`}
                </strong>
                <small>
                  Calcul réel à partir des {selected.width} × {selected.height} pixels.
                  {" Ajustez la largeur ci-dessous : le ratio original reste verrouillé."}
                </small>
              </div>
              <div className="print-size-control">
                <label htmlFor="print-width">Largeur d’impression</label>
                <div>
                  <input
                    id="print-width"
                    type="number"
                    min="1"
                    max="200"
                    step="0.5"
                    value={printWidthCm}
                    onChange={(event) =>
                      setPrintWidthCm(
                        Math.min(200, Math.max(1, Number(event.target.value) || 1)),
                      )
                    }
                  />
                  <span>cm</span>
                  <strong>× {printHeightCm.toFixed(1)} cm</strong>
                </div>
                <small>Proportions verrouillées · calcul DPI instantané</small>
              </div>
            </div>
          </div>
          <ProcessingPanel
            asset={selected}
            onResultReady={registerResult}
            onOpenEditor={() => setEditorAssetId(selected.id)}
          />
        </div>
      )}
      {selected?.final_download_url && editorAssetId === selected.id && (
        <section className="inline-mask-editor" aria-label="Retouche manuelle du résultat">
          <div className="inline-editor-heading">
            <div>
              <span>RETOUCHE NON DESTRUCTIVE</span>
              <h3>Perfectionnez les cheveux, contours et détails fins</h3>
              <p>Chaque correction crée une nouvelle version. Les couleurs et l’original restent intacts.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setEditorAssetId(null)}>
              Fermer l’atelier
            </button>
          </div>
          <MaskEditor key={selected.id} assetId={selected.id} />
        </section>
      )}
    </section>
  );
}
