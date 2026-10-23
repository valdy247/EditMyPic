import { View, Text } from "react-native";

export default function WebHome() {
  return (
    <View style={{ flex: 1, padding: 40, backgroundColor: "#0a0d18" }}>
      <Text style={{ color: "white", fontSize: 24 }}>
        EditMyPic API
      </Text>
      <Text style={{ color: "white", marginTop: 12 }}>
        Servidor de generación de videos.
      </Text>
    </View>
  );
}