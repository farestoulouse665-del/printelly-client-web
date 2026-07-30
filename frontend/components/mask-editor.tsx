"use client";

import Konva from "konva";
import {
  Brush,
  Check,
  CircleDot,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  LassoSelect,
  LoaderCircle,
  Minus,
  MousePointer2,
  PaintBucket,
  Plus,
  Redo2,
  RotateCcw,
  ScanSearch,
  Shield,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva";
import { apiFetch } from "@/lib/api";
import type { Asset } from "@/lib/types";

type Point = { x: number; y: number; pressure: number };
type Tool = "restore_brush" | "erase_brush" | "protect_brush" | "magic_exterior" | "forgotten_background" | "background_point" | "subject_point" | "lasso_restore" | "lasso_erase" | "lasso_protect";
type OperationKind = Tool | "edge_refine" | "residue_cleanup";
type Preview = "result" | "original" | "mask" | "uncertain";

type MaskVersion = { id: string; download_url: string; operation_count: number };

function useImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImage(null); return; }
    const element = new window.Image();
    element.onload = () => setImage(element);
    element.src = url;
    return () => { element.onload = null; };
  }, [url]);
  return image;
}

function useAlphaOverlay(image: HTMLImageElement | null, kind: "mask" | "uncertain" | null) {
  const [overlay, setOverlay] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!image || !kind) { setOverlay(null); return; }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const alpha = pixels.data[index + 3] ?? 0;
      const visible = kind === "mask" ? alpha > 0 : alpha > 18 && alpha < 238;
      pixels.data[index] = kind === "mask" ? 235 : 255;
      pixels.data[index + 1] = kind === "mask" ? 52 : 174;
      pixels.data[index + 2] = kind === "mask" ? 70 : 0;
      pixels.data[index + 3] = visible ? Math.min(190, Math.max(70, alpha)) : 0;
    }
    context.putImageData(pixels, 0, 0);
    const output = new window.Image();
    output.onload = () => setOverlay(output);
    output.src = canvas.toDataURL("image/png");
  }, [image, kind]);
  return overlay;
}

const tools: Array<{ value: Tool; label: string; icon: typeof Brush }> = [
  { value: "restore_brush", label: "Restaurer", icon: RotateCcw },
  { value: "erase_brush", label: "Effacer", icon: Eraser },
  { value: "protect_brush", label: "Protéger", icon: Shield },
  { value: "magic_exterior", label: "Gomme extérieure", icon: PaintBucket },
  { value: "forgotten_background", label: "Fond oublié", icon: CircleDot },
  { value: "background_point", label: "Point fond", icon: MousePointer2 },
  { value: "subject_point", label: "Point sujet", icon: Check },
  { value: "lasso_restore", label: "Lasso restaurer", icon: LassoSelect },
  { value: "lasso_erase", label: "Lasso effacer", icon: LassoSelect },
  { value: "lasso_protect", label: "Lasso protéger", icon: LassoSelect },
];

export function MaskEditor({
  assetId,
  onResultChange,
}: {
  assetId: string;
  onResultChange?: (resultUrl: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 650 });
  const [tool, setTool] = useState<Tool>("restore_brush");
  const [preview, setPreview] = useState<Preview>("result");
  const [background, setBackground] = useState<"checker" | "white" | "black" | "gray" | "custom">("checker");
  const [customBackground, setCustomBackground] = useState("#365cf5");
  const [zoom, setZoom] = useState(1);
  const [brushSize, setBrushSize] = useState(0.035);
  const [hardness, setHardness] = useState(0.8);
  const [opacity, setOpacity] = useState(1);
  const [tolerance, setTolerance] = useState(0.12);
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const originalImage = useImage(asset?.original_download_url ?? null);
  const resultImage = useImage(resultUrl);
  const overlay = useAlphaOverlay(resultImage, preview === "mask" ? "mask" : preview === "uncertain" ? "uncertain" : null);
  const visibleImage = preview === "original" ? originalImage : resultImage;

  useEffect(() => {
    void apiFetch<Asset>(`/assets/${assetId}`).then((loaded) => {
      setAsset(loaded);
      setResultUrl(loaded.final_download_url);
    }).catch((error: Error) => setMessage(error.message));
  }, [assetId]);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: Math.max(320, entry.contentRect.width), height: Math.max(430, entry.contentRect.height) });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const frame = useMemo(() => {
    if (!visibleImage) return { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const fit = Math.min(viewport.width / visibleImage.naturalWidth, viewport.height / visibleImage.naturalHeight) * 0.9 * zoom;
    const width = visibleImage.naturalWidth * fit;
    const height = visibleImage.naturalHeight * fit;
    return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
  }, [visibleImage, viewport, zoom]);

  const normalizedPointer = useCallback((): Point | null => {
    const position = stage.current?.getPointerPosition();
    if (!position || frame.width <= 0 || frame.height <= 0) return null;
    const x = (position.x - frame.x) / frame.width;
    const y = (position.y - frame.y) / frame.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x, y, pressure: 1 };
  }, [frame]);

  function begin() {
    const point = normalizedPointer();
    if (!point) return;
    setDrawing(true);
    setPoints([point]);
    if (["magic_exterior", "forgotten_background", "background_point", "subject_point"].includes(tool)) setDrawing(false);
  }
  function move() {
    if (!drawing || ["magic_exterior", "forgotten_background", "background_point", "subject_point"].includes(tool)) return;
    const point = normalizedPointer();
    if (point) setPoints((current) => [...current, point]);
  }

  async function apply(kind: OperationKind = tool) {
    if (!asset || !resultUrl) return;
    if (!points.length && !["edge_refine", "residue_cleanup"].includes(kind)) {
      setMessage("Tracez ou sélectionnez d’abord une zone sur l’image.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const version = await apiFetch<MaskVersion>(`/masks/${asset.id}/operations`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          points,
          radius: brushSize,
          hardness,
          opacity,
          tolerance,
          parameters: kind === "edge_refine" ? { smooth: 1.2, contract: 0, expand: 0 } : {},
        }),
      });
      const nextResultUrl = `${version.download_url}&v=${encodeURIComponent(version.id)}`;
      setResultUrl(nextResultUrl);
      onResultChange?.(nextResultUrl);
      setPoints([]);
      setMessage(`Version ${version.operation_count} enregistrée sans modifier les couleurs.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Correction impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function history(action: "undo" | "redo") {
    if (!asset) return;
    setBusy(true);
    try {
      const version = await apiFetch<MaskVersion>(`/masks/${asset.id}/${action}`, { method: "POST" });
      const nextResultUrl = `${version.download_url}&v=${encodeURIComponent(version.id)}`;
      setResultUrl(nextResultUrl);
      onResultChange?.(nextResultUrl);
      setPoints([]);
      setMessage(action === "undo" ? "Dernière correction annulée." : "Correction rétablie.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Historique indisponible.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void history(event.shiftKey ? "redo" : "undo");
      } else if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(4, value + 0.15));
      else if (event.key === "-") setZoom((value) => Math.max(0.25, value - 0.15));
      else if (event.key === "[") setBrushSize((value) => Math.max(0.005, value - 0.005));
      else if (event.key === "]") setBrushSize((value) => Math.min(0.25, value + 0.005));
      else if (event.key.toLowerCase() === "e") setTool("erase_brush");
      else if (event.key.toLowerCase() === "r") setTool("restore_brush");
      else if (event.key.toLowerCase() === "p") setTool("protect_brush");
      else if (event.key.toLowerCase() === "m") setPreview((value) => value === "mask" ? "result" : "mask");
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  const linePoints = points.flatMap((point) => [frame.x + point.x * frame.width, frame.y + point.y * frame.height]);
  const stroke = tool.includes("erase") || tool === "magic_exterior" || tool === "forgotten_background" || tool === "background_point" ? "#ef4444" : tool.includes("protect") || tool === "subject_point" ? "#22c55e" : "#365cf5";
  const pointer = points.at(-1);

  return (
    <div className="mask-editor-shell">
      <aside className="editor-toolbar" aria-label="Outils de masque">
        <div className="editor-toolbar-title"><Sparkles size={19} /><span><strong>Éditeur non destructif</strong><small>{asset?.name ?? "Chargement…"}</small></span></div>
        <div className="editor-tools">
          {tools.map(({ value, label, icon: Icon }) => <button type="button" key={value} className={tool === value ? "active" : ""} onClick={() => { setTool(value); setPoints([]); }}><Icon size={18} /><span>{label}</span></button>)}
        </div>
        <label className="editor-range"><span>Taille <output>{Math.round(brushSize * 1000)}</output></span><input type="range" min="0.005" max="0.15" step="0.005" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
        <label className="editor-range"><span>Dureté <output>{Math.round(hardness * 100)} %</output></span><input type="range" min="0" max="1" step="0.05" value={hardness} onChange={(event) => setHardness(Number(event.target.value))} /></label>
        <label className="editor-range"><span>Opacité <output>{Math.round(opacity * 100)} %</output></span><input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
        <label className="editor-range"><span>Tolérance <output>{Math.round(tolerance * 100)}</output></span><input type="range" min="0.01" max="0.5" step="0.01" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
        <div className="editor-secondary-actions">
          <button type="button" onClick={() => void apply("edge_refine")}><Sparkles size={16} /> Améliorer les contours</button>
          <button type="button" onClick={() => void apply("residue_cleanup")}><ScanSearch size={16} /> Nettoyer les résidus</button>
        </div>
        <button type="button" className="primary-button full" disabled={busy || (!points.length && !tool.includes("edge"))} onClick={() => void apply()}>{busy ? <LoaderCircle className="spin" /> : <Check />} Appliquer la correction</button>
      </aside>
      <section className="editor-stage-panel">
        <div className="editor-topbar">
          <div><button type="button" onClick={() => void history("undo")} aria-label="Annuler"><Undo2 /></button><button type="button" onClick={() => void history("redo")} aria-label="Rétablir"><Redo2 /></button></div>
          <div className="preview-modes"><button type="button" className={preview === "original" ? "active" : ""} onClick={() => setPreview("original")}><EyeOff size={16} /> Avant</button><button type="button" className={preview === "result" ? "active" : ""} onClick={() => setPreview("result")}><Eye size={16} /> Après</button><button type="button" className={preview === "mask" ? "active" : ""} onClick={() => setPreview("mask")}>Masque rouge</button><button type="button" className={preview === "uncertain" ? "active" : ""} onClick={() => setPreview("uncertain")}>Zones incertaines</button></div>
          <div><button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.15))}><Minus /></button><span>{Math.round(zoom * 100)} %</span><button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.15))}><Plus /></button><button type="button" onClick={() => setZoom(1)}><Hand /></button></div>
        </div>
        <div ref={container} className={`editor-canvas ${background}`}>
          <Stage ref={stage} width={viewport.width} height={viewport.height} onMouseDown={begin} onTouchStart={begin} onMouseMove={move} onTouchMove={move} onMouseUp={() => setDrawing(false)} onTouchEnd={() => setDrawing(false)} onWheel={(event) => { event.evt.preventDefault(); setZoom((value) => Math.max(0.25, Math.min(4, value + (event.evt.deltaY < 0 ? 0.1 : -0.1)))); }}>
            <Layer>
              {background !== "checker" && <Rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill={background === "white" ? "#fff" : background === "black" ? "#111" : background === "gray" ? "#888" : customBackground} />}
              {visibleImage && <KonvaImage image={visibleImage} {...frame} />}
              {overlay && <KonvaImage image={overlay} {...frame} />}
              {linePoints.length >= 2 && <Line points={linePoints} stroke={stroke} strokeWidth={Math.max(2, brushSize * Math.min(frame.width, frame.height) * 2)} opacity={0.55} lineCap="round" lineJoin="round" closed={tool.startsWith("lasso")} />}
              {pointer && <Circle x={frame.x + pointer.x * frame.width} y={frame.y + pointer.y * frame.height} radius={Math.max(3, brushSize * Math.min(frame.width, frame.height))} stroke={stroke} strokeWidth={2} listening={false} />}
            </Layer>
          </Stage>
        </div>
        <div className="editor-bottombar"><span>Aperçu du fond</span>{(["checker", "white", "black", "gray"] as const).map((value) => <button type="button" key={value} className={`${value} ${background === value ? "active" : ""}`} onClick={() => setBackground(value)} aria-label={`Fond ${value}`} />)}<input type="color" value={customBackground} onChange={(event) => { setCustomBackground(event.target.value); setBackground("custom"); }} aria-label="Choisir une couleur de prévisualisation" title="Fond personnalisé" /><span className="editor-message" aria-live="polite">{message}</span></div>
      </section>
    </div>
  );
}
