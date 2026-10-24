
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";

const configuredBase =
  process.env.EXPO_PUBLIC_EDIT_API_URL?.trim() || "";

const API = /^https:\/\//i.test(configuredBase)
  ? configuredBase.replace(/\/$/, "") + "/api/v1/video"
  : "/api/v1/video";

type Job = {
  id: string;
  status: string;
  output?: string[];
  failure?: string;
};

async function saveVideoToPhotos(url: string) {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);

    if (!permission.granted) {
      Alert.alert("Permiso necesario", "Permite guardar videos en Fotos.");
      return;
    }

    const destination = new File(
      Paths.cache,
      `editmypic-${Date.now()}.mp4`
    );

    const downloaded = await File.downloadFileAsync(url, destination);
    await MediaLibrary.saveToLibraryAsync(downloaded.uri);

    Alert.alert("Video guardado", "Encontraras tu video en Fotos.");
  } catch {
    Alert.alert("Error", "No se pudo descargar el video.");
  }
}
function VideoPreview({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      <VideoView
        player={player}
        nativeControls
        style={{
          width: "100%",
          aspectRatio: 9 / 16,
          maxHeight: 430,
          borderRadius: 16,
          backgroundColor: "#000",
        }}
      />
      <TouchableOpacity
        style={s.button}
        onPress={() => player.play()}
      >
        <Text style={s.buttonText}>Reproducir video</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.button}
        onPress={() => saveVideoToPhotos(url)}
      >
        <Text style={s.buttonText}>Guardar en Fotos</Text>
      </TouchableOpacity>
    </View>
  );
}
export default function VideoStudio() {
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [ratio, setRatio] = useState("1280:720");
  const [duration, setDuration] = useState(5);
  const [videoModel, setVideoModel] = useState<"gen4.5" | "kling">("gen4.5");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");

  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    async function restoreVideo() {
      try {
        const saved = await AsyncStorage.getItem("editmypic:last-video-job");
        if (saved) {
          const previous = JSON.parse(saved) as Job;
          if (previous?.id) setJob(previous);
        }
      } catch {
        console.warn("Could not restore video history");
      } finally {
        setHistoryLoaded(true);
      }
    }
    restoreVideo();
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    if (job) {
      AsyncStorage.setItem("editmypic:last-video-job", JSON.stringify(job))
        .catch(() => console.warn("Could not save video job"));
    } else {
      AsyncStorage.removeItem("editmypic:last-video-job")
        .catch(() => console.warn("Could not clear video job"));
    }
  }, [job, historyLoaded]);

  useEffect(() => {
    if (!job?.id || ["SUCCEEDED", "FAILED", "CANCELED"].includes(job.status)) {
      return;
    }

    let active = true;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(
          API + "?id=" + encodeURIComponent(job.id)
        );

        if (!response.ok) return;

        const data = await response.json();

        if (active) {
          setJob((previous) =>
            previous?.id === job.id
              ? {
                  ...previous,
                  status: data.status,
                  output: data.output,
                  failure: data.failure,
                }
              : previous
          );
        }
      } catch {
        console.warn("Video status update failed");
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  async function selectPhoto() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permiso necesario",
          "Permite el acceso a tus fotos para seleccionar una imagen."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        setError("No se pudo leer la fotografÃ­a.");
        return;
      }

      const mime = asset.base64.startsWith("/9j/") ? "image/jpeg" : asset.base64.startsWith("iVBOR") ? "image/png" : asset.base64.startsWith("UklGR") ? "image/webp" : "";

      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
        setError("Selecciona una fotografÃ­a JPEG, PNG o WebP.");
        return;
      }

      const dataUri = `data:${mime};base64,${asset.base64}`;

      if (dataUri.length > 4_200_000) {
        setError(
          "La fotografÃ­a es demasiado grande. Prueba con otra imagen."
        );
        return;
      }

      setImageUrl(dataUri);
      setPreview(asset.uri);
      setError("");
    } catch {
      setError("No se pudo abrir la galerÃ­a de fotos.");
    }
  }

  async function generate() {
    setBusy(true);
    setError("");
    setJob(null);

    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode,
          imageUrl,
          ratio,
          duration,
          videoModel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo generar.");
      }

      setJob({ id: data.id, status: "PENDING" });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error de conexiÃ³n"
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!job) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        API + "?id=" + encodeURIComponent(job.id)
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo consultar el video."
        );
      }

      setJob({
        id: job.id,
        status: data.status,
        output: data.output,
        failure: data.failure,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error de conexiÃ³n"
      );
    } finally {
      setBusy(false);
    }
  }

  const ready =
    prompt.trim().length >= 3 &&
    (mode === "text" || imageUrl.length > 0);

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
    >
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={s.link}>â† Volver al editor</Text>
      </TouchableOpacity>

      <Text style={s.heading}>AI Video Studio</Text>
      <Text style={s.sub}>
        Convierte tus ideas y fotografÃ­as en videos con Runway.
      </Text>

      <View style={s.row}>
        {(["text", "image"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[s.chip, mode === m && s.active]}
            onPress={() => setMode(m)}
          >
            <Text style={s.white}>
              {m === "text"
                ? "Texto a video"
                : "Imagen a video"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={s.button}
        onPress={() => router.push("/characters")}
      >
        <Text style={s.buttonText}>🎭 Biblioteca de personajes</Text>
      </TouchableOpacity>
      <Text style={s.label}>Motor de video</Text>
      <View style={s.row}>
        {(["gen4.5", "kling"] as const).map((model) => (
          <TouchableOpacity
            key={model}
            style={[s.chip, videoModel === model && s.active]}
            onPress={() => setVideoModel(model)}
          >
            <Text style={s.white}>
              {model === "gen4.5" ? "Runway Gen-4.5" : "Kling 3.0 Pro + audio"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>Describe el video</Text>

      <TextInput
        style={[s.input, s.multiline]}
        multiline
        placeholder="Una fresa animada camina por una ciudad futurista..."
        placeholderTextColor="#8891a4"
        value={prompt}
        onChangeText={setPrompt}
        maxLength={1000}
      />

      <Text style={s.note}>{prompt.length}/1000 caracteres</Text>

      {mode === "image" && (
        <>
          <Text style={s.label}>FotografÃ­a de referencia</Text>

          <TouchableOpacity
            style={s.button}
            onPress={selectPhoto}
            disabled={busy}
          >
            <Text style={s.buttonText}>
              ðŸ“· Seleccionar foto del iPhone
            </Text>
          </TouchableOpacity>

          {!!preview && (
            <Image
              source={{ uri: preview }}
              style={s.preview}
              resizeMode="contain"
            />
          )}

          <Text style={s.note}>
            Selecciona una fotografÃ­a para animarla con IA.
          </Text>
        </>
      )}

      <Text style={s.label}>Formato</Text>

      <View style={s.row}>
        {["1280:720", "720:1280"].map((r) => (
          <TouchableOpacity
            key={r}
            style={[s.chip, ratio === r && s.active]}
            onPress={() => setRatio(r)}
          >
            <Text style={s.white}>
              {r === "1280:720"
                ? "Horizontal 16:9"
                : "Vertical 9:16"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>DuraciÃ³n</Text>

      <View style={s.row}>
        {[5, 10].map((n) => (
          <TouchableOpacity
            key={n}
            style={[s.chip, duration === n && s.active]}
            onPress={() => setDuration(n)}
          >
            <Text style={s.white}>
              {n} segundos
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.note}>
        Runway cobra por generaciÃ³n. Comprueba los crÃ©ditos
        disponibles antes de generar videos.
      </Text>

      <TouchableOpacity
        disabled={!ready || busy}
        style={[
          s.button,
          (!ready || busy) && s.disabled,
        ]}
        onPress={generate}
      >
        <Text style={s.buttonText}>
          {busy ? "Procesando..." : "Generar video"}
        </Text>
      </TouchableOpacity>

      {busy && (
        <ActivityIndicator
          color="#9a83ff"
          style={{ marginTop: 16 }}
        />
      )}

      {!!error && <Text style={s.error}>{error}</Text>}

      {job && (
        <View style={s.panel}>
          <Text style={s.label}>
            Estado: {job.status}
          </Text>

          <Text style={s.note}>ID: {job.id}</Text>

          {!["SUCCEEDED", "FAILED", "CANCELED"].includes(
            job.status
          ) && (
            <TouchableOpacity
              style={s.chip}
              onPress={refresh}
              disabled={busy}
            >
              <Text style={s.white}>
                Actualizar estado
              </Text>
            </TouchableOpacity>
          )}

          {job.status === "SUCCEEDED" &&
            job.output?.map((url, i) => (
              <View key={i}>
  <VideoPreview url={url} />
  <TouchableOpacity
    style={s.button}
    onPress={() => Linking.openURL(url)}
  >
    <Text style={s.buttonText}>Abrir video original</Text>
  </TouchableOpacity>
</View>
            ))}

          {!!job.failure && (
            <Text style={s.error}>
              La generaciÃ³n fallÃ³. Revisa el prompt
              o los crÃ©ditos de Runway.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#130d1c",
  },
  content: {
    padding: 24,
    paddingTop: 55,
    paddingBottom: 70,
    gap: 13,
  },
  heading: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
  },
  sub: {
    fontSize: 15,
    color: "#b5bed2",
  },
  link: {
    color: "#b8a7ff",
    fontSize: 15,
  },
  label: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#251a30",
    borderWidth: 1,
    borderColor: "#333c56",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
    fontSize: 15,
  },
  multiline: {
    minHeight: 200,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: "#38263f",
  },
  active: {
    backgroundColor: "#b84f97",
  },
  white: {
    color: "#fff",
    fontWeight: "600",
  },
  note: {
    color: "#a8b1c5",
    fontSize: 12,
    lineHeight: 19,
  },
  button: {
    backgroundColor: "#e5689b",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 10,
  },
  disabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
  },
  error: {
    color: "#ff8b9b",
    marginTop: 10,
  },
  preview: {
    width: "100%",
    height: 260,
    borderRadius: 14,
    backgroundColor: "#151c2c",
    marginTop: 8,
  },
  panel: {
    backgroundColor: "#151c2c",
    padding: 18,
    borderRadius: 16,
    marginTop: 16,
    gap: 12,
  },
});











