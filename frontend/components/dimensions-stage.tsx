"use client";

import {
  AlertTriangle,
  Check,
  Link2,
  Link2Off,
  Plus,
  Ruler,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  dpiAtWidth,
  fromCentimeters,
  qualityForDpi,
  toCentimeters,
  type MeasurementUnit,
} from "@/lib/dtf";
import type { SizeLine } from "@/lib/types";
import { useStudio } from "@/store/studio";

const presets = [
  { label: "Petit logo poitrine", width: 8 },
  { label: "Logo manche", width: 7 },
  { label: "Logo cœur", width: 10 },
  { label: "Design enfant", width: 20 },
  { label: "Design face avant", width: 28 },
  { label: "Grand design dos", width: 35 },
  { label: "Design oversize", width: 42 },
  { label: "Étiquette de cou", width: 6 },
];

function SizeRow({
  line,
  unit,
  ratio,
}: {
  line: SizeLine;
  unit: MeasurementUnit;
  ratio: number;
}) {
  const locked = useStudio((state) => state.ratioLocked);
  const update = useStudio((state) => state.updateSize);
  const remove = useStudio((state) => state.removeSize);
  const assets = useStudio((state) => state.assets);
  const selectedId = useStudio((state) => state.selectedAssetId);
  const asset = assets.find((item) => item.id === selectedId) ?? assets[0];
  const dpi = asset ? dpiAtWidth(asset.width, line.widthCm) : 0;
  const quality = qualityForDpi(dpi);

  function widthChanged(displayValue: number) {
    const widthCm = Math.max(0.1, toCentimeters(displayValue, unit, dpi || 300));
    update(line.id, {
      widthCm,
      ...(locked ? { heightCm: widthCm * ratio } : {}),
    });
  }

  function heightChanged(displayValue: number) {
    const heightCm = Math.max(0.1, toCentimeters(displayValue, unit, dpi || 300));
    update(line.id, {
      heightCm,
      ...(locked ? { widthCm: heightCm / ratio } : {}),
    });
  }

  return (
    <div className="size-row">
      <label>
        <span>Largeur</span>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={Number(fromCentimeters(line.widthCm, unit, dpi || 300).toFixed(2))}
          onChange={(event) => widthChanged(Number(event.target.value))}
        />
      </label>
      <span className="dimension-cross">×</span>
      <label>
        <span>Hauteur</span>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={Number(fromCentimeters(line.heightCm, unit, dpi || 300).toFixed(2))}
          onChange={(event) => heightChanged(Number(event.target.value))}
        />
      </label>
      <label>
        <span>Quantité</span>
        <input type="number" min="1" max="10000" value={line.quantity} onChange={(event) => update(line.id, { quantity: Math.max(1, Number(event.target.value)) })} />
      </label>
      <label>
        <span>Variantes</span>
        <input type="number" min="1" max="100" value={line.variants} onChange={(event) => update(line.id, { variants: Math.max(1, Number(event.target.value)) })} />
      </label>
      <div className={`dpi-badge ${quality.tone}`}>
        <strong>{Math.round(dpi)} DPI</strong>
        <small>{quality.label}</small>
      </div>
      <button type="button" className="icon-button danger" onClick={() => remove(line.id)} aria-label={`Supprimer ${line.label}`}>
        <Trash2 size={17} />
      </button>
    </div>
  );
}

export function DimensionsStage() {
  const assets = useStudio((state) => state.assets);
  const selectedId = useStudio((state) => state.selectedAssetId);
  const sizes = useStudio((state) => state.sizes);
  const addSize = useStudio((state) => state.addSize);
  const locked = useStudio((state) => state.ratioLocked);
  const setLocked = useStudio((state) => state.setRatioLocked);
  const setStep = useStudio((state) => state.setStep);
  const [unit, setUnit] = useState<MeasurementUnit>("cm");
  const asset = assets.find((item) => item.id === selectedId) ?? assets[0];
  const ratio = asset ? asset.height / asset.width : 1;

  useEffect(() => {
    if (asset && sizes.length === 0) {
      addSize({
        label: "Design face avant",
        widthCm: 28,
        heightCm: 28 * ratio,
        quantity: 1,
        variants: 1,
      });
    }
  }, [asset, sizes.length, addSize, ratio]);

  const totals = useMemo(() => {
    const quantity = sizes.reduce((sum, item) => sum + item.quantity * item.variants, 0);
    const area = sizes.reduce((sum, item) => sum + item.widthCm * item.heightCm * item.quantity * item.variants, 0);
    return { quantity, area };
  }, [sizes]);

  return (
    <section className="stage-card" aria-labelledby="dimensions-title">
      <div className="stage-heading">
        <span className="stage-kicker">ÉTAPE 2</span>
        <div><h2 id="dimensions-title">Choisissez les dimensions finales</h2><p>Le DPI est recalculé à partir des pixels réels, jamais à partir d’une valeur déclarative.</p></div>
      </div>
      {!asset ? (
        <p className="empty-state"><Ruler size={28} /> Importez d’abord un design.</p>
      ) : (
        <>
          <div className="dimension-toolbar">
            <label>
              <span>Unité</span>
              <select value={unit} onChange={(event) => setUnit(event.target.value as MeasurementUnit)}>
                <option value="cm">Centimètres</option>
                <option value="mm">Millimètres</option>
                <option value="in">Pouces</option>
                <option value="px">Pixels</option>
              </select>
            </label>
            <button type="button" className={`ratio-button ${locked ? "locked" : ""}`} onClick={() => setLocked(!locked)}>
              {locked ? <Link2 size={17} /> : <Link2Off size={17} />}
              Ratio {locked ? "verrouillé" : "libre"}
            </button>
            {!locked && <span className="ratio-warning"><AlertTriangle size={16} /> Déverrouiller peut déformer le design.</span>}
          </div>
          <div className="preset-grid">
            {presets.map((preset) => (
              <button type="button" key={preset.label} onClick={() => addSize({ label: preset.label, widthCm: preset.width, heightCm: preset.width * ratio, quantity: 1, variants: 1 })}>
                <strong>{preset.label}</strong><small>{preset.width} cm</small>
              </button>
            ))}
          </div>
          <div className="sizes-table">
            <div className="sizes-header"><strong>Dimensions ajoutées</strong><span>{totals.quantity} impressions · {Math.round(totals.area)} cm² cumulés</span></div>
            {sizes.map((line) => <SizeRow key={line.id} line={line} unit={unit} ratio={ratio} />)}
            <button type="button" className="add-size" onClick={() => addSize({ label: "Dimension personnalisée", widthCm: 15, heightCm: 15 * ratio, quantity: 1, variants: 1 })}>
              <Plus size={17} /> Ajouter une dimension personnalisée
            </button>
          </div>
          <div className="quality-notes">
            <span><Check size={16} /> Proportions originales : {asset.width} × {asset.height} px</span>
            <span><Check size={16} /> Finesse estimée calculée pour chaque taille</span>
            <span><Check size={16} /> Les semi-transparences seront contrôlées à l’étape suivante</span>
          </div>
          <button type="button" className="primary-button stage-next" disabled={!sizes.length} onClick={() => setStep(3)}>
            Continuer vers le contrôle DTF
          </button>
        </>
      )}
    </section>
  );
}
