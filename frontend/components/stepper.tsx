"use client";

import { Check } from "lucide-react";
import { useStudio } from "@/store/studio";

const steps = [
  { number: 1 as const, title: "Importer et nettoyer", subtitle: "Analyse IA locale" },
  { number: 2 as const, title: "Choisir les dimensions", subtitle: "DPI et quantités" },
  { number: 3 as const, title: "Finaliser", subtitle: "Contrôle DTF et export" },
];

export function Stepper() {
  const active = useStudio((state) => state.activeStep);
  const setStep = useStudio((state) => state.setStep);
  return (
    <ol className="stepper" aria-label="Étapes de préparation">
      {steps.map((step) => (
        <li key={step.number} className={active === step.number ? "active" : active > step.number ? "done" : ""}>
          <button type="button" onClick={() => setStep(step.number)} aria-current={active === step.number ? "step" : undefined}>
            <span className="step-number">{active > step.number ? <Check size={17} /> : step.number}</span>
            <span>
              <strong>{step.title}</strong>
              <small>{step.subtitle}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
