import { InfoCard, InfoPage } from "@/components/info-page";

export default function SupportPage() {
  return (
    <InfoPage eyebrow="ASSISTANCE" title="Diagnostiquer sans exposer vos fichiers" intro="Communiquez l’identifiant de requête affiché par l’API. Les journaux ne contiennent jamais le contenu du design.">
      <InfoCard title="Modèle indisponible"><p>Vérifiez le montage du fichier ONNX et la valeur BACKGROUND_MODEL_SHA256, puis consultez la santé du worker.</p></InfoCard>
      <InfoCard title="Mémoire insuffisante"><p>Réduisez la concurrence, activez le traitement tuilé ou augmentez la mémoire allouée à Docker Desktop.</p></InfoCard>
      <InfoCard title="Import refusé"><p>Le type MIME, la signature et le décodeur doivent tous confirmer le même format. Un fichier renommé est refusé.</p></InfoCard>
      <InfoCard title="Windows et WSL2"><p>Conservez les données dans des volumes Docker et montez le modèle en lecture seule depuis un chemin accessible à WSL2.</p></InfoCard>
    </InfoPage>
  );
}
