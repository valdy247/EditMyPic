import { forwardRef, useMemo } from "react";
import {
  Canvas,
  ColorMatrix,
  CubicSampling,
  Group,
  Image,
  RadialGradient,
  Rect,
  Turbulence,
  type SkiaView,
  useImage,
  vec,
} from "@shopify/react-native-skia";
import type { StyleProp, ViewStyle } from "react-native";

import { buildColorMatrix } from "@/src/editor/color-matrix";
import { getCropAspect, getOrientedSourceSize } from "@/src/editor/geometry";
import type { EditorSettings, ImageAsset } from "@/src/editor/types";

type Props = {
  asset: ImageAsset;
  settings: EditorSettings;
  width: number;
  height: number;
  preview?: boolean;
  previewScale?: number;
  previewTranslateX?: number;
  previewTranslateY?: number;
  style?: StyleProp<ViewStyle>;
};

function fitArtboard(width: number, height: number, aspect: number, preview: boolean) {
  const padding = preview ? 14 : 0;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);

  let artboardWidth = availableWidth;
  let artboardHeight = artboardWidth / aspect;

  if (artboardHeight > availableHeight) {
    artboardHeight = availableHeight;
    artboardWidth = artboardHeight * aspect;
  }

  return {
    x: (width - artboardWidth) / 2,
    y: (height - artboardHeight) / 2,
    width: artboardWidth,
    height: artboardHeight,
  };
}

export const EditorCanvas = forwardRef<SkiaView, Props>(function EditorCanvas(
  {
    asset,
    settings,
    width,
    height,
    preview = false,
    previewScale = 1,
    previewTranslateX = 0,
    previewTranslateY = 0,
    style,
  },
  ref,
) {
  const image = useImage(asset.uri);
  const matrix = useMemo(() => buildColorMatrix(settings), [settings]);

  const geometry = useMemo(() => {
    const aspect = getCropAspect(settings.cropRatio, asset, settings.rotation);
    const artboard = fitArtboard(width, height, aspect, preview);
    const oriented = getOrientedSourceSize(asset, settings.rotation);
    const baseScale = Math.max(
      artboard.width / oriented.width,
      artboard.height / oriented.height,
    );
    const straightenRadians = (Math.abs(settings.straighten) * Math.PI) / 180;
    const overscan = 1 / Math.max(0.88, Math.cos(straightenRadians));
    const scale = baseScale * overscan;

    return {
      artboard,
      centerX: artboard.x + artboard.width / 2,
      centerY: artboard.y + artboard.height / 2,
      drawWidth: asset.width * scale,
      drawHeight: asset.height * scale,
      radians: ((settings.rotation + settings.straighten) * Math.PI) / 180,
      cropOffsetX: settings.cropX * artboard.width * 0.22,
      cropOffsetY: settings.cropY * artboard.height * 0.22,
    };
  }, [asset, height, preview, settings, width]);

  if (!image || width <= 0 || height <= 0) return null;

  const { artboard } = geometry;

  return (
    <Canvas ref={ref} style={[{ width, height }, style]}>
      <Rect x={0} y={0} width={width} height={height} color="#090b10" />
      <Group clip={artboard}>
        <Rect
          x={artboard.x}
          y={artboard.y}
          width={artboard.width}
          height={artboard.height}
          color="#11141b"
        />

        <Group
          origin={vec(geometry.centerX, geometry.centerY)}
          transform={[
            { translateX: previewTranslateX },
            { translateY: previewTranslateY },
            { scale: previewScale },
          ]}
        >
          <Group
            origin={vec(geometry.centerX, geometry.centerY)}
            transform={[
              { rotate: geometry.radians },
              { scaleX: settings.flipX ? -1 : 1 },
              { scaleY: settings.flipY ? -1 : 1 },
            ]}
          >
            <Image
              image={image}
              x={
                geometry.centerX -
                geometry.drawWidth / 2 +
                geometry.cropOffsetX
              }
              y={
                geometry.centerY -
                geometry.drawHeight / 2 +
                geometry.cropOffsetY
              }
              width={geometry.drawWidth}
              height={geometry.drawHeight}
              fit="fill"
              sampling={CubicSampling}
            >
              <ColorMatrix matrix={matrix} />
            </Image>
          </Group>
        </Group>

        {settings.vignette > 0 ? (
          <Rect
            x={artboard.x}
            y={artboard.y}
            width={artboard.width}
            height={artboard.height}
            blendMode="multiply"
            opacity={Math.min(0.82, settings.vignette * 0.88)}
          >
            <RadialGradient
              c={vec(geometry.centerX, geometry.centerY)}
              r={Math.max(artboard.width, artboard.height) * 0.72}
              colors={["rgba(255,255,255,0)", "rgba(0,0,0,0.92)"]}
              positions={[0.38, 1]}
            />
          </Rect>
        ) : null}

        {settings.grain > 0 ? (
          <Rect
            x={artboard.x}
            y={artboard.y}
            width={artboard.width}
            height={artboard.height}
            blendMode="softLight"
            opacity={Math.min(0.22, settings.grain * 0.24)}
          >
            <Turbulence freqX={0.58} freqY={0.58} octaves={2} seed={17} />
          </Rect>
        ) : null}
      </Group>

      {preview ? (
        <Rect
          x={artboard.x}
          y={artboard.y}
          width={artboard.width}
          height={artboard.height}
          color="rgba(255,255,255,0.14)"
          style="stroke"
          strokeWidth={1}
        />
      ) : null}
    </Canvas>
  );
});
