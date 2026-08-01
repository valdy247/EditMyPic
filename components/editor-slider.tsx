import { useEffect, useMemo, useRef, useState } from "react";
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
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onSlidingComplete: (value: number) => void;
};

const THUMB_SIZE = 24;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function EditorSlider({
  value,
  minimumValue,
  maximumValue,
  disabled = false,
  onValueChange,
  onSlidingComplete,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const valueRef = useRef(value);
  const startValueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const range = maximumValue - minimumValue;

  const valueFromAbsolutePosition = (position: number) => {
    if (trackWidth <= 0 || range <= 0) return valueRef.current;
    const usableWidth = Math.max(1, trackWidth - THUMB_SIZE);
    const ratio = clamp((position - THUMB_SIZE / 2) / usableWidth, 0, 1);
    return minimumValue + ratio * range;
  };

  const updateValue = (next: number) => {
    const clamped = clamp(next, minimumValue, maximumValue);
    valueRef.current = clamped;
    onValueChange(clamped);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabled && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event) => {
          startValueRef.current = valueRef.current;
          updateValue(valueFromAbsolutePosition(event.nativeEvent.locationX));
        },
        onPanResponderMove: (_, gesture) => {
          if (trackWidth <= 0 || range <= 0) return;
          const usableWidth = Math.max(1, trackWidth - THUMB_SIZE);
          updateValue(startValueRef.current + (gesture.dx / usableWidth) * range);
        },
        onPanResponderRelease: () => onSlidingComplete(valueRef.current),
        onPanResponderTerminate: () => onSlidingComplete(valueRef.current),
        onPanResponderTerminationRequest: () => false,
      }),
    [disabled, maximumValue, minimumValue, onSlidingComplete, onValueChange, range, trackWidth],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    const step = range / 20;
    const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
    const next = clamp(valueRef.current + step * direction, minimumValue, maximumValue);
    updateValue(next);
    onSlidingComplete(next);
  };

  const ratio = range === 0 ? 0 : (value - minimumValue) / range;
  const normalized = clamp(ratio, 0, 1);
  const thumbPosition = normalized * Math.max(0, trackWidth - THUMB_SIZE);

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
      <View style={styles.track} />
      <View style={[styles.progress, { width: THUMB_SIZE / 2 + normalized * Math.max(0, trackWidth - THUMB_SIZE) }]} />
      <View style={[styles.thumb, { transform: [{ translateX: thumbPosition }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: 48,
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
