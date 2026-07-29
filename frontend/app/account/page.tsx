import { InfoCard, InfoPage } from "@/components/info-page";

export default function AccountPage() {
  return (
    <InfoPage eyebrow="COMPTE ET CONFIDENTIALITÉ" title="Session privée ou compte client" intro="Le studio crée immédiatement une session invitée signée. Un compte permet ensuite d’allonger la conservation et de retrouver les commandes.">
      <InfoCard title="Session invitée"><p>Le jeton est conservé dans votre navigateur et les fichiers expirent selon la durée affichée par l’API.</p></InfoCard>
      <InfoCard title="Compte client"><p>Le modèle de données prend en charge les utilisateurs et rôles. L’authentification de production doit être reliée au fournisseur choisi avant ouverture publique.</p></InfoCard>
      <InfoCard title="Suppression"><p>La suppression depuis la bibliothèque marque d’abord le design, puis le nettoyage planifié efface les objets après le délai de sécurité.</p></InfoCard>
    </InfoPage>
  );
}
