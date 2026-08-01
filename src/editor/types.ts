export type CropRatio = "original" | "square" | "portrait" | "story" | "landscape";

export type EditorSettings = {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  warmth: number;
  tint: number;
  saturation: number;
  vibrance: number;
  clarity: number;
  sharpness: number;
  fade: number;
  grayscale: number;
  vignette: number;
  grain: number;
  rotation: number;
  straighten: number;
  flipX: boolean;
  flipY: boolean;
  cropRatio: CropRatio;
  cropX: number;
  cropY: number;
};

export type ImageAsset = {
  uri: string;
  width: number;
  height: number;
  fileName: string;
};

export const DEFAULT_SETTINGS: EditorSettings = {
  exposure: 0,
  brightness: 1,
  contrast: 1,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  warmth: 0,
  tint: 0,
  saturation: 1,
  vibrance: 0,
  clarity: 0,
  sharpness: 0,
  fade: 0,
  grayscale: 0,
  vignette: 0,
  grain: 0,
  rotation: 0,
  straighten: 0,
  flipX: false,
  flipY: false,
  cropRatio: "original",
  cropX: 0,
  cropY: 0,
};

export const ADJUSTMENT_KEYS = [
  "exposure",
  "brightness",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "warmth",
  "tint",
  "saturation",
  "vibrance",
  "clarity",
  "sharpness",
  "fade",
  "grayscale",
  "vignette",
  "grain",
] as const;

export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];
