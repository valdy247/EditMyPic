import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PrivateSessionProvider } from "@/src/auth/native-session";

export default function RootLayout() {
  return (
    <PrivateSessionProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </PrivateSessionProvider>
  );
}
