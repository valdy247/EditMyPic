import {
  ADJUSTMENT_KEYS,
  DEFAULT_SETTINGS,
  type AdjustmentKey,
  type EditorSettings,
} from "./types";

export type FilterPreset = {
  id: string;
  name: string;
  caption: string;
  symbol: string;
  accent: string;
  settings: Partial<Pick<EditorSettings, AdjustmentKey>>;
};

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: "clean",
    name: "Clean",
    caption: "Luz natural",
    symbol: "✦",
    accent: "#d9e7ff",
    settings: { exposure: 0.08, shadows: 0.16, highlights: -0.1, vibrance: 0.12, sharpness: 0.14 },
  },
  {
    id: "golden",
    name: "Golden",
    caption: "Cálido y vivo",
    symbol: "☀",
    accent: "#ffc66d",
    settings: { exposure: 0.05, warmth: 0.34, tint: 0.04, contrast: 1.08, vibrance: 0.18, vignette: 0.08 },
  },
  {
    id: "portrait",
    name: "Portrait",
    caption: "Piel suave",
    symbol: "◉",
    accent: "#ffb8c7",
    settings: { exposure: 0.08, highlights: -0.18, shadows: 0.18, warmth: 0.12, saturation: 0.94, clarity: -0.08, sharpness: 0.08 },
  },
  {
    id: "film",
    name: "Film",
    caption: "Color analógico",
    symbol: "◇",
    accent: "#a8d8b9",
    settings: { contrast: 0.92, highlights: -0.12, shadows: 0.1, warmth: 0.1, fade: 0.22, grain: 0.22, vignette: 0.1 },
  },
  {
    id: "moody",
    name: "Moody",
    caption: "Sombras profundas",
    symbol: "◐",
    accent: "#8f8db6",
    settings: { exposure: -0.1, contrast: 1.18, highlights: -0.3, shadows: -0.1, saturation: 0.86, warmth: -0.08, vignette: 0.24, clarity: 0.14 },
  },
  {
    id: "travel",
    name: "Travel",
    caption: "Paisajes vivos",
    symbol: "△",
    accent: "#7fd6cb",
    settings: { exposure: 0.05, contrast: 1.08, highlights: -0.2, shadows: 0.18, vibrance: 0.32, clarity: 0.14, sharpness: 0.2 },
  },
  {
    id: "urban",
    name: "Urban",
    caption: "Frío moderno",
    symbol: "▦",
    accent: "#7bb5ff",
    settings: { contrast: 1.2, highlights: -0.16, shadows: -0.08, warmth: -0.24, tint: 0.08, saturation: 0.88, clarity: 0.24, vignette: 0.16 },
  },
  {
    id: "night",
    name: "Night",
    caption: "Noches limpias",
    symbol: "☾",
    accent: "#8095ff",
    settings: { exposure: 0.02, highlights: -0.36, shadows: 0.22, blacks: -0.16, warmth: -0.18, vibrance: 0.16, sharpness: 0.16, vignette: 0.2 },
  },
  {
    id: "mono",
    name: "Mono",
    caption: "Blanco y negro",
    symbol: "◑",
    accent: "#d6d6da",
    settings: { grayscale: 1, contrast: 1.16, highlights: -0.18, shadows: 0.08, clarity: 0.2, grain: 0.12 },
  },
  {
    id: "soft",
    name: "Soft",
    caption: "Suave y pastel",
    symbol: "○",
    accent: "#d9b8ff",
    settings: { exposure: 0.08, contrast: 0.84, highlights: -0.2, shadows: 0.24, saturation: 0.88, warmth: 0.08, fade: 0.2 },
  },
];

export const AUTO_ENHANCE_SETTINGS: Partial<Pick<EditorSettings, AdjustmentKey>> = {
  exposure: 0.08,
  contrast: 1.06,
  highlights: -0.18,
  shadows: 0.2,
  vibrance: 0.16,
  clarity: 0.08,
  sharpness: 0.16,
};

export function settingsFromPreset(
  current: EditorSettings,
  preset: FilterPreset,
  intensity: number,
): EditorSettings {
  const amount = Math.min(1, Math.max(0, intensity));
  const next = { ...current };

  for (const key of ADJUSTMENT_KEYS) {
    const neutral = DEFAULT_SETTINGS[key];
    const target = preset.settings[key] ?? neutral;
    next[key] = neutral + (target - neutral) * amount;
  }

  return next;
}

export function applyAutoEnhance(current: EditorSettings): EditorSettings {
  const next = { ...current };
  for (const key of ADJUSTMENT_KEYS) {
    const value = AUTO_ENHANCE_SETTINGS[key];
    if (value !== undefined) next[key] = value;
  }
  return next;
}
