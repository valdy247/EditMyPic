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

function brightness(value: number): Matrix {
  const offset = clamp(value - 1, -0.6, 0.6) * 0.32;
  return [
    1, 0, 0, 0, offset,
    0, 1, 0, 0, offset,
    0, 0, 1, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function contrast(value: number): Matrix {
  const amount = 1 + clamp(value - 1, -0.6, 0.6) * 0.7;
  const offset = 0.5 * (1 - amount);

  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function saturation(value: number): Matrix {
  const amount = clamp(1 + (value - 1) * 0.85, 0.15, 1.85);
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
  const redOffset = amount * 0.075;
  const greenOffset = amount * 0.012;
  const blueOffset = amount * -0.075;

  return [
    1, 0, 0, 0, redOffset,
    0, 1, 0, 0, greenOffset,
    0, 0, 1, 0, blueOffset,
    0, 0, 0, 1, 0,
  ];
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
  const saturationAmount = 1 - amount;
  const red = 0.2126;
  const green = 0.7152;
  const blue = 0.0722;
  const inverse = 1 - saturationAmount;

  return [
    inverse * red + saturationAmount, inverse * green, inverse * blue, 0, 0,
    inverse * red, inverse * green + saturationAmount, inverse * blue, 0, 0,
    inverse * red, inverse * green, inverse * blue + saturationAmount, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

export function buildColorMatrix(settings: EditorSettings): Matrix {
  let matrix = [...IDENTITY];
  matrix = multiply(brightness(settings.brightness), matrix);
  matrix = multiply(contrast(settings.contrast), matrix);
  matrix = multiply(saturation(settings.saturation), matrix);
  matrix = multiply(warmth(settings.warmth), matrix);
  matrix = multiply(fade(settings.fade), matrix);
  matrix = multiply(grayscale(settings.grayscale), matrix);
  return matrix;
}
