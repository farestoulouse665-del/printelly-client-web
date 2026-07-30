import type { RemovalMode } from "@/lib/types";

export type RemovalProfileDefinition = {
  mode: RemovalMode;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
};

const BASE_PARAMETERS: Record<string, unknown> = {
  protect_details: true,
  remove_haze: true,
  decontaminate: true,
  cleanup: "normal",
  black_background_mode: "off",
  preserve_shadows: false,
  feather: 1,
  edge_shift: 0,
  output_original_size: true,
};

export const REMOVAL_PROFILES: RemovalProfileDefinition[] = [
  {
    mode: "automatic",
    label: "Automatique",
    description: "Analyse le design et choisit le traitement le plus adapté.",
    parameters: {},
  },
  {
    mode: "person_hair",
    label: "Personne et cheveux",
    description: "Préserve les cheveux, la barbe, le visage et les contours fins.",
    parameters: { cleanup: "light", feather: 1.35, protect_details: true },
  },
  {
    mode: "logo_text",
    label: "Logo et texte",
    description: "Protège les lettres, les trous internes et les aplats du logo.",
    parameters: { cleanup: "strong", feather: 0.45, protect_details: true },
  },
  {
    mode: "complex_illustration",
    label: "Illustration complexe",
    description: "Conserve les couleurs internes et les détails rapprochés.",
    parameters: { cleanup: "light", feather: 0.7, protect_details: true },
  },
  {
    mode: "product",
    label: "Objet ou produit",
    description: "Détoure les produits avec des bords propres et naturels.",
    parameters: { cleanup: "normal", feather: 0.8 },
  },
  {
    mode: "white_background",
    label: "Fond blanc",
    description: "Réduit les halos blancs sans supprimer le blanc du design.",
    parameters: { cleanup: "strong", feather: 0.55, remove_haze: true },
  },
  {
    mode: "black_background",
    label: "Fond noir",
    description: "Protège cheveux, vêtements et détails noirs du sujet.",
    parameters: {
      cleanup: "normal",
      feather: 0.85,
      black_background_mode: "smart",
      protect_details: true,
    },
  },
  {
    mode: "gray_background",
    label: "Fond gris",
    description: "Nettoie les gris connectés aux bordures en protégeant le sujet.",
    parameters: { cleanup: "normal", feather: 0.65 },
  },
  {
    mode: "colored_background",
    label: "Fond coloré",
    description: "Traite un fond coloré sans supprimer les couleurs internes similaires.",
    parameters: { cleanup: "normal", feather: 0.75, protect_details: true },
  },
  {
    mode: "clean_transparent",
    label: "Déjà transparent",
    description: "Préserve l’alpha existant et nettoie uniquement les résidus sûrs.",
    parameters: {
      cleanup: "light",
      feather: 0.25,
      remove_haze: false,
      decontaminate: false,
    },
  },
  {
    mode: "preserve_shadows",
    label: "Préserver les ombres",
    description: "Conserve les ombres naturelles utiles autour du produit.",
    parameters: {
      cleanup: "light",
      feather: 1.2,
      preserve_shadows: true,
      remove_haze: false,
    },
  },
  {
    mode: "remove_shadows",
    label: "Supprimer les ombres",
    description: "Produit un contour plus net sans ombre extérieure volontaire.",
    parameters: {
      cleanup: "strong",
      feather: 0.55,
      preserve_shadows: false,
      remove_haze: true,
    },
  },
  {
    mode: "dtf_high_precision",
    label: "DTF haute précision",
    description: "Nettoyage renforcé pour les logos, textes et détails imprimables.",
    parameters: {
      cleanup: "strong",
      feather: 0.4,
      protect_details: true,
      remove_haze: true,
      decontaminate: true,
    },
  },
];

export function parametersForRemovalMode(
  mode: RemovalMode,
): Record<string, unknown> {
  const profile = REMOVAL_PROFILES.find((entry) => entry.mode === mode);
  return { ...BASE_PARAMETERS, ...(profile?.parameters ?? {}) };
}
