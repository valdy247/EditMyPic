import type { CropRatio, EditorSettings, ImageAsset } from "./types";

export const MAX_EXPORT_EDGE = 4096;

export function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

export function getOrientedSourceSize(asset: ImageAsset, rotation: number) {
  const normalized = normalizeRotation(rotation);
  const swapsDimensions = normalized === 90 || normalized === 270;
  return {
    width: swapsDimensions ? asset.height : asset.width,
    height: swapsDimensions ? asset.width : asset.height,
  };
}

export function getCropAspect(
  ratio: CropRatio,
  asset: ImageAsset,
  rotation: number,
) {
  const source = getOrientedSourceSize(asset, rotation);

  switch (ratio) {
    case "square":
      return 1;
    case "portrait":
      return 4 / 5;
    case "story":
      return 9 / 16;
    case "landscape":
      return 16 / 9;
    default:
      return source.width / source.height;
  }
}

export function getExportSize(
  asset: ImageAsset,
  settings: EditorSettings,
  scaleOption: number,
) {
  const source = getOrientedSourceSize(asset, settings.rotation);
  const aspect = getCropAspect(settings.cropRatio, asset, settings.rotation);
  const sourceAspect = source.width / source.height;

  let cropWidth = source.width;
  let cropHeight = source.height;

  if (sourceAspect > aspect) {
    cropWidth = source.height * aspect;
  } else if (sourceAspect < aspect) {
    cropHeight = source.width / aspect;
  }

  const edgeScale = Math.min(1, MAX_EXPORT_EDGE / Math.max(cropWidth, cropHeight));
  const scale = Math.max(0.25, Math.min(1, scaleOption)) * edgeScale;

  return {
    width: Math.max(1, Math.round(cropWidth * scale)),
    height: Math.max(1, Math.round(cropHeight * scale)),
  };
}
