import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from "react-native";

type Props = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onSlidingComplete: (value: number) => void;
};

const THUMB_SIZE = 24;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToStep(value: number, minimum: number, step: number) {
  if (step <= 0) return value;
  const rounded = Math.round((value - minimum) / step) * step + minimum;
  const decimals = Math.max(0, (step.toString().split(".")[1] || "").length);
  return Number(rounded.toFixed(Math.min(decimals + 1, 6)));
}

export function EditorSlider({
  value,
  minimumValue,
  maximumValue,
  step = 0.01,
  disabled = false,
  onValueChange,
  onSlidingComplete,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  const disabledRef = useRef(disabled);
  const minimumRef = useRef(minimumValue);
  const maximumRef = useRef(maximumValue);
  const stepRef = useRef(step);
  const onValueChangeRef = useRef(onValueChange);
  const onSlidingCompleteRef = useRef(onSlidingComplete);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    disabledRef.current = disabled;
    minimumRef.current = minimumValue;
    maximumRef.current = maximumValue;
    stepRef.current = step;
    onValueChangeRef.current = onValueChange;
    onSlidingCompleteRef.current = onSlidingComplete;
  }, [disabled, maximumValue, minimumValue, onSlidingComplete, onValueChange, step]);

  const valueFromPosition = useCallback((position: number) => {
    const width = trackWidthRef.current;
    const minimum = minimumRef.current;
    const maximum = maximumRef.current;
    const currentStep = stepRef.current;
    const range = maximum - minimum;

    if (width <= 0 || range <= 0) return valueRef.current;

    const usableWidth = Math.max(1, width - THUMB_SIZE);
    const ratio = clamp((position - THUMB_SIZE / 2) / usableWidth, 0, 1);
    const raw = minimum + ratio * range;

    return clamp(roundToStep(raw, minimum, currentStep), minimum, maximum);
  }, []);

  const updateFromPosition = useCallback(
    (position: number) => {
      const next = valueFromPosition(position);
      if (Math.abs(next - valueRef.current) < Number.EPSILON) return;
      valueRef.current = next;
      onValueChangeRef.current(next);
    },
    [valueFromPosition],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabledRef.current && Math.abs(gesture.dx) >= Math.abs(gesture.dy),
        onPanResponderGrant: (event) => {
          updateFromPosition(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updateFromPosition(event.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          onSlidingCompleteRef.current(valueRef.current);
        },
        onPanResponderTerminate: () => {
          onSlidingCompleteRef.current(valueRef.current);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [updateFromPosition],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;

    const range = maximumValue - minimumValue;
    const fallbackStep = range / 100;
    const effectiveStep = step > 0 ? step : fallbackStep;
    const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
    const next = clamp(
      roundToStep(valueRef.current + effectiveStep * direction, minimumValue, effectiveStep),
      minimumValue,
      maximumValue,
    );

    valueRef.current = next;
    onValueChangeRef.current(next);
    onSlidingCompleteRef.current(next);
  };

  const range = maximumValue - minimumValue;
  const ratio = range === 0 ? 0 : (value - minimumValue) / range;
  const normalized = clamp(ratio, 0, 1);
  const thumbPosition = normalized * Math.max(0, trackWidth - THUMB_SIZE);
  const progressWidth = THUMB_SIZE / 2 + normalized * Math.max(0, trackWidth - THUMB_SIZE);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityValue={{ min: minimumValue, max: maximumValue, now: value }}
      onAccessibilityAction={handleAccessibilityAction}
      onLayout={handleLayout}
      style={[styles.touchArea, disabled && styles.disabled]}
      {...panResponder.panHandlers}
    >
      <View pointerEvents="none" style={styles.track} />
      <View pointerEvents="none" style={[styles.progress, { width: progressWidth }]} />
      <View
        pointerEvents="none"
        style={[styles.thumb, { transform: [{ translateX: thumbPosition }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: 46,
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.35,
  },
  track: {
    position: "absolute",
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#2b2f3a",
  },
  progress: {
    position: "absolute",
    left: 0,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#8064f8",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    borderColor: "#ded7ff",
    backgroundColor: "#7654f6",
  },
});
