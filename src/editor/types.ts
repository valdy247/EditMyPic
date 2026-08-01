export type EditorSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  fade: number;
  grayscale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type ImageAsset = {
  uri: string;
  width: number;
  height: number;
  fileName: string;
};

export const DEFAULT_SETTINGS: EditorSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  fade: 0,
  grayscale: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
};
