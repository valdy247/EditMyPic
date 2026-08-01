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

function exposure(value: number): Matrix {
  const stops = clamp(value, -1, 1) * 0.55;
  return scaleRgb(Math.pow(2, stops));
}

function brightness(value: number): Matrix {
  const amount = clamp(value - 1, -0.6, 0.6);
  return offsetRgb(amount * 0.24, amount * 0.24, amount * 0.24);
}

function contrast(value: number, clarity: number, sharpness: number): Matrix {
  const base = clamp(value - 1, -0.6, 0.6) * 0.7;
  const detail = clamp(clarity, -1, 1) * 0.12 + clamp(sharpness, 0, 1) * 0.045;
  const amount = clamp(1 + base + detail, 0.48, 1.58);
  const offset = 0.5 * (1 - amount);

  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function tone(
  highlights: number,
  shadows: number,
  whites: number,
  blacks: number,
): Matrix {
  const hi = clamp(highlights, -1, 1);
  const sh = clamp(shadows, -1, 1);
  const wh = clamp(whites, -1, 1);
  const bl = clamp(blacks, -1, 1);

  let scale = 1;
  let offset = 0;

  if (hi >= 0) {
    scale += hi * 0.13;
    offset += hi * 0.01;
  } else {
    scale += hi * 0.18;
    offset -= hi * 0.075;
  }

  if (sh >= 0) {
    scale -= sh * 0.16;
    offset += sh * 0.16;
  } else {
    scale -= sh * 0.08;
    offset += sh * 0.08;
  }

  scale += wh * 0.14;
  offset += bl * 0.09;

  return [
    scale, 0, 0, 0, offset,
    0, scale, 0, 0, offset,
    0, 0, scale, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function saturation(value: number, vibrance: number): Matrix {
  const amount = clamp(
    1 + (value - 1) * 0.85 + clamp(vibrance, -1, 1) * 0.42,
    0,
    2,
  );
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

function warmthAndTint(warmth: number, tint: number): Matrix {
  const warm = clamp(warmth, -1, 1);
  const magenta = clamp(tint, -1, 1);

  const red = warm * 0.07 + magenta * 0.028;
  const green = warm * 0.01 - magenta * 0.045;
  const blue = -warm * 0.07 + magenta * 0.028;

  return offsetRgb(red, green, blue);
}

function fade(value: number): Matrix {
  const amount = clamp(value, 0, 1);
  const scale = 1 - amount * 0.17;
  const offset = amount * 0.085;

  return [
    scale, 0, 0, 0, offset,
    0, scale, 0, 0, offset,
    0, 0, scale, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function grayscale(value: number): Matrix {
  const amount = clamp(value, 0, 1);
  const remaining = 1 - amount;
  const red = 0.2126;
  const green = 0.7152;
  const blue = 0.0722;
  const inverse = 1 - remaining;

  return [
    inverse * red + remaining, inverse * green, inverse * blue, 0, 0,
    inverse * red, inverse * green + remaining, inverse * blue, 0, 0,
    inverse * red, inverse * green, inverse * blue + remaining, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

export function buildColorMatrix(settings: EditorSettings): Matrix {
  let matrix = [...IDENTITY];
  matrix = multiply(exposure(settings.exposure), matrix);
  matrix = multiply(brightness(settings.brightness), matrix);
  matrix = multiply(
    tone(settings.highlights, settings.shadows, settings.whites, settings.blacks),
    matrix,
  );
  matrix = multiply(
    contrast(settings.contrast, settings.clarity, settings.sharpness),
    matrix,
  );
  matrix = multiply(saturation(settings.saturation, settings.vibrance), matrix);
  matrix = multiply(warmthAndTint(settings.warmth, settings.tint), matrix);
  matrix = multiply(fade(settings.fade), matrix);
  matrix = multiply(grayscale(settings.grayscale), matrix);
  return matrix;
}
