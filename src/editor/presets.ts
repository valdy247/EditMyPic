import type { FilterId } from "./types";

export type FilterRecipe = {
  exposure?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
  tint?: number;
  fade?: number;
  grayscale?: number;
  clarity?: number;
  vignette?: number;
  grain?: number;
};

export type FilterPreset = {
  id: FilterId;
  label: string;
  subtitle: string;
  accent: string;
  recipe: FilterRecipe;
};

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: "none",
    label: "Natural",
    subtitle: "Sin filtro",
    accent: "#8b90a0",
    recipe: {},
  },
  {
    id: "clean",
    label: "Clean",
    subtitle: "Luz limpia",
    accent: "#b9ddff",
    recipe: { exposure: 0.1, contrast: 0.08, saturation: -0.04, clarity: 0.08 },
  },
  {
    id: "golden",
    label: "Golden",
    subtitle: "Atardecer",
    accent: "#ffc56b",
    recipe: { exposure: 0.08, contrast: 0.08, warmth: 0.32, tint: 0.06, saturation: 0.08, vignette: 0.08 },
  },
  {
    id: "portrait",
    label: "Portrait",
    subtitle: "Piel suave",
    accent: "#ffb4ae",
    recipe: { brightness: 0.06, contrast: -0.05, warmth: 0.12, tint: 0.08, saturation: -0.02, fade: 0.04 },
  },
  {
    id: "cinema",
    label: "Cinema",
    subtitle: "Azul y ámbar",
    accent: "#69b8d3",
    recipe: { contrast: 0.2, saturation: -0.1, warmth: -0.08, tint: -0.06, fade: 0.07, vignette: 0.2 },
  },
  {
    id: "film",
    label: "Film",
    subtitle: "Película suave",
    accent: "#d8bd91",
    recipe: { contrast: -0.04, saturation: -0.08, warmth: 0.14, fade: 0.2, grain: 0.28, vignette: 0.08 },
  },
  {
    id: "moody",
    label: "Moody",
    subtitle: "Sombras profundas",
    accent: "#8c7ca7",
    recipe: { exposure: -0.12, contrast: 0.24, saturation: -0.18, warmth: -0.06, fade: 0.05, vignette: 0.28 },
  },
  {
    id: "urban",
    label: "Urban",
    subtitle: "Ciudad fría",
    accent: "#7ea8c8",
    recipe: { contrast: 0.18, saturation: -0.14, warmth: -0.25, tint: -0.06, clarity: 0.2, vignette: 0.12 },
  },
  {
    id: "travel",
    label: "Travel",
    subtitle: "Color vivo",
    accent: "#72d4ae",
    recipe: { exposure: 0.08, contrast: 0.12, saturation: 0.18, warmth: 0.08, clarity: 0.12 },
  },
  {
    id: "mono",
    label: "Mono",
    subtitle: "B&N intenso",
    accent: "#d8d8dd",
    recipe: { grayscale: 1, contrast: 0.24, clarity: 0.16, vignette: 0.2, grain: 0.12 },
  },
  {
    id: "vintage",
    label: "Vintage",
    subtitle: "Recuerdo cálido",
    accent: "#d39b70",
    recipe: { contrast: -0.08, saturation: -0.18, warmth: 0.28, tint: 0.08, fade: 0.28, grain: 0.24, vignette: 0.18 },
  },
];

export function getFilterPreset(id: FilterId) {
  return FILTER_PRESETS.find((preset) => preset.id === id) ?? FILTER_PRESETS[0];
}
