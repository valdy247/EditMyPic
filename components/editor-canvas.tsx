import { forwardRef, useMemo } from "react";
import {
  Canvas,
  ColorMatrix,
  CubicSampling,
  Group,
  Image,
  type SkiaView,
  useImage,
} from "@shopify/react-native-skia";
import type { StyleProp, ViewStyle } from "react-native";

import { buildColorMatrix } from "@/src/editor/color-matrix";
import type { EditorSettings, ImageAsset } from "@/src/editor/types";

type Props = {
  asset: ImageAsset;
  settings: EditorSettings;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
};

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

export const EditorCanvas = forwardRef<SkiaView, Props>(function EditorCanvas(
  { asset, settings, width, height, style },
  ref,
) {
  const image = useImage(asset.uri);
  const matrix = useMemo(() => buildColorMatrix(settings), [settings]);

  const geometry = useMemo(() => {
    const normalized = normalizeRotation(settings.rotation);
    const swapsDimensions = normalized === 90 || normalized === 270;
    const rotatedWidth = swapsDimensions ? asset.height : asset.width;
    const rotatedHeight = swapsDimensions ? asset.width : asset.height;
    const scale = Math.min(width / rotatedWidth, height / rotatedHeight);

    return {
      drawWidth: asset.width * scale,
      drawHeight: asset.height * scale,
      radians: (normalized * Math.PI) / 180,
    };
  }, [asset.height, asset.width, height, settings.rotation, width]);

  if (!image || width <= 0 || height <= 0) return null;

  return (
    <Canvas ref={ref} style={[{ width, height }, style]}>
      <Group
        origin={{ x: width / 2, y: height / 2 }}
        transform={[
          { rotate: geometry.radians },
          { scaleX: settings.flipX ? -1 : 1 },
          { scaleY: settings.flipY ? -1 : 1 },
        ]}
      >
        <Image
          image={image}
          x={(width - geometry.drawWidth) / 2}
          y={(height - geometry.drawHeight) / 2}
          width={geometry.drawWidth}
          height={geometry.drawHeight}
          fit="fill"
          sampling={CubicSampling}
        >
          <ColorMatrix matrix={matrix} />
        </Image>
      </Group>
    </Canvas>
  );
});
