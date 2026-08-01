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

export function isForegroundRemovalSupported() {
  return nativeModule?.isSupported() ?? false;
}

export async function createForegroundMask(uri: string) {
  if (!nativeModule) {
    throw new Error(
      "Quitar fondo necesita la build nativa de iPhone. Crea un Launch nuevo.",
    );
  }
  return nativeModule.createForegroundMask(uri);
}
