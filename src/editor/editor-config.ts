import type { CropPreset, EditorSettings } from "./types";

export type PanelTab = "looks" | "adjust" | "crop" | "effects" | "export";
export type AdjustGroup = "light" | "color";
export type ExportFormat = "jpeg" | "png";
export type ExportEdge = 4096 | 2048 | 1080;
export type NumericSettingKey = {
  [K in keyof EditorSettings]: EditorSettings[K] extends number ? K : never;
}[keyof EditorSettings];

export type Adjustment = {
  key: NumericSettingKey;
  icon: string;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  neutral: number;
  format: (value: number) => string;
};

const signed = (value: number) => {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

export const LIGHT_ADJUSTMENTS: Adjustment[] = [
  { key: "exposure", icon: "◒", label: "Exposición", minimum: -2, maximum: 2, step: 0.01, neutral: 0, format: (value) => signed(value * 50) },
  { key: "brightness", icon: "☀", label: "Brillo", minimum: 0.4, maximum: 1.6, step: 0.01, neutral: 1, format: (value) => signed((value - 1) * 100) },
  { key: "contrast", icon: "◐", label: "Contraste", minimum: 0.4, maximum: 1.6, step: 0.01, neutral: 1, format: (value) => signed((value - 1) * 100) },
  { key: "highlights", icon: "◯", label: "Luces", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "shadows", icon: "●", label: "Sombras", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "whites", icon: "◇", label: "Blancos", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "blacks", icon: "◆", label: "Negros", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
];

export const COLOR_ADJUSTMENTS: Adjustment[] = [
  { key: "saturation", icon: "◉", label: "Saturación", minimum: 0, maximum: 2, step: 0.01, neutral: 1, format: (value) => signed((value - 1) * 100) },
  { key: "vibrance", icon: "✦", label: "Vibrancia", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "warmth", icon: "♨", label: "Temperatura", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "tint", icon: "◈", label: "Tinte", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
];

export const EFFECT_ADJUSTMENTS: Adjustment[] = [
  { key: "clarity", icon: "✧", label: "Claridad", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "sharpness", icon: "△", label: "Definición", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "fade", icon: "◌", label: "Desvanecer", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
  { key: "vignette", icon: "◍", label: "Viñeta", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
  { key: "grain", icon: "⁙", label: "Grano", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
  { key: "grayscale", icon: "◑", label: "Blanco y negro", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
];

export const CROP_ADJUSTMENTS: Adjustment[] = [
  { key: "straighten", icon: "／", label: "Enderezar", minimum: -15, maximum: 15, step: 0.1, neutral: 0, format: (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}°` },
  { key: "perspectiveX", icon: "↔", label: "Perspectiva H", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "perspectiveY", icon: "↕", label: "Perspectiva V", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signed(value * 100) },
  { key: "zoom", icon: "⌕", label: "Zoom", minimum: 1, maximum: 4, step: 0.01, neutral: 1, format: (value) => `${Math.round(value * 100)}%` },
];

export const CROP_PRESETS: { id: CropPreset; label: string; ratio: string }[] = [
  { id: "original", label: "Original", ratio: "Auto" },
  { id: "free", label: "Libre", ratio: "↔" },
  { id: "square", label: "Cuadrado", ratio: "1:1" },
  { id: "portrait", label: "Retrato", ratio: "4:5" },
  { id: "story", label: "Historia", ratio: "9:16" },
  { id: "landscape", label: "Paisaje", ratio: "16:9" },
];

export const TAB_ITEMS: { id: PanelTab; icon: string; label: string }[] = [
  { id: "looks", icon: "✦", label: "Looks" },
  { id: "adjust", icon: "☀", label: "Ajustar" },
  { id: "crop", icon: "⌗", label: "Recorte" },
  { id: "effects", icon: "◌", label: "Efectos" },
  { id: "export", icon: "↑", label: "Guardar" },
];

export const PANEL_TITLES: Record<PanelTab, string> = {
  looks: "Un toque y listo",
  adjust: "Control preciso",
  crop: "Encuadre perfecto",
  effects: "Acabado personal",
  export: "Lista para salir",
};

export const PANEL_COPY: Record<PanelTab, string> = {
  looks: "Elige una estética y regula su intensidad.",
  adjust: "Luz y color organizados sin perderte.",
  crop: "Recorta, endereza y mueve la imagen con los dedos.",
  effects: "Detalles sutiles que terminan la foto.",
  export: "Guarda en Fotos o compártela con el tamaño correcto.",
};

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
