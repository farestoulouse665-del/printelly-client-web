"use client";

import { CheckCircle2, LoaderCircle, PackageCheck, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/header";
import { apiFetch } from "@/lib/api";
import type { Quote } from "@/lib/types";
import { wilayas } from "@/lib/wilayas";
import { useStudio } from "@/store/studio";

function Checkout() {
  const params = useSearchParams();
  const sizes = useStudio((state) => state.sizes);
  const options = useStudio((state) => state.options);
  const assets = useStudio((state) => state.assets);
  const selectedId = useStudio((state) => state.selectedAssetId);
  const asset = assets.find((item) => item.id === selectedId) ?? assets[0];
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<{ order_number: string; total_dzd: number } | null>(null);
  const [wilayaCode, setWilayaCode] = useState(16);

  useEffect(() => {
    const stored = sessionStorage.getItem("printelly-current-quote");
    if (stored) setQuote(JSON.parse(stored) as Quote);
  }, []);

  const wilaya = useMemo(
    () => wilayas.find(([code]) => code === wilayaCode)?.[1] ?? "Alger",
    [wilayaCode],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !asset || !sizes.length) {
      setError("Revenez au studio pour générer un devis complet.");
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const created = await apiFetch<{ order_number: string; total_dzd: number }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          quote_id: params.get("quote") ?? quote.id,
          lines: sizes.map((size) => ({
            asset_id: asset.id,
            width_cm: size.widthCm,
            height_cm: size.heightCm,
            quantity: size.quantity,
            variants: size.variants,
            individual_cut: options.individualCut,
            resolution_enhancement: options.resolutionEnhancement,
            human_review: options.humanReview,
            cleanup_required: options.residueCleanup || options.haloRemoval,
          })),
          customer: {
            full_name: data.get("full_name"),
            phone: data.get("phone"),
            email: data.get("email") || null,
          },
          delivery: {
            wilaya_code: wilayaCode,
            wilaya,
            commune: data.get("commune"),
            method: data.get("delivery_method"),
            address: data.get("address"),
          },
          payment_method: data.get("payment_method"),
          notes: options.notes,
          client_validated: data.get("client_validated") === "on",
        }),
      });
      setOrder(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commande impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    return (
      <main className="simple-page">
        <div className="success-panel">
          <CheckCircle2 size={45} />
          <span>COMMANDE ENREGISTRÉE</span>
          <h1>{order.order_number}</h1>
          <p>Le design, la version du masque, les dimensions et les options ont été enregistrés.</p>
          <strong>{new Intl.NumberFormat("fr-DZ").format(order.total_dzd)} DZD</strong>
          <a className="primary-button" href="/">Retour au studio</a>
        </div>
      </main>
    );
  }

  return (
    <main className="simple-page">
      <div className="page-heading">
        <span>COMMANDE DTF</span>
        <h1>Livraison dans les 58 wilayas</h1>
        <p>Vérifiez les informations de production et choisissez un mode de paiement modulaire.</p>
      </div>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit}>
          <section>
            <h2>Coordonnées</h2>
            <div className="form-grid two">
              <label><span>Nom complet</span><input name="full_name" required minLength={2} /></label>
              <label><span>Téléphone algérien</span><input name="phone" required placeholder="0550123456" pattern="(?:\+213|0)(?:5|6|7)[0-9]{8}" /></label>
              <label className="wide"><span>E-mail facultatif</span><input type="email" name="email" /></label>
            </div>
          </section>
          <section>
            <h2>Livraison</h2>
            <div className="form-grid two">
              <label><span>Wilaya</span><select value={wilayaCode} onChange={(event) => setWilayaCode(Number(event.target.value))}>{wilayas.map(([code, name]) => <option value={code} key={code}>{code.toString().padStart(2, "0")} · {name}</option>)}</select></label>
              <label><span>Commune</span><input name="commune" required /></label>
              <label><span>Mode</span><select name="delivery_method"><option value="home">Livraison à domicile</option><option value="relay">Point relais</option></select></label>
              <label><span>Adresse / point relais</span><input name="address" required /></label>
            </div>
          </section>
          <section>
            <h2>Paiement</h2>
            <div className="radio-cards">
              <label><input type="radio" name="payment_method" value="cash_on_delivery" defaultChecked /><span><strong>Paiement à la livraison</strong><small>Le statut reste en attente jusqu’à réception.</small></span></label>
              <label><input type="radio" name="payment_method" value="online" /><span><strong>Paiement en ligne</strong><small>Le prestataire sera sélectionné par le module configuré.</small></span></label>
              <label><input type="radio" name="payment_method" value="manual" /><span><strong>Paiement manuel</strong><small>Validation par l’administration après preuve.</small></span></label>
              <label><input type="radio" name="payment_method" value="deposit" /><span><strong>Acompte</strong><small>Le solde reste attaché à la commande.</small></span></label>
            </div>
          </section>
          <label className="validation-check"><input type="checkbox" name="client_validated" required /><span><strong>Je valide le fichier et les dimensions</strong><small>Cette validation enregistre la version exacte du masque utilisée.</small></span></label>
          {error && <p className="inline-error">{error}</p>}
          <button className="primary-button large full" disabled={busy || !quote} type="submit">{busy ? <LoaderCircle className="spin" /> : <PackageCheck />} Confirmer la commande DTF</button>
        </form>
        <aside className="checkout-summary">
          <PackageCheck size={25} />
          <h2>Résumé</h2>
          <dl>
            <div><dt>Design</dt><dd>{asset?.name ?? "Non sélectionné"}</dd></div>
            <div><dt>Dimensions</dt><dd>{sizes.length}</dd></div>
            <div><dt>Quantité</dt><dd>{sizes.reduce((sum, size) => sum + size.quantity * size.variants, 0)}</dd></div>
            <div><dt>Livraison</dt><dd>{quote ? `${quote.delivery_dzd} DZD` : "—"}</dd></div>
          </dl>
          <div className="checkout-total"><span>Total</span><strong>{quote ? `${new Intl.NumberFormat("fr-DZ").format(quote.total_dzd)} DZD` : "Devis absent"}</strong></div>
          <p><ShieldCheck size={16} /> La commande ne contient aucun chemin interne de stockage.</p>
        </aside>
      </div>
    </main>
  );
}

export default function OrdersPage() {
  return <><Header /><Suspense fallback={<main className="simple-page"><LoaderCircle className="spin" /> Chargement…</main>}><Checkout /></Suspense></>;
}
