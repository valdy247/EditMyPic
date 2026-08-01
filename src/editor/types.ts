export type CropPreset =
  | "original"
  | "free"
  | "square"
  | "portrait"
  | "story"
  | "landscape";

export type FilterId =
  | "none"
  | "clean"
  | "golden"
  | "portrait"
  | "cinema"
  | "film"
  | "moody"
  | "urban"
  | "travel"
  | "mono"
  | "vintage";

export type EditorSettings = {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  warmth: number;
  tint: number;
  fade: number;
  grayscale: number;
  clarity: number;
  sharpness: number;
  vignette: number;
  grain: number;
  rotation: number;
  straighten: number;
  perspectiveX: number;
  perspectiveY: number;
  flipX: boolean;
  flipY: boolean;
  cropPreset: CropPreset;
  freeAspect: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  filterId: FilterId;
  filterIntensity: number;
};

export type ImageAsset = {
  uri: string;
  width: number;
  height: number;
  fileName: string;
};

export type SavedLook = Pick<
  EditorSettings,
  | "exposure"
  | "brightness"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "saturation"
  | "vibrance"
  | "warmth"
  | "tint"
  | "fade"
  | "grayscale"
  | "clarity"
  | "sharpness"
  | "vignette"
  | "grain"
  | "filterId"
  | "filterIntensity"
>;

export const DEFAULT_SETTINGS: EditorSettings = {
  exposure: 0,
  brightness: 1,
  contrast: 1,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 1,
  vibrance: 0,
  warmth: 0,
  tint: 0,
  fade: 0,
  grayscale: 0,
  clarity: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
  rotation: 0,
  straighten: 0,
  perspectiveX: 0,
  perspectiveY: 0,
  flipX: false,
  flipY: false,
  cropPreset: "original",
  freeAspect: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  filterId: "none",
  filterIntensity: 0.75,
};

export const LOOK_KEYS: (keyof SavedLook)[] = [
  "exposure",
  "brightness",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "saturation",
  "vibrance",
  "warmth",
  "tint",
  "fade",
  "grayscale",
  "clarity",
  "sharpness",
  "vignette",
  "grain",
  "filterId",
  "filterIntensity",
];
