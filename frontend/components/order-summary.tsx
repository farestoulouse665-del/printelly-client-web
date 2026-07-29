"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronUp, ShieldCheck, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { createQuote } from "@/lib/api";
import { useStudio } from "@/store/studio";

function money(value: number) {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(value) + " DZD";
}

export function OrderSummary() {
  const [open, setOpen] = useState(false);
  const assets = useStudio((state) => state.assets);
  const selectedId = useStudio((state) => state.selectedAssetId);
  const sizes = useStudio((state) => state.sizes);
  const options = useStudio((state) => state.options);
  const asset = assets.find((item) => item.id === selectedId) ?? assets[0];

  const quote = useQuery({
    queryKey: ["quote-preview", asset?.id, sizes, options],
    queryFn: () => createQuote(asset!.id, sizes, options),
    enabled: Boolean(asset && sizes.length),
    staleTime: 30_000,
  });

  const quantity = useMemo(
    () => sizes.reduce((sum, item) => sum + item.quantity * item.variants, 0),
    [sizes],
  );
  const price = quote.data;
  return (
    <aside className={`order-summary ${open ? "open" : ""}`} aria-label="Résumé de commande">
      <button type="button" className="summary-mobile-toggle" onClick={() => setOpen(!open)}>
        <span><ShoppingBag size={18} /> Résumé · {price ? money(price.total_dzd) : "—"}</span>
        <ChevronUp size={18} />
      </button>
      <div className="summary-content">
        <div className="summary-title"><ShoppingBag size={20} /><span><strong>Votre préparation</strong><small>Prix calculé par le serveur</small></span></div>
        <dl>
          <div><dt>Designs</dt><dd>{asset ? 1 : 0}</dd></div>
          <div><dt>Dimensions</dt><dd>{sizes.length}</dd></div>
          <div><dt>Quantité totale</dt><dd>{quantity}</dd></div>
          <div><dt>Traitement</dt><dd>IA locale</dd></div>
          <div><dt>Sous-total</dt><dd>{price ? money(price.subtotal_dzd) : "—"}</dd></div>
          <div><dt>Options</dt><dd>{price ? money(price.fees_dzd) : "—"}</dd></div>
          <div className="discount"><dt>Remise</dt><dd>{price ? `− ${money(price.discount_dzd)}` : "—"}</dd></div>
          <div><dt>Livraison estimée</dt><dd>{price ? money(price.delivery_dzd) : "—"}</dd></div>
        </dl>
        <div className="summary-total"><span>Total</span><strong>{price ? money(price.total_dzd) : quote.isLoading ? "Calcul…" : "—"}</strong><small>Devise principale : dinar algérien</small></div>
        <p className="summary-trust"><ShieldCheck size={17} /> Le prix, le masque et les dimensions seront enregistrés avec la commande.</p>
      </div>
    </aside>
  );
}
