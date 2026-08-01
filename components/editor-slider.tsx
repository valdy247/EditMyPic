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

const THUMB_SIZE = 22;

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
  const currentValueRef = useRef(value);

  useEffect(() => {
    currentValueRef.current = value;
  }, [value]);

  const valueFromPosition = (position: number) => {
    if (trackWidth <= 0) return value;
    const ratio = clamp(position / trackWidth, 0, 1);
    return minimumValue + ratio * (maximumValue - minimumValue);
  };

  const updateFromPosition = (position: number) => {
    const next = valueFromPosition(position);
    currentValueRef.current = next;
    onValueChange(next);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => updateFromPosition(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateFromPosition(event.nativeEvent.locationX),
        onPanResponderRelease: () => onSlidingComplete(currentValueRef.current),
        onPanResponderTerminate: () => onSlidingComplete(currentValueRef.current),
      }),
    [disabled, maximumValue, minimumValue, onSlidingComplete, onValueChange, trackWidth],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    const step = (maximumValue - minimumValue) / 20;
    const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
    const next = clamp(value + step * direction, minimumValue, maximumValue);
    onValueChange(next);
    onSlidingComplete(next);
  };

  const ratio = maximumValue === minimumValue ? 0 : (value - minimumValue) / (maximumValue - minimumValue);
  const thumbPosition = clamp(ratio, 0, 1) * Math.max(0, trackWidth - THUMB_SIZE);

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
      <View style={[styles.progress, { width: clamp(ratio, 0, 1) * trackWidth }]} />
      <View style={[styles.thumb, { transform: [{ translateX: thumbPosition }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: 38,
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.35,
  },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#2b2f3a",
  },
  progress: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#8064f8",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    borderColor: "#dcd4ff",
    backgroundColor: "#7654f6",
  },
});
