"use client";

import { CheckCircle2, LockKeyhole, LogIn, LogOut, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Header } from "@/components/header";
import {
  getAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
  type Account,
} from "@/lib/api";

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    getAccount().then(setAccount).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const session =
        mode === "register"
          ? await registerAccount({
              email: String(data.get("email") ?? ""),
              display_name: String(data.get("display_name") ?? ""),
              password: String(data.get("password") ?? ""),
              locale: "fr",
            })
          : await loginAccount({
              email: String(data.get("email") ?? ""),
              password: String(data.get("password") ?? ""),
            });
      setAccount(session.user);
      setMessage(
        "Compte connecté. Conservation étendue à " +
          session.retention_days +
          " jours.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    setPending(true);
    try {
      await logoutAccount();
      setAccount(null);
      setMessage(
        "Vous êtes déconnecté. Une nouvelle session privée sera créée au prochain import.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Header />
      <main className="account-shell">
        <section className="account-intro">
          <span>COMPTE ET CONFIDENTIALITÉ</span>
          <h1>Retrouvez vos designs et vos commandes.</h1>
          <p>
            Une session invitée signée fonctionne immédiatement. Le compte client
            rattache ensuite votre bibliothèque à votre identité sans envoyer les
            fichiers à un tiers.
          </p>
          <ul>
            <li><LockKeyhole size={18} /> Mot de passe protégé par scrypt</li>
            <li><CheckCircle2 size={18} /> Designs conservés entre les connexions</li>
            <li><CheckCircle2 size={18} /> Session révocable et durée affichée</li>
          </ul>
        </section>

        <section className="account-panel" aria-live="polite">
          {account ? (
            <div className="account-connected">
              <span className="account-avatar">{account.display_name.slice(0, 1).toUpperCase()}</span>
              <p>COMPTE CONNECTÉ</p>
              <h2>{account.display_name}</h2>
              <span>{account.email}</span>
              <a className="primary-button" href="/designs">Ouvrir mes designs</a>
              <button type="button" className="secondary-button" disabled={pending} onClick={logout}>
                <LogOut size={17} /> Se déconnecter
              </button>
            </div>
          ) : (
            <>
              <div className="account-tabs">
                <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
                  <LogIn size={17} /> Connexion
                </button>
                <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
                  <UserPlus size={17} /> Créer un compte
                </button>
              </div>
              <form onSubmit={submit}>
                {mode === "register" && (
                  <label>
                    <span>Nom affiché</span>
                    <input name="display_name" minLength={2} maxLength={120} required autoComplete="name" />
                  </label>
                )}
                <label>
                  <span>Adresse e-mail</span>
                  <input name="email" type="email" required autoComplete="email" />
                </label>
                <label>
                  <span>Mot de passe</span>
                  <input
                    name="password"
                    type="password"
                    minLength={mode === "register" ? 12 : 1}
                    maxLength={128}
                    required
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                  />
                  {mode === "register" && <small>12 caractères minimum.</small>}
                </label>
                <button type="submit" className="primary-button" disabled={pending}>
                  {pending ? "Vérification…" : mode === "register" ? "Créer mon compte" : "Me connecter"}
                </button>
              </form>
            </>
          )}
          {message && <p className="account-message">{message}</p>}
        </section>
      </main>
    </>
  );
}
