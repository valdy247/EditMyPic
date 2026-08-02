import { requireOptionalNativeModule } from "expo";

export type ForegroundMaskResult = {
  maskUri: string;
  mode: "subjects" | "person";
  width: number;
  height: number;
};

type EditMyPicVisionNativeModule = {
  isSupported: () => boolean;
  createForegroundMask: (uri: string) => Promise<ForegroundMaskResult>;
};

const nativeModule =
  requireOptionalNativeModule<EditMyPicVisionNativeModule>("EditMyPicVision");

function friendlyVisionError(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : "No pudimos separar el fondo.";

  if (rawMessage.includes("No encontramos un sujeto")) {
    return "No encontramos un sujeto separado del fondo. Prueba con una persona, mascota u objeto más cercano, o utiliza Borrar para marcar una zona.";
  }

  if (rawMessage.includes("No pudimos leer esta imagen")) {
    return "No pudimos leer esta imagen. Prueba con otra foto.";
  }

  if (rawMessage.includes("No pudimos preparar")) {
    return "No pudimos preparar el recorte. Inténtalo nuevamente.";
  }

  const cleaned = rawMessage
    .replace(/^UnexpectedException:\s*/i, "")
    .split("(at ExpoModulesCore/")[0]
    .trim();

  return cleaned || "No pudimos separar el fondo. Inténtalo nuevamente.";
}

export function isForegroundRemovalSupported() {
  return nativeModule?.isSupported() ?? false;
}

export async function createForegroundMask(uri: string) {
  if (!nativeModule) {
    throw new Error(
      "Quitar fondo necesita la build nativa de iPhone. Crea un Launch nuevo.",
    );
  }

  try {
    return await nativeModule.createForegroundMask(uri);
  } catch (error) {
    throw new Error(friendlyVisionError(error));
  }
}
