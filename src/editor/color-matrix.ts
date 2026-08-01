import { getFilterPreset } from "./presets";
import type { EditorSettings } from "./types";

type Matrix = number[];

const IDENTITY: Matrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function multiply(after: Matrix, before: Matrix): Matrix {
  const output = new Array<number>(20).fill(0);

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += after[row * 5 + index] * before[index * 5 + column];
      }
      output[row * 5 + column] = value;
    }

    let offset = after[row * 5 + 4];
    for (let index = 0; index < 4; index += 1) {
      offset += after[row * 5 + index] * before[index * 5 + 4];
    }
    output[row * 5 + 4] = offset;
  }

  return output;
}

function scaleRgb(value: number): Matrix {
  return [
    value, 0, 0, 0, 0,
    0, value, 0, 0, 0,
    0, 0, value, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function offsetRgb(red: number, green: number, blue: number): Matrix {
  return [
    1, 0, 0, 0, red,
    0, 1, 0, 0, green,
    0, 0, 1, 0, blue,
    0, 0, 0, 1, 0,
  ];
}

function brightness(value: number): Matrix {
  const offset = clamp(value - 1, -0.6, 0.6) * 0.32;
  return offsetRgb(offset, offset, offset);
}

function exposure(value: number): Matrix {
  const amount = Math.pow(2, clamp(value, -2, 2) * 0.28);
  return scaleRgb(amount);
}

function contrast(value: number): Matrix {
  const amount = 1 + clamp(value - 1, -0.8, 0.8) * 0.72;
  const offset = 0.5 * (1 - amount);

  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function saturation(value: number): Matrix {
  const amount = clamp(1 + (value - 1) * 0.86, 0, 2.1);
  const red = 0.2126;
  const green = 0.7152;
  const blue = 0.0722;
  const inverse = 1 - amount;

  return [
    inverse * red + amount, inverse * green, inverse * blue, 0, 0,
    inverse * red, inverse * green + amount, inverse * blue, 0, 0,
    inverse * red, inverse * green, inverse * blue + amount, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function warmth(value: number): Matrix {
  const amount = clamp(value, -1, 1);
  return offsetRgb(amount * 0.075, amount * 0.012, amount * -0.075);
}

function tint(value: number): Matrix {
  const amount = clamp(value, -1, 1);
  return offsetRgb(amount * 0.035, amount * -0.05, amount * 0.035);
}

function fade(value: number): Matrix {
  const amount = clamp(value, 0, 1);
  const scale = 1 - amount * 0.16;
  const offset = amount * 0.08;

  return [
    scale, 0, 0, 0, offset,
    0, scale, 0, 0, offset,
    0, 0, scale, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function grayscale(value: number): Matrix {
  const amount = clamp(value, 0, 1);
  return saturation(1 - amount);
}

function tone(settings: EditorSettings): Matrix {
  const highlights = clamp(settings.highlights, -1, 1);
  const shadows = clamp(settings.shadows, -1, 1);
  const whites = clamp(settings.whites, -1, 1);
  const blacks = clamp(settings.blacks, -1, 1);

  const gain = clamp(
    1 + highlights * 0.14 + whites * 0.12 - shadows * 0.035 - blacks * 0.025,
    0.72,
    1.32,
  );
  const lift = clamp(shadows * 0.09 + blacks * 0.055, -0.13, 0.14);

  return [
    gain, 0, 0, 0, lift,
    0, gain, 0, 0, lift,
    0, 0, gain, 0, lift,
    0, 0, 0, 1, 0,
  ];
}

function applyFilter(matrix: Matrix, settings: EditorSettings) {
  const preset = getFilterPreset(settings.filterId);
  const intensity = clamp(settings.filterIntensity, 0, 1);
  const recipe = preset.recipe;
  let output = matrix;

  if (recipe.exposure) output = multiply(exposure(recipe.exposure * intensity), output);
  if (recipe.brightness) output = multiply(brightness(1 + recipe.brightness * intensity), output);
  if (recipe.contrast) output = multiply(contrast(1 + recipe.contrast * intensity), output);
  if (recipe.saturation) output = multiply(saturation(1 + recipe.saturation * intensity), output);
  if (recipe.warmth) output = multiply(warmth(recipe.warmth * intensity), output);
  if (recipe.tint) output = multiply(tint(recipe.tint * intensity), output);
  if (recipe.fade) output = multiply(fade(recipe.fade * intensity), output);
  if (recipe.grayscale) output = multiply(grayscale(recipe.grayscale * intensity), output);
  if (recipe.clarity) {
    output = multiply(contrast(1 + recipe.clarity * 0.28 * intensity), output);
  }

  return output;
}

export function getOverlayEffects(settings: EditorSettings) {
  const preset = getFilterPreset(settings.filterId);
  const intensity = clamp(settings.filterIntensity, 0, 1);

  return {
    vignette: clamp(
      settings.vignette + (preset.recipe.vignette ?? 0) * intensity,
      0,
      1,
    ),
    grain: clamp(settings.grain + (preset.recipe.grain ?? 0) * intensity, 0, 1),
  };
}

export function buildColorMatrix(settings: EditorSettings): Matrix {
  let matrix = [...IDENTITY];
  matrix = multiply(exposure(settings.exposure), matrix);
  matrix = multiply(brightness(settings.brightness), matrix);
  matrix = multiply(tone(settings), matrix);
  matrix = multiply(contrast(settings.contrast), matrix);
  matrix = multiply(
    contrast(1 + settings.clarity * 0.18 + settings.sharpness * 0.1),
    matrix,
  );
  matrix = multiply(saturation(settings.saturation), matrix);
  matrix = multiply(saturation(1 + settings.vibrance * 0.45), matrix);
  matrix = multiply(warmth(settings.warmth), matrix);
  matrix = multiply(tint(settings.tint), matrix);
  matrix = multiply(fade(settings.fade), matrix);
  matrix = multiply(grayscale(settings.grayscale), matrix);
  return applyFilter(matrix, settings);
}
