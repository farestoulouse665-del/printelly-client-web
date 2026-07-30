"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Header } from "@/components/header";

const MaskEditor = dynamic(
  () => import("@/components/mask-editor").then((module) => module.MaskEditor),
  { ssr: false, loading: () => <div className="editor-loading">Chargement de l’éditeur…</div> },
);

export default function EditorPage() {
  const params = useParams<{ assetId: string }>();
  return <><Header /><main className="editor-page"><MaskEditor assetId={params.assetId} /></main></>;
}
