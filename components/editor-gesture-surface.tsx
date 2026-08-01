import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  PanResponder,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type ViewportTransform = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type Props = ViewportTransform & {
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onChange: (value: ViewportTransform) => void;
  onComplete: (value: ViewportTransform) => void;
};

type TouchPoint = { locationX: number; locationY: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getDistance(touches: readonly TouchPoint[]) {
  if (touches.length < 2) return 0;
  const dx = touches[1].locationX - touches[0].locationX;
  const dy = touches[1].locationY - touches[0].locationY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(touches: readonly TouchPoint[]) {
  if (touches.length < 2) return { x: 0, y: 0 };
  return {
    x: (touches[0].locationX + touches[1].locationX) / 2,
    y: (touches[0].locationY + touches[1].locationY) / 2,
  };
}

export function EditorGestureSurface({
  zoom,
  offsetX,
  offsetY,
  disabled = false,
  children,
  style,
  onChange,
  onComplete,
}: Props) {
  const layoutRef = useRef({ width: 1, height: 1 });
  const disabledRef = useRef(disabled);
  const valueRef = useRef<ViewportTransform>({ zoom, offsetX, offsetY });
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  const lastTapRef = useRef(0);
  const startRef = useRef({
    value: { zoom, offsetX, offsetY },
    distance: 0,
    midpoint: { x: 0, y: 0 },
    moved: false,
    touchCount: 0,
  });

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    valueRef.current = { zoom, offsetX, offsetY };
  }, [offsetX, offsetY, zoom]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onCompleteRef.current = onComplete;
  }, [onChange, onComplete]);

  const emit = (next: ViewportTransform) => {
    const normalized = {
      zoom: clamp(next.zoom, 1, 4),
      offsetX: clamp(next.offsetX, -1, 1),
      offsetY: clamp(next.offsetY, -1, 1),
    };
    valueRef.current = normalized;
    onChangeRef.current(normalized);
  };

  const handleGrant = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches as unknown as TouchPoint[];
    startRef.current = {
      value: { ...valueRef.current },
      distance: getDistance(touches),
      midpoint: getMidpoint(touches),
      moved: false,
      touchCount: touches.length,
    };
  };

  const handleMove = (
    event: GestureResponderEvent,
    gesture: PanResponderGestureState,
  ) => {
    const touches = event.nativeEvent.touches as unknown as TouchPoint[];
    const start = startRef.current;
    const layout = layoutRef.current;

    if (touches.length >= 2 && start.distance > 0) {
      const distance = getDistance(touches);
      const midpoint = getMidpoint(touches);
      const nextZoom = clamp(
        start.value.zoom * (distance / start.distance),
        1,
        4,
      );
      const panScaleX = Math.max(90, layout.width * 0.42);
      const panScaleY = Math.max(90, layout.height * 0.42);
      const nextOffsetX =
        start.value.offsetX + (midpoint.x - start.midpoint.x) / panScaleX;
      const nextOffsetY =
        start.value.offsetY + (midpoint.y - start.midpoint.y) / panScaleY;

      start.moved =
        start.moved ||
        Math.abs(distance - start.distance) > 2 ||
        Math.abs(midpoint.x - start.midpoint.x) > 2 ||
        Math.abs(midpoint.y - start.midpoint.y) > 2;
      emit({ zoom: nextZoom, offsetX: nextOffsetX, offsetY: nextOffsetY });
      return;
    }

    if (start.value.zoom > 1.001) {
      const panScaleX = Math.max(90, layout.width * 0.42);
      const panScaleY = Math.max(90, layout.height * 0.42);
      start.moved =
        start.moved || Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2;
      emit({
        zoom: start.value.zoom,
        offsetX: start.value.offsetX + gesture.dx / panScaleX,
        offsetY: start.value.offsetY + gesture.dy / panScaleY,
      });
    }
  };

  const finishGesture = () => {
    const start = startRef.current;

    if (!start.moved && start.touchCount === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        const reset = { zoom: 1, offsetX: 0, offsetY: 0 };
        emit(reset);
        onCompleteRef.current(reset);
        return;
      }
      lastTapRef.current = now;
    }

    onCompleteRef.current(valueRef.current);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: handleGrant,
        onPanResponderMove: handleMove,
        onPanResponderRelease: finishGesture,
        onPanResponderTerminate: finishGesture,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    layoutRef.current = {
      width: Math.max(1, event.nativeEvent.layout.width),
      height: Math.max(1, event.nativeEvent.layout.height),
    };
  };

  return (
    <View
      onLayout={handleLayout}
      style={style}
      {...panResponder.panHandlers}
    >
      {children}
    </View>
  );
}
