import type { EditorSettings, ImageAsset } from "./types";

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

export function getRotatedSourceSize(asset: ImageAsset, rotation: number) {
  const normalized = normalizeRotation(rotation);
  const swapsDimensions = normalized === 90 || normalized === 270;

  return {
    width: swapsDimensions ? asset.height : asset.width,
    height: swapsDimensions ? asset.width : asset.height,
  };
}

export function getCropAspect(settings: EditorSettings, asset: ImageAsset) {
  const source = getRotatedSourceSize(asset, settings.rotation);

  switch (settings.cropPreset) {
    case "square":
      return 1;
    case "portrait":
      return 4 / 5;
    case "story":
      return 9 / 16;
    case "landscape":
      return 16 / 9;
    case "free":
      return clamp(settings.freeAspect, 0.5, 2);
    case "original":
    default:
      return source.width / Math.max(1, source.height);
  }
}

export function fitAspectWithin(
  width: number,
  height: number,
  aspect: number,
  padding = 0,
) {
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  let frameWidth = availableWidth;
  let frameHeight = frameWidth / Math.max(0.01, aspect);

  if (frameHeight > availableHeight) {
    frameHeight = availableHeight;
    frameWidth = frameHeight * aspect;
  }

  return {
    x: (width - frameWidth) / 2,
    y: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}

export function getExportSize(
  asset: ImageAsset,
  settings: EditorSettings,
  maxEdge: number,
) {
  const source = getRotatedSourceSize(asset, settings.rotation);
  const sourceAspect = source.width / Math.max(1, source.height);
  const targetAspect = getCropAspect(settings, asset);

  let cropWidth = source.width;
  let cropHeight = source.height;

  if (targetAspect > sourceAspect) {
    cropHeight = source.width / targetAspect;
  } else {
    cropWidth = source.height * targetAspect;
  }

  const boundedEdge = Math.max(512, maxEdge);
  const scale = Math.min(1, boundedEdge / Math.max(cropWidth, cropHeight));

  return {
    width: Math.max(1, Math.round(cropWidth * scale)),
    height: Math.max(1, Math.round(cropHeight * scale)),
  };
}
