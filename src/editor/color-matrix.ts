import type { EditorSettings } from "./types";

type Matrix = number[];

const IDENTITY: Matrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

function multiply(after: Matrix, before: Matrix): Matrix {
  const output = new Array<number>(20).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) value += after[row * 5 + index] * before[index * 5 + column];
      output[row * 5 + column] = value;
    }
    let offset = after[row * 5 + 4];
    for (let index = 0; index < 4; index += 1) offset += after[row * 5 + index] * before[index * 5 + 4];
    output[row * 5 + 4] = offset;
  }
  return output;
}

function scaleRgb(value: number): Matrix {
  return [value, 0, 0, 0, 0, 0, value, 0, 0, 0, 0, 0, value, 0, 0, 0, 0, 0, 1, 0];
}

function contrast(value: number): Matrix {
  const offset = 128 * (1 - value);
  return [value, 0, 0, 0, offset, 0, value, 0, 0, offset, 0, 0, value, 0, offset, 0, 0, 0, 1, 0];
}

function saturation(value: number): Matrix {
  const red = 0.2126;
  const green = 0.7152;
  const blue = 0.0722;
  const inverse = 1 - value;
  return [
    inverse * red + value, inverse * green, inverse * blue, 0, 0,
    inverse * red, inverse * green + value, inverse * blue, 0, 0,
    inverse * red, inverse * green, inverse * blue + value, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function warmth(value: number): Matrix {
  const amount = value * 24;
  return [1, 0, 0, 0, amount, 0, 1, 0, 0, amount * 0.25, 0, 0, 1, 0, -amount, 0, 0, 0, 1, 0];
}

function fade(value: number): Matrix {
  const scale = 1 - value * 0.22;
  const offset = value * 28;
  return [scale, 0, 0, 0, offset, 0, scale, 0, 0, offset, 0, 0, scale, 0, offset, 0, 0, 0, 1, 0];
}

export function buildColorMatrix(settings: EditorSettings): Matrix {
  let matrix = [...IDENTITY];
  matrix = multiply(scaleRgb(settings.brightness), matrix);
  matrix = multiply(contrast(settings.contrast), matrix);
  matrix = multiply(saturation(settings.saturation), matrix);
  matrix = multiply(warmth(settings.warmth), matrix);
  matrix = multiply(fade(settings.fade), matrix);
  matrix = multiply(saturation(1 - settings.grayscale), matrix);
  return matrix;
}
