import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import {
  Canvas,
  Path,
  Rect,
  Skia,
  type SkiaView,
} from "@shopify/react-native-skia";

import type {
  EraseStroke,
  NormalizedPoint,
} from "@/src/editor/types";

type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EraseOverlayProps = {
  frame: Frame;
  strokes: EraseStroke[];
  brushSize: number;
  disabled?: boolean;
  onStrokeComplete: (stroke: EraseStroke) => void;
};

type StrokeLayerProps = {
  strokes: EraseStroke[];
  width: number;
  height: number;
  color: string;
  clear?: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizePoint(
  event: GestureResponderEvent,
  width: number,
  height: number,
): NormalizedPoint {
  return {
    x: clamp(event.nativeEvent.locationX / Math.max(1, width), 0, 1),
    y: clamp(event.nativeEvent.locationY / Math.max(1, height), 0, 1),
  };
}

function StrokeLayer({
  strokes,
  width,
  height,
  color,
  clear = false,
}: StrokeLayerProps) {
  const rendered = useMemo(
    () =>
      strokes.map((stroke, strokeIndex) => {
        if (stroke.points.length === 0) return null;
        const path = Skia.Path.Make();
        const first = stroke.points[0];
        path.moveTo(first.x * width, first.y * height);

        for (const point of stroke.points.slice(1)) {
          path.lineTo(point.x * width, point.y * height);
        }

        if (stroke.points.length === 1) {
          path.lineTo(first.x * width + 0.01, first.y * height + 0.01);
        }

        return (
          <Path
            key={`${strokeIndex}-${stroke.points.length}`}
            path={path}
            color={color}
            style="stroke"
            strokeWidth={stroke.size * Math.min(width, height)}
            strokeCap="round"
            strokeJoin="round"
            blendMode={clear ? "clear" : "srcOver"}
          />
        );
      }),
    [clear, color, height, strokes, width],
  );

  return <>{rendered}</>;
}

export function EraseOverlay({
  frame,
  strokes,
  brushSize,
  disabled = false,
  onStrokeComplete,
}: EraseOverlayProps) {
  const [activePoints, setActivePoints] = useState<NormalizedPoint[]>([]);
  const activePointsRef = useRef<NormalizedPoint[]>([]);
  const frameRef = useRef(frame);
  const brushSizeRef = useRef(brushSize);
  const disabledRef = useRef(disabled);
  const onStrokeCompleteRef = useRef(onStrokeComplete);

  useEffect(() => {
    frameRef.current = frame;
    brushSizeRef.current = brushSize;
    disabledRef.current = disabled;
    onStrokeCompleteRef.current = onStrokeComplete;
  }, [brushSize, disabled, frame, onStrokeComplete]);

  const addPoint = (event: GestureResponderEvent) => {
    const currentFrame = frameRef.current;
    const point = normalizePoint(
      event,
      currentFrame.width,
      currentFrame.height,
    );
    const points = activePointsRef.current;
    const last = points[points.length - 1];

    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.0025) {
      return;
    }

    const next = [...points, point];
    activePointsRef.current = next;
    setActivePoints(next);
  };

  const finish = () => {
    const points = activePointsRef.current;
    if (points.length > 0) {
      onStrokeCompleteRef.current({
        points: [...points],
        size: brushSizeRef.current,
      });
    }
    activePointsRef.current = [];
    setActivePoints([]);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: addPoint,
        onPanResponderMove: addPoint,
        onPanResponderRelease: finish,
        onPanResponderTerminate: finish,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [],
  );

  const visibleStrokes =
    activePoints.length > 0
      ? [...strokes, { points: activePoints, size: brushSize }]
      : strokes;

  return (
    <View
      style={[
        styles.overlay,
        {
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <StrokeLayer
          strokes={visibleStrokes}
          width={frame.width}
          height={frame.height}
          color="rgba(255,92,122,0.68)"
        />
      </Canvas>
      <View pointerEvents="none" style={styles.border} />
    </View>
  );
}

export const EraseMaskCanvas = forwardRef<SkiaView, {
  strokes: EraseStroke[];
  width: number;
  height: number;
}>(function EraseMaskCanvas({ strokes, width, height }, ref) {
  return (
    <Canvas ref={ref} style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} color="black" />
      <StrokeLayer
        strokes={strokes}
        width={width}
        height={height}
        color="white"
        clear
      />
    </Canvas>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 4,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,116,143,0.7)",
  },
});
