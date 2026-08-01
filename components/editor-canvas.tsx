import { forwardRef, useMemo } from "react";
import {
  Blur,
  Canvas,
  ColorMatrix,
  CubicSampling,
  FractalNoise,
  Group,
  Image,
  LinearGradient,
  Mask,
  RadialGradient,
  Rect,
  rect,
  type SkiaView,
  useImage,
  vec,
} from "@shopify/react-native-skia";
import type { StyleProp, ViewStyle } from "react-native";

import { buildColorMatrix, getOverlayEffects } from "@/src/editor/color-matrix";
import {
  fitAspectWithin,
  getCropAspect,
  getRotatedSourceSize,
} from "@/src/editor/geometry";
import type { EditorSettings, ImageAsset } from "@/src/editor/types";

type Props = {
  asset: ImageAsset;
  settings: EditorSettings;
  width: number;
  height: number;
  previewPadding?: number;
  style?: StyleProp<ViewStyle>;
};

type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function TransparencyGrid({ frame }: { frame: Frame }) {
  const size = Math.max(12, Math.min(26, Math.min(frame.width, frame.height) / 13));
  const columns = Math.ceil(frame.width / size);
  const rows = Math.ceil(frame.height / size);

  return (
    <Group clip={rect(frame.x, frame.y, frame.width, frame.height)}>
      <Rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        color="#e7e8ec"
      />
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        if ((column + row) % 2 === 0) return null;
        return (
          <Rect
            key={`${column}-${row}`}
            x={frame.x + column * size}
            y={frame.y + row * size}
            width={size}
            height={size}
            color="#cfd1d7"
          />
        );
      })}
    </Group>
  );
}

export const EditorCanvas = forwardRef<SkiaView, Props>(function EditorCanvas(
  { asset, settings, width, height, previewPadding = 0, style },
  ref,
) {
  const image = useImage(asset.uri);
  const foregroundMask = useImage(settings.foregroundMaskUri ?? null);
  const backgroundImage = useImage(settings.backgroundImageUri ?? null);
  const matrix = useMemo(() => buildColorMatrix(settings), [settings]);
  const overlay = useMemo(() => getOverlayEffects(settings), [settings]);

  const geometry = useMemo(() => {
    const aspect = getCropAspect(settings, asset);
    const frame = fitAspectWithin(width, height, aspect, previewPadding);
    const rotated = getRotatedSourceSize(asset, settings.rotation);
    const perspectiveAmount =
      Math.abs(settings.perspectiveX) + Math.abs(settings.perspectiveY);
    const straightenOverscan = Math.abs(settings.straighten) / 45;
    const overscan = 1 + perspectiveAmount * 0.09 + straightenOverscan * 0.12;
    const baseScale = Math.max(
      frame.width / Math.max(1, rotated.width),
      frame.height / Math.max(1, rotated.height),
    );
    const scale = baseScale * settings.zoom * overscan;
    const rotatedDrawWidth = rotated.width * scale;
    const rotatedDrawHeight = rotated.height * scale;
    const maxPanX = Math.max(0, (rotatedDrawWidth - frame.width) / 2);
    const maxPanY = Math.max(0, (rotatedDrawHeight - frame.height) / 2);
    const centerX = frame.x + frame.width / 2 + settings.offsetX * maxPanX;
    const centerY = frame.y + frame.height / 2 + settings.offsetY * maxPanY;

    return {
      frame,
      centerX,
      centerY,
      drawWidth: asset.width * scale,
      drawHeight: asset.height * scale,
      radians: ((settings.rotation + settings.straighten) * Math.PI) / 180,
      skewX: settings.perspectiveX * 0.12,
      skewY: settings.perspectiveY * 0.12,
    };
  }, [
    asset,
    height,
    previewPadding,
    settings.cropPreset,
    settings.freeAspect,
    settings.offsetX,
    settings.offsetY,
    settings.perspectiveX,
    settings.perspectiveY,
    settings.rotation,
    settings.straighten,
    settings.zoom,
    width,
  ]);

  if (!image || width <= 0 || height <= 0) return null;

  const clip = rect(
    geometry.frame.x,
    geometry.frame.y,
    geometry.frame.width,
    geometry.frame.height,
  );
  const imageX = geometry.centerX - geometry.drawWidth / 2;
  const imageY = geometry.centerY - geometry.drawHeight / 2;
  const sourceTransform = [
    { rotate: geometry.radians },
    { skewX: geometry.skewX },
    { skewY: geometry.skewY },
    { scaleX: settings.flipX ? -1 : 1 },
    { scaleY: settings.flipY ? -1 : 1 },
  ];
  const hasForegroundMask = Boolean(settings.foregroundMaskUri && foregroundMask);
  const replacesBackground =
    hasForegroundMask && settings.backgroundMode !== "original";
  const isPreview = previewPadding > 0;

  const transformedSource = (
    <Group
      origin={{ x: geometry.centerX, y: geometry.centerY }}
      transform={sourceTransform}
    >
      <Image
        image={image}
        x={imageX}
        y={imageY}
        width={geometry.drawWidth}
        height={geometry.drawHeight}
        fit="fill"
        sampling={CubicSampling}
      >
        <ColorMatrix matrix={matrix} />
      </Image>
    </Group>
  );

  const transformedMask = foregroundMask ? (
    <Group
      origin={{ x: geometry.centerX, y: geometry.centerY }}
      transform={sourceTransform}
    >
      <Image
        image={foregroundMask}
        x={imageX}
        y={imageY}
        width={geometry.drawWidth}
        height={geometry.drawHeight}
        fit="fill"
        sampling={CubicSampling}
      >
        {settings.maskFeather > 0 ? (
          <Blur blur={settings.maskFeather * 8} mode="clamp" />
        ) : null}
      </Image>
    </Group>
  ) : null;

  const replacementBackground = (() => {
    switch (settings.backgroundMode) {
      case "transparent":
        return isPreview ? <TransparencyGrid frame={geometry.frame} /> : null;
      case "solid":
        return (
          <Rect
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
            color={settings.backgroundColor}
          />
        );
      case "gradient":
        return (
          <Rect
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
          >
            <LinearGradient
              start={vec(geometry.frame.x, geometry.frame.y)}
              end={vec(
                geometry.frame.x + geometry.frame.width,
                geometry.frame.y + geometry.frame.height,
              )}
              colors={[
                settings.backgroundColor,
                settings.backgroundColorSecondary,
              ]}
            />
          </Rect>
        );
      case "photo":
        return backgroundImage ? (
          <Image
            image={backgroundImage}
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
            fit="cover"
            sampling={CubicSampling}
          />
        ) : (
          <Rect
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
            color={settings.backgroundColor}
          />
        );
      case "blur":
        return (
          <Group
            origin={{ x: geometry.centerX, y: geometry.centerY }}
            transform={sourceTransform}
          >
            <Image
              image={image}
              x={imageX}
              y={imageY}
              width={geometry.drawWidth}
              height={geometry.drawHeight}
              fit="fill"
              sampling={CubicSampling}
            >
              <Blur blur={2 + settings.backgroundBlur * 22} mode="clamp">
                <ColorMatrix matrix={matrix} />
              </Blur>
            </Image>
          </Group>
        );
      case "original":
      default:
        return null;
    }
  })();

  return (
    <Canvas ref={ref} style={[{ width, height }, style]}>
      <Group clip={clip}>
        {replacesBackground ? (
          replacementBackground
        ) : (
          <Rect
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
            color="#090a0d"
          />
        )}

        {replacesBackground && transformedMask ? (
          <>
            {settings.subjectShadow > 0 ? (
              <Mask
                mode="luminance"
                mask={
                  <Group
                    transform={[
                      { translateX: geometry.frame.width * 0.012 },
                      { translateY: geometry.frame.height * 0.018 },
                    ]}
                  >
                    {transformedMask}
                  </Group>
                }
              >
                <Rect
                  x={geometry.frame.x}
                  y={geometry.frame.y}
                  width={geometry.frame.width}
                  height={geometry.frame.height}
                  color="rgba(0,0,0,1)"
                  opacity={settings.subjectShadow * 0.52}
                >
                  <Blur blur={3 + settings.subjectShadow * 15} />
                </Rect>
              </Mask>
            ) : null}
            <Mask mode="luminance" mask={transformedMask}>
              {transformedSource}
            </Mask>
          </>
        ) : (
          transformedSource
        )}

        {overlay.vignette > 0 ? (
          <Rect
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
            opacity={overlay.vignette * 0.84}
            blendMode="multiply"
          >
            <RadialGradient
              c={vec(
                geometry.frame.x + geometry.frame.width / 2,
                geometry.frame.y + geometry.frame.height / 2,
              )}
              r={Math.max(geometry.frame.width, geometry.frame.height) * 0.72}
              colors={[
                "rgba(255,255,255,1)",
                "rgba(245,245,245,0.96)",
                "rgba(0,0,0,1)",
              ]}
              positions={[0, 0.55, 1]}
            />
          </Rect>
        ) : null}

        {overlay.grain > 0 ? (
          <Rect
            x={geometry.frame.x}
            y={geometry.frame.y}
            width={geometry.frame.width}
            height={geometry.frame.height}
            opacity={overlay.grain * 0.16}
            blendMode="overlay"
          >
            <FractalNoise
              freqX={0.82}
              freqY={0.82}
              octaves={2}
              seed={7}
              tileWidth={Math.max(1, geometry.frame.width)}
              tileHeight={Math.max(1, geometry.frame.height)}
            />
          </Rect>
        ) : null}
      </Group>

      {isPreview ? (
        <Rect
          x={geometry.frame.x}
          y={geometry.frame.y}
          width={geometry.frame.width}
          height={geometry.frame.height}
          color="rgba(255,255,255,0.12)"
          style="stroke"
          strokeWidth={1}
        />
      ) : null}
    </Canvas>
  );
});
