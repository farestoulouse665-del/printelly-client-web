"use client";

import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  Menu,
  PackageOpen,
  PanelsTopLeft,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStudio } from "@/store/studio";

const links = [
  { href: "/", label: "Studio IA", icon: Sparkles },
  { href: "/orders", label: "Commander du DTF", icon: ShoppingBag },
  { href: "/designs", label: "Mes designs", icon: PanelsTopLeft },
  { href: "/guide", label: "Guide DTF", icon: BookOpen },
  { href: "/pricing", label: "Tarifs", icon: PackageOpen },
  { href: "/support", label: "Assistance", icon: CircleHelp },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const locale = useStudio((state) => state.locale);
  const setLocale = useStudio((state) => state.setLocale);
  const cartCount = useStudio((state) =>
    state.sizes.reduce(
      (total, size) => total + size.quantity * size.variants,
      0,
    ),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return (
    <>
      <div className="privacy-strip">
        <span className="privacy-dot" />
        Traitement 100 % local sur votre infrastructure · aucun fichier envoyé à un tiers
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="TransferLab">
            <span className="brand-glyph">TL</span>
            <span>
              <strong>TRANSFERLAB</strong>
              <small>DTF STUDIO</small>
            </span>
          </Link>
          <nav className="desktop-navigation" aria-label="Navigation principale">
            {links.map(({ href, label }) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="locale-button"
              type="button"
              onClick={() => setLocale(locale === "fr" ? "ar" : "fr")}
              aria-label="Changer la langue"
            >
              {locale === "fr" ? "FR" : "AR"}
              <ChevronDown size={14} />
            </button>
            <Link className="account-button" href="/account" aria-label="Compte client">
              <UserRound size={18} />
              <span>Compte</span>
            </Link>
            <Link className="cart-button" href="/orders" aria-label="Panier DTF">
              <ShoppingBag size={19} />
              <span>{cartCount}</span>
            </Link>
            <button
              type="button"
              className="menu-button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-navigation" className="mobile-navigation" aria-label="Navigation mobile">
            {links.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href} onClick={() => setOpen(false)}>
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
