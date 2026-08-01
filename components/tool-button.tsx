import { Pressable, Text } from "react-native";

import { styles } from "@/src/editor/editor-styles";

export function ToolButton({ label, caption, disabled, onPress }: { label: string; caption: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.toolButton, disabled && styles.buttonMuted, pressed && styles.buttonPressed]}>
      <Text style={styles.toolIcon}>{label}</Text>
      <Text style={styles.toolCaption}>{caption}</Text>
    </Pressable>
  );
}
