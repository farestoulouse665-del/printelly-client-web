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
  high_precision: true,
};

export const REMOVAL_PROFILES: RemovalProfileDefinition[] = [
  {
    mode: "automatic",
    label: "Automatique",
    description: "Le moteur recommande le meilleur profil",
    parameters: {},
  },
  {
    mode: "person_hair",
    label: "Personne et cheveux",
    description: "Mèches, barbe, visage et vêtements",
    parameters: { cleanup: "light", feather: 1.35, protect_details: true },
  },
  {
    mode: "logo_text",
    label: "Logo et texte",
    description: "Blanc interne et typographies protégés",
    parameters: { cleanup: "strong", feather: 0.45, protect_details: true },
  },
  {
    mode: "complex_illustration",
    label: "Illustration complexe",
    description: "Couleurs et contours fins",
    parameters: { cleanup: "light", feather: 0.7, protect_details: true },
  },
  {
    mode: "product",
    label: "Objet ou produit",
    description: "Volumes et ombres maîtrisées",
    parameters: { cleanup: "normal", feather: 0.8 },
  },
  {
    mode: "white_background",
    label: "Fond blanc",
    description: "Réduction des halos clairs",
    parameters: { cleanup: "strong", feather: 0.55, remove_haze: true },
  },
  {
    mode: "black_background",
    label: "Fond noir",
    description: "Détails sombres protégés",
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
    description: "Contours et gris internes préservés",
    parameters: { cleanup: "normal", feather: 0.65 },
  },
  {
    mode: "colored_background",
    label: "Fond coloré",
    description: "Connectivité et couleur dominante",
    parameters: { cleanup: "normal", feather: 0.75, protect_details: true },
  },
  {
    mode: "clean_transparent",
    label: "Déjà transparent",
    description: "Nettoyage sans détériorer l’alpha existant",
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
    description: "Transparence douce et ombres utiles",
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
    description: "Sujet net sans ombre extérieure",
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
    description: "Préservation maximale du design",
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
