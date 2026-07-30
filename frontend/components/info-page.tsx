import type { ReactNode } from "react";
import { Header } from "@/components/header";

export function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="simple-page">
        <div className="page-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{intro}</p></div>
        <div className="info-grid">{children}</div>
      </main>
    </>
  );
}

export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="info-card"><h2>{title}</h2><div>{children}</div></section>;
}
