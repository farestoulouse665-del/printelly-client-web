import { InfoCard, InfoPage } from "@/components/info-page";

export default function GuidePage() {
  return (
    <InfoPage eyebrow="GUIDE DTF" title="Préparer un fichier qui s’imprime proprement" intro="Les recommandations affichées ici correspondent aux contrôles réellement réalisés par le studio.">
      <InfoCard title="Résolution"><p>Visez 300 DPI à la taille finale. Un petit logo peut bénéficier de 600 DPI lorsque les contours sont très fins.</p></InfoCard>
      <InfoCard title="Transparence"><p>Un PNG DTF doit posséder un vrai canal alpha. Le damier n’est qu’un aperçu de l’interface et ne doit jamais être intégré au fichier.</p></InfoCard>
      <InfoCard title="Couleurs internes"><p>Le blanc ou le noir à l’intérieur du sujet doit être conservé. Le moteur combine BiRefNet, connectivité aux bords et protections sémantiques.</p></InfoCard>
      <InfoCard title="Détails fins"><p>Vérifiez les contours, textes, trous des lettres, cheveux et pixels isolés dans l’éditeur à 100 % avant la commande.</p></InfoCard>
    </InfoPage>
  );
}
