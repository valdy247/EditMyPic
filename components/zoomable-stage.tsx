import * as Haptics from "expo-haptics";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PanResponder,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type PreviewTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

type Props = {
  disabled?: boolean;
  resetKey: string | number;
  style?: StyleProp<ViewStyle>;
  onCompareChange: (showOriginal: boolean) => void;
  children: (transform: PreviewTransform) => ReactNode;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_DELAY = 280;
const LONG_PRESS_DELAY = 330;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function distanceBetweenTouches(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return { x: 0, y: 0 };
  return {
    x: (touches[0].pageX + touches[1].pageX) / 2,
    y: (touches[0].pageY + touches[1].pageY) / 2,
  };
}

export function ZoomableStage({
  disabled = false,
  resetKey,
  style,
  onCompareChange,
  children,
}: Props) {
  const [transform, setTransform] = useState<PreviewTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const transformRef = useRef(transform);
  const disabledRef = useRef(disabled);
  const compareCallbackRef = useRef(onCompareChange);
  const sizeRef = useRef({ width: 1, height: 1 });
  const compareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const gestureRef = useRef({
    startScale: 1,
    startX: 0,
    startY: 0,
    startDistance: 0,
    startMidX: 0,
    startMidY: 0,
    startedAt: 0,
    moved: false,
  });

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    compareCallbackRef.current = onCompareChange;
  }, [onCompareChange]);

  const stopCompare = () => {
    if (compareTimerRef.current) {
      clearTimeout(compareTimerRef.current);
      compareTimerRef.current = null;
    }
    compareCallbackRef.current(false);
  };

  const commitTransform = (next: PreviewTransform) => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const maxX = ((scale - 1) * sizeRef.current.width) / 2;
    const maxY = ((scale - 1) * sizeRef.current.height) / 2;
    const normalized = {
      scale,
      translateX: scale <= 1 ? 0 : clamp(next.translateX, -maxX, maxX),
      translateY: scale <= 1 ? 0 : clamp(next.translateY, -maxY, maxY),
    };
    transformRef.current = normalized;
    setTransform(normalized);
  };

  useEffect(() => {
    stopCompare();
    commitTransform({ scale: 1, translateX: 0, translateY: 0 });
  }, [resetKey]);

  useEffect(
    () => () => {
      if (compareTimerRef.current) clearTimeout(compareTimerRef.current);
    },
    [],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: (event) => {
          const current = transformRef.current;
          const touchCount = event.nativeEvent.touches.length;
          const mid = midpoint(event);

          gestureRef.current = {
            startScale: current.scale,
            startX: current.translateX,
            startY: current.translateY,
            startDistance: distanceBetweenTouches(event),
            startMidX: mid.x,
            startMidY: mid.y,
            startedAt: Date.now(),
            moved: false,
          };

          if (touchCount === 1) {
            compareTimerRef.current = setTimeout(() => {
              if (!gestureRef.current.moved) {
                compareCallbackRef.current(true);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
              }
            }, LONG_PRESS_DELAY);
          }
        },
        onPanResponderMove: (event, gesture) => {
          const touchCount = event.nativeEvent.touches.length;
          const state = gestureRef.current;

          if (touchCount >= 2) {
            stopCompare();
            state.moved = true;
            const currentDistance = distanceBetweenTouches(event);
            const mid = midpoint(event);

            if (state.startDistance <= 0) {
              state.startDistance = currentDistance;
              state.startScale = transformRef.current.scale;
              state.startX = transformRef.current.translateX;
              state.startY = transformRef.current.translateY;
              state.startMidX = mid.x;
              state.startMidY = mid.y;
              return;
            }

            const nextScale =
              state.startScale * (currentDistance / state.startDistance);
            commitTransform({
              scale: nextScale,
              translateX: state.startX + (mid.x - state.startMidX),
              translateY: state.startY + (mid.y - state.startMidY),
            });
            return;
          }

          if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) {
            state.moved = true;
            stopCompare();
          }

          if (state.startScale > 1) {
            commitTransform({
              scale: state.startScale,
              translateX: state.startX + gesture.dx,
              translateY: state.startY + gesture.dy,
            });
          }
        },
        onPanResponderRelease: () => {
          const state = gestureRef.current;
          const releasedAt = Date.now();
          const wasTap = !state.moved && releasedAt - state.startedAt < 260;
          stopCompare();

          if (!wasTap) return;

          if (releasedAt - lastTapRef.current <= DOUBLE_TAP_DELAY) {
            const zoomed = transformRef.current.scale > 1.05;
            commitTransform(
              zoomed
                ? { scale: 1, translateX: 0, translateY: 0 }
                : { scale: 2.25, translateX: 0, translateY: 0 },
            );
            lastTapRef.current = 0;
            void Haptics.selectionAsync();
          } else {
            lastTapRef.current = releasedAt;
          }
        },
        onPanResponderTerminate: stopCompare,
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    sizeRef.current = {
      width: Math.max(1, event.nativeEvent.layout.width),
      height: Math.max(1, event.nativeEvent.layout.height),
    };
  };

  return (
    <View onLayout={handleLayout} style={style} {...responder.panHandlers}>
      {children(transform)}
    </View>
  );
}
