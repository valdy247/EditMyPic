import React, { createContext, useContext, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type PrivateSession = {
  token: string;
  login: (password: string) => Promise<void>;
  logout: () => void;
  busy: boolean;
  error: string;
};

const SessionContext = createContext<PrivateSession | null>(null);
const configuredBase = process.env.EXPO_PUBLIC_EDIT_API_URL?.trim() || "";
const SESSION_API = /^https:\/\//i.test(configuredBase)
  ? configuredBase.replace(/\/$/, "") + "/api/v1/session"
  : "/api/v1/session";

export function PrivateSessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(password: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(SESSION_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-EditMyPic-Client": "native" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.token !== "string") {
        throw new Error(data.error || "No se pudo iniciar sesión.");
      }
      setToken(data.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setToken("");
    setError("");
  }

  return <SessionContext.Provider value={{ token, login, logout, busy, error }}>{children}</SessionContext.Provider>;
}

export function usePrivateSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("PrivateSessionProvider is missing");
  return context;
}

export function PrivateLogin({ title = "AI Video Studio" }: { title?: string }) {
  const { login, busy, error } = usePrivateSession();
  const [password, setPassword] = useState("");

  return (
    <View style={styles.screen}>
      <Text style={styles.logo}>✦ EditMyPic</Text>
      <Text style={styles.eyebrow}>ACCESO PRIVADO</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Introduce tu contraseña privada para usar las herramientas de IA. El editor de fotos sin IA sigue disponible sin iniciar sesión.</Text>
      <TextInput
        style={styles.input}
        placeholder="Contraseña privada"
        placeholderTextColor="#9d90a2"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => { void login(password).then(() => setPassword("")); }}
      />
      <Pressable style={[styles.button, (!password || busy) && styles.disabled]} disabled={!password || busy} onPress={() => { void login(password).then(() => setPassword("")); }}>
        <Text style={styles.buttonText}>{busy ? "Verificando..." : "Entrar al estudio"}</Text>
      </Pressable>
      {busy && <ActivityIndicator color="#e5b2e5" style={{ marginTop: 15 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.note}>La sesión se mantiene mientras la app siga abierta. No guardamos tu contraseña en el dispositivo.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, paddingTop: 60, backgroundColor: "#130d1c", flex: 1 },
  logo: { color: "#f4c5e9", fontSize: 23, fontWeight: "800", marginBottom: 38 },
  eyebrow: { color: "#d99ed3", fontSize: 12, letterSpacing: 2, fontWeight: "800", marginBottom: 10 },
  title: { color: "#fff", fontSize: 31, fontWeight: "800", marginBottom: 14 },
  subtitle: { color: "#bcb0c4", fontSize: 14, lineHeight: 22, marginBottom: 30 },
  input: { borderColor: "#65516d", borderWidth: 1, backgroundColor: "#281e30", borderRadius: 13, color: "#fff", padding: 16, fontSize: 16 },
  button: { marginTop: 15, padding: 17, backgroundColor: "#e5b2e5", borderRadius: 12, alignItems: "center" },
  disabled: { opacity: .5 },
  buttonText: { color: "#26182b", fontWeight: "800" },
  error: { color: "#ff9b9b", marginTop: 15 },
  note: { color: "#97899d", fontSize: 12, lineHeight: 19, marginTop: 25 },
});
