import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";

const BASE = process.env.EXPO_PUBLIC_EDIT_API_URL?.trim() || "";
const SESSION_API = /^https:\/\//i.test(BASE)
  ? BASE.replace(/\/$/, "") + "/api/v1/session"
  : "/api/v1/session";

export default function WebRootLayout() {
  const [status, setStatus] = useState<"checking" | "locked" | "ready" | "unconfigured">("checking");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(SESSION_API, { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 503) return "unconfigured" as const;
        if (!response.ok) return "locked" as const;
        const data = await response.json();
        return data.authenticated ? "ready" as const : "locked" as const;
      })
      .then((next) => { if (active) setStatus(next); })
      .catch(() => { if (active) { setStatus("locked"); setError("No se pudo conectar al servidor."); } });
    return () => { active = false; };
  }, []);

  async function login() {
    if (busy || password.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(SESSION_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      setPassword("");
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "ready") {
    return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, animation: "fade" }} /></>;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <View style={styles.logo}><Text style={styles.logoText}>✦</Text></View>
        <Text style={styles.eyebrow}>EDITMYPIC · PRIVATE STUDIO</Text>
        <Text style={styles.heading}>Tu estudio, solo para ti.</Text>
        <Text style={styles.subtitle}>Acceso privado al AI Video Studio desde tu computadora.</Text>
        {status === "checking" ? <ActivityIndicator color="#e8b4f1" style={{ marginTop: 25 }} /> : (
          status === "unconfigured" ? (
            <Text style={styles.error}>Falta configurar la contraseña privada y la clave de sesión en el servidor. No se permiten generaciones hasta completarlo.</Text>
          ) : (
            <>
              <Text style={styles.label}>Contraseña privada</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Introduce tu contraseña"
                placeholderTextColor="#716b77"
                style={styles.input}
                onSubmitEditing={() => { void login(); }}
              />
              <Pressable onPress={() => { void login(); }} disabled={busy || !password} style={[styles.button, (busy || !password) && styles.disabled]}>
                <Text style={styles.buttonText}>{busy ? "Verificando..." : "Entrar al estudio  →"}</Text>
              </Pressable>
              {!!error && <Text style={styles.error}>{error}</Text>}
            </>
          )
        )}
        <Text style={styles.footer}>Protegido con sesión privada. No compartas tu contraseña.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0c0f", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 430, backgroundColor: "#18151b", borderColor: "#39303e", borderWidth: 1, borderRadius: 22, padding: 34 },
  logo: { width: 48, height: 48, borderRadius: 13, backgroundColor: "#e7b8db", alignItems: "center", justifyContent: "center", marginBottom: 27 },
  logoText: { color: "#291c2e", fontSize: 31 },
  eyebrow: { color: "#dfb6e6", fontSize: 11, letterSpacing: 2, fontWeight: "800", marginBottom: 11 },
  heading: { color: "#fff", fontSize: 29, fontWeight: "800", letterSpacing: -1 },
  subtitle: { color: "#aaa1b0", fontSize: 14, lineHeight: 22, marginTop: 11, marginBottom: 25 },
  label: { color: "#f1eaf4", fontWeight: "700", fontSize: 13, marginBottom: 10 },
  input: { backgroundColor: "#27212b", borderWidth: 1, borderColor: "#53435a", borderRadius: 12, padding: 15, color: "#fff", fontSize: 15 },
  button: { backgroundColor: "#e5b2e5", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 14 },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#271b2a", fontWeight: "800" },
  error: { color: "#ff9b9b", marginTop: 15, lineHeight: 20 },
  footer: { color: "#827988", fontSize: 11, marginTop: 27, textAlign: "center" },
});
