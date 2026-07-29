"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  LoaderCircle,
  ScanSearch,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  analyzePreflight,
  apiFetch,
  createPngExport,
  createQuote,
} from "@/lib/api";
import type { PreflightIssue } from "@/lib/types";
import { useStudio } from "@/store/studio";

function Option({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="option-card">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="fake-toggle" />
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>
  );
}

function Issue({ issue }: { issue: PreflightIssue }) {
  const Icon = issue.severity === "error" ? AlertCircle : issue.severity === "warning" ? TriangleAlert : CheckCircle2;
  return (
    <li className={`preflight-issue ${issue.severity}`}>
      <Icon size={18} />
      <span><strong>{issue.title}</strong><small>{issue.explanation}</small></span>
      {issue.automatic_fix && <code>{issue.automatic_fix}</code>}
    </li>
  );
}

export function FinalizeStage() {
  const router = useRouter();
  const assets = useStudio((state) => state.assets);
  const selectedId = useStudio((state) => state.selectedAssetId);
  const sizes = useStudio((state) => state.sizes);
  const options = useStudio((state) => state.options);
  const setOptions = useStudio((state) => state.setOptions);
  const preflight = useStudio((state) => state.preflight);
  const setPreflight = useStudio((state) => state.setPreflight);
  const asset = assets.find((item) => item.id === selectedId) ?? assets[0];
  const size = sizes[0];
  const [busy, setBusy] = useState<"preflight" | "export" | "order" | "review" | null>(null);
  const [message, setMessage] = useState("");
  const canFinalize = Boolean(asset?.final_download_url && size);

  const totalQuantity = useMemo(
    () => sizes.reduce((sum, item) => sum + item.quantity * item.variants, 0),
    [sizes],
  );

  async function runPreflight() {
    if (!asset || !size) return;
    setBusy("preflight");
    setMessage("");
    try {
      const report = await analyzePreflight(asset.id, size.widthCm, size.heightCm);
      setPreflight(report);
      setMessage(report.status === "ready" ? "Votre fichier est prêt pour le DTF." : "Certaines zones nécessitent une vérification.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Contrôle DTF impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!asset || !size) return;
    setBusy("export");
    setMessage("");
    try {
      const result = await createPngExport(asset.id, size.widthCm, totalQuantity);
      const anchor = document.createElement("a");
      anchor.href = result.download_url;
      anchor.download = result.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setMessage("PNG transparent généré. Aucun fond artificiel n’a été ajouté.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function requestReview() {
    if (!asset) return;
    setBusy("review");
    setMessage("");
    try {
      await apiFetch("/human-reviews", {
        method: "POST",
        body: JSON.stringify({
          asset_id: asset.id,
          ai_confidence: Math.max(0, Math.min(1, (asset.quality_score ?? 75) / 100)),
          customer_notes: options.notes,
        }),
      });
      setOptions({ humanReview: true });
      setMessage("Le fichier a été placé dans la file de vérification PRINTELLY.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Demande impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function addToOrder() {
    if (!asset) return;
    setBusy("order");
    setMessage("");
    try {
      const quote = await createQuote(asset.id, sizes, options);
      sessionStorage.setItem("printelly-current-quote", JSON.stringify(quote));
      router.push(`/orders?quote=${encodeURIComponent(quote.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Devis impossible.");
      setBusy(null);
    }
  }

  return (
    <section className="stage-card" aria-labelledby="finalize-title">
      <div className="stage-heading">
        <span className="stage-kicker">ÉTAPE 3</span>
        <div><h2 id="finalize-title">Finalisez votre fichier DTF</h2><p>Chaque correction est explicite et réversible. Le contrôle ne modifie jamais le design en silence.</p></div>
      </div>
      {!asset || !size ? (
        <p className="empty-state"><ScanSearch size={28} /> Sélectionnez un design et au moins une dimension.</p>
      ) : (
        <div className="finalize-grid">
          <div>
            <h3>Options de préparation</h3>
            <div className="options-grid">
              <Option checked={options.humanReview} onChange={(value) => setOptions({ humanReview: value })} title="Vérification humaine" detail="Un graphiste PRINTELLY contrôle la version du masque." />
              <Option checked={options.individualCut} onChange={(value) => setOptions({ individualCut: value })} title="Découpe individuelle" detail="Chaque transfert est préparé séparément." />
              <Option checked={options.autoCenter} onChange={(value) => setOptions({ autoCenter: value })} title="Centrage automatique" detail="Le contenu est centré sans changer ses proportions." />
              <Option checked={options.transparentMargin} onChange={(value) => setOptions({ transparentMargin: value })} title="Marge transparente" detail="Ajoute une zone vide autour du contenu." />
              <Option checked={options.residueCleanup} onChange={(value) => setOptions({ residueCleanup: value })} title="Nettoyer les résidus" detail="Les petits groupes sont d’abord signalés." />
              <Option checked={options.haloRemoval} onChange={(value) => setOptions({ haloRemoval: value })} title="Réduire les halos" detail="Décontamination locale des contours." />
            </div>
            <label className="select-field">
              <span>Améliorer la qualité</span>
              <select value={options.resolutionEnhancement} onChange={(event) => setOptions({ resolutionEnhancement: event.target.value as typeof options.resolutionEnhancement })}>
                <option value="none">Résolution originale</option>
                <option value="2x">Agrandissement 2× non génératif</option>
                <option value="4x">Agrandissement 4× non génératif</option>
                <option value="300dpi">300 DPI à la taille choisie</option>
                <option value="600dpi">600 DPI pour petit logo</option>
              </select>
            </label>
            <label className="notes-field">
              <span>Notes pour l’équipe PRINTELLY</span>
              <textarea value={options.notes} maxLength={2000} rows={4} onChange={(event) => setOptions({ notes: event.target.value })} placeholder="Précisez les détails à protéger ou les consignes de production…" />
            </label>
          </div>
          <div className="preflight-card">
            <div className="preflight-head">
              <span><ScanSearch size={19} /> Contrôle qualité DTF</span>
              {preflight && <strong className={preflight.status}>{preflight.score}/100</strong>}
            </div>
            {!preflight ? (
              <p>L’analyse contrôle la transparence, le DPI, les halos, les pixels isolés et les détails fins.</p>
            ) : (
              <>
                <div className={`preflight-status ${preflight.status}`}>
                  {preflight.status === "ready" ? <CheckCircle2 /> : <TriangleAlert />}
                  <span>
                    <strong>{preflight.status === "ready" ? "Prêt pour impression" : preflight.status === "review" ? "Vérification recommandée" : "Correction nécessaire"}</strong>
                    <small>{preflight.dpi} DPI · {preflight.width_cm} × {preflight.height_cm} cm</small>
                  </span>
                </div>
                <ul className="preflight-list">
                  {preflight.issues.length ? preflight.issues.map((issue) => <Issue issue={issue} key={issue.code} />) : <li className="preflight-clear"><CheckCircle2 /> Aucun problème bloquant détecté.</li>}
                </ul>
              </>
            )}
            <button type="button" className="secondary-button full" disabled={!canFinalize || busy !== null} onClick={() => void runPreflight()}>
              {busy === "preflight" ? <LoaderCircle className="spin" /> : <ScanSearch />} Vérifier pour le DTF
            </button>
            <button type="button" className="secondary-button full" disabled={!asset.final_download_url || busy !== null} onClick={() => void requestReview()}>
              {busy === "review" ? <LoaderCircle className="spin" /> : <UserCheck />} Demander une vérification humaine
            </button>
          </div>
        </div>
      )}
      {asset?.final_download_url && (
        <div
          className={"garment-preview " + options.garmentPreview}
          aria-label={
            options.garmentPreview === "light"
              ? "Aperçu du design sur tee-shirt clair"
              : "Aperçu du design sur tee-shirt foncé"
          }
        >
          <div className="garment-shirt">
            <span className="garment-neck" />
            <img src={asset.final_download_url} alt="" />
          </div>
          <small>
            Aperçu informatif sur textile {options.garmentPreview === "light" ? "clair" : "foncé"}
          </small>
        </div>
      )}
      {message && <p className="action-message" aria-live="polite"><Sparkles size={17} /> {message}</p>}
      <div className="final-actions">
        <button type="button" className="secondary-button" disabled={!canFinalize || busy !== null} onClick={() => void download()}>
          {busy === "export" ? <LoaderCircle className="spin" /> : <Download />} Télécharger le PNG
        </button>
        <button type="button" className="primary-button" disabled={!canFinalize || busy !== null} onClick={() => void addToOrder()}>
          {busy === "order" ? <LoaderCircle className="spin" /> : <ShoppingBag />} Ajouter à ma commande DTF
        </button>
      </div>
      <div className="preview-switch">
        <Eye size={17} /> Prévisualisation vêtement
        <button type="button" className={options.garmentPreview === "light" ? "active" : ""} onClick={() => setOptions({ garmentPreview: "light" })}>Clair</button>
        <button type="button" className={options.garmentPreview === "dark" ? "active" : ""} onClick={() => setOptions({ garmentPreview: "dark" })}>Foncé</button>
      </div>
    </section>
  );
}
