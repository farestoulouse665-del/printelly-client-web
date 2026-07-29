"use client";

import {
  CheckCircle2,
  Cpu,
  FileCheck2,
  LockKeyhole,
  ScanLine,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { DimensionsStage } from "@/components/dimensions-stage";
import { FinalizeStage } from "@/components/finalize-stage";
import { Header } from "@/components/header";
import { ImportStage } from "@/components/import-stage";
import { OrderSummary } from "@/components/order-summary";
import { Stepper } from "@/components/stepper";
import { useStudio } from "@/store/studio";

const guarantees = [
  { icon: Cpu, title: "Moteur local", detail: "BiRefNet ONNX sur votre serveur" },
  { icon: LockKeyhole, title: "Fichiers privés", detail: "Aucun envoi à un service tiers" },
  { icon: ScanLine, title: "Détails protégés", detail: "Textes, logos, cheveux et couleurs" },
  { icon: FileCheck2, title: "Contrôle DTF", detail: "Alpha, DPI, halos et finesse" },
];

export default function StudioPage() {
  const step = useStudio((state) => state.activeStep);
  const setStep = useStudio((state) => state.setStep);
  return (
    <>
      <Header />
      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <span className="hero-badge"><Sparkles size={15} /> STUDIO IA POUR L’IMPRESSION DTF</span>
            <h1>Un fond parfaitement supprimé.<br /><em>Un design parfaitement préservé.</em></h1>
            <p>Importez votre fichier, laissez notre moteur local analyser les contours, puis téléchargez un PNG transparent prêt pour l’impression DTF.</p>
            <div className="hero-actions">
              <button type="button" className="primary-button large" onClick={() => { setStep(1); document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" }); }}>
                <WandSparkles size={19} /> Importer mon design
              </button>
              <a className="secondary-button large" href="/guide">Consulter le guide DTF</a>
            </div>
            <ul className="hero-proof">
              <li><CheckCircle2 /> Véritable PNG RGBA</li>
              <li><CheckCircle2 /> Mode spécial fonds noirs</li>
              <li><CheckCircle2 /> Correction manuelle précise</li>
            </ul>
          </div>
          <div className="hero-visual" aria-label="Aperçu de suppression de fond">
            <div className="visual-orbit one" /><div className="visual-orbit two" />
            <div className="visual-card original-card">
              <span>ORIGINAL</span>
              <div className="sample-design"><strong>PRINT</strong><em>READY</em><small>DTF</small></div>
            </div>
            <div className="visual-card result-card checkerboard">
              <span>PNG TRANSPARENT</span>
              <div className="sample-design"><strong>PRINT</strong><em>READY</em><small>DTF</small></div>
              <i className="quality-chip"><CheckCircle2 size={14} /> 300 DPI</i>
            </div>
            <div className="local-chip"><LockKeyhole size={17} /><span><strong>Traitement local</strong><small>Confidentiel par conception</small></span></div>
          </div>
        </section>

        <section className="guarantee-grid" aria-label="Garanties du studio">
          {guarantees.map(({ icon: Icon, title, detail }) => (
            <div key={title}><Icon size={21} /><span><strong>{title}</strong><small>{detail}</small></span></div>
          ))}
        </section>

        <section id="studio" className="studio-shell">
          <div className="studio-intro">
            <span>PARCOURS PROFESSIONNEL</span>
            <h2>De l’original au fichier imprimable, sans approximation</h2>
            <p>Trois étapes reliées au backend : import sécurisé, préparation exacte et validation DTF.</p>
          </div>
          <Stepper />
          <div className="studio-layout">
            <div className="stage-column">
              {step === 1 && <ImportStage />}
              {step === 2 && <DimensionsStage />}
              {step === 3 && <FinalizeStage />}
            </div>
            <OrderSummary />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div><strong>TRANSFERLAB</strong><p>Supprimez le fond. Préservez le design. Imprimez sans erreur.</p></div>
        <div><span>Infrastructure locale</span><span>Devise DZD</span><span>Français · العربية</span></div>
      </footer>
    </>
  );
}
