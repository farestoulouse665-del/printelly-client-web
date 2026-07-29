import { InfoCard, InfoPage } from "@/components/info-page";

export default function PricingPage() {
  return (
    <InfoPage eyebrow="TARIFICATION DZD" title="Un calcul transparent et administrable" intro="Le devis final est calculé par le backend à partir de la surface, des quantités et des options.">
      <InfoCard title="Surface"><p>Le prix de base utilise la largeur et la hauteur finales. Un minimum de facturation configurable protège les petites séries.</p></InfoCard>
      <InfoCard title="Remises"><p>Les paliers de quantité, tarifs professionnels et codes promotionnels sont cumulés dans les limites configurées.</p></InfoCard>
      <InfoCard title="Services"><p>Découpe individuelle, amélioration de résolution, nettoyage et contrôle humain apparaissent séparément dans le devis.</p></InfoCard>
      <InfoCard title="Livraison"><p>Les frais sont enregistrés en DZD et peuvent varier selon la wilaya, la commune et le mode domicile ou point relais.</p></InfoCard>
    </InfoPage>
  );
}
