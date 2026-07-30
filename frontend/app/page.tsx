"use client";

import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Cpu,
  FileDown,
  Layers3,
  LockKeyhole,
  ScanLine,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";
import { ImportStage } from "@/components/import-stage";

const backgroundProvider =
  process.env.NEXT_PUBLIC_BACKGROUND_PROVIDER ?? "local";
const providerLabel =
  backgroundProvider === "photoroom"
    ? "PhotoRoom haute précision"
    : backgroundProvider === "removebg"
      ? "remove.bg haute précision"
      : "BiRefNet ONNX local";
const privacyLabel =
  backgroundProvider === "local"
    ? "Vos fichiers restent sur votre serveur"
    : "Transmission chiffrée au prestataire configuré uniquement";

const promises = [
  { icon: ScanLine, label: "Cheveux et détails fins" },
  { icon: Layers3, label: "Texte et logos protégés" },
  { icon: FileDown, label: "Vrai PNG transparent" },
  { icon: Zap, label: "Contrôle DPI instantané" },
];

export default function StudioPage() {
  const openStudio = () =>
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="legendary-page">
      <header className="legendary-nav">
        <a className="legendary-brand" href="#" aria-label="TransferLab, accueil">
          <span className="legendary-mark">TL</span>
          <span>
            <strong>TransferLab</strong>
            <small>BACKGROUND STUDIO</small>
          </span>
        </a>
        <div className="legendary-nav-status">
          <span className="legendary-live-dot" aria-hidden="true" />
          <span>
            <strong>{providerLabel}</strong>
            <small>{privacyLabel}</small>
          </span>
        </div>
        <button type="button" className="primary-button" onClick={openStudio}>
          Commencer <ArrowRight size={17} />
        </button>
      </header>

      <main>
        <section className="legendary-hero">
          <div className="legendary-hero-copy">
            <span className="legendary-eyebrow">
              <Sparkles size={15} /> DÉTOURAGE PROFESSIONNEL POUR LE DTF
            </span>
            <h1>
              Votre design mérite
              <em>un détourage impeccable.</em>
            </h1>
            <p>
              Importez une image. TransferLab protège les cheveux, les textes et
              les couleurs, affiche immédiatement le résultat transparent et
              contrôle sa résolution d’impression.
            </p>
            <div className="legendary-hero-actions">
              <button
                type="button"
                className="primary-button large"
                onClick={openStudio}
              >
                <WandSparkles size={19} /> Supprimer mon arrière-plan
              </button>
              <span>
                <LockKeyhole size={16} />
                Aucune inscription nécessaire
              </span>
            </div>
            <div className="legendary-promise-grid">
              {promises.map(({ icon: Icon, label }) => (
                <span key={label}>
                  <Icon size={16} /> {label}
                </span>
              ))}
            </div>
          </div>

          <div className="legendary-visual" aria-label="Exemple avant et après">
            <div className="legendary-glow" />
            <div className="legendary-visual-card legendary-before">
              <span>AVANT</span>
              <div className="legendary-art">
                <small>TRANSFER</small>
                <strong>LAB</strong>
                <em>DTF READY</em>
              </div>
            </div>
            <div className="legendary-visual-card legendary-after checkerboard">
              <span>APRÈS</span>
              <div className="legendary-art">
                <small>TRANSFER</small>
                <strong>LAB</strong>
                <em>DTF READY</em>
              </div>
              <i><CheckCircle2 size={14} /> Alpha réel</i>
            </div>
            <div className="legendary-engine-chip">
              {backgroundProvider === "local" ? <Cpu size={18} /> : <Cloud size={18} />}
              <span>
                <strong>{providerLabel}</strong>
                <small>Résultat haute définition</small>
              </span>
            </div>
          </div>
        </section>

        <section className="legendary-trust-band" aria-label="Garanties TransferLab">
          <span><CheckCircle2 /> Aucun faux damier exporté</span>
          <span><CheckCircle2 /> Dimensions originales conservées</span>
          <span><CheckCircle2 /> Retouche non destructive</span>
          <span><CheckCircle2 /> Fonds blancs, noirs et colorés</span>
        </section>

        <section id="studio" className="legendary-studio">
          <div className="legendary-section-heading">
            <span>TOUT DANS UNE SEULE FAÇADE</span>
            <h2>Importez. Détourez. Vérifiez. Téléchargez.</h2>
            <p>
              Le résultat apparaît dans l’aperçu dès la fin du traitement.
              Ajustez ensuite les contours ou la taille d’impression sans changer
              de page.
            </p>
          </div>
          <ImportStage />
        </section>

        <section className="legendary-workflow">
          <article>
            <span>01</span>
            <WandSparkles />
            <h3>Analyse intelligente</h3>
            <p>Le profil automatique choisit le traitement puis protège les détails internes.</p>
          </article>
          <article>
            <span>02</span>
            <ScanLine />
            <h3>Résultat contrôlable</h3>
            <p>Comparez l’original et le PNG transparent directement dans le studio.</p>
          </article>
          <article>
            <span>03</span>
            <FileDown />
            <h3>Prêt à imprimer</h3>
            <p>Vérifiez le DPI réel, retouchez si nécessaire et téléchargez le PNG RGBA.</p>
          </article>
        </section>
      </main>

      <footer className="legendary-footer">
        <div className="legendary-brand inverse">
          <span className="legendary-mark">TL</span>
          <span><strong>TransferLab</strong><small>BACKGROUND STUDIO</small></span>
        </div>
        <p>Supprimez le fond. Préservez le design. Imprimez sans erreur.</p>
        <span>Studio autonome · Sans inscription</span>
      </footer>
    </div>
  );
}
