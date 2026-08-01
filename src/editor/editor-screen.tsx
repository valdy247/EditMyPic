import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useCanvasRef } from "@shopify/react-native-skia";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EditorCanvas } from "@/components/editor-canvas";
import { EditorSlider } from "@/components/editor-slider";
import { ToolButton } from "@/components/tool-button";
import { styles } from "@/src/editor/editor-styles";
import {
  DEFAULT_SETTINGS,
  type EditorSettings,
  type ImageAsset,
} from "@/src/editor/types";

const MAX_EXPORT_EDGE = 4096;

type AdjustmentKey = "brightness" | "contrast" | "saturation" | "grayscale";

type Adjustment = {
  key: AdjustmentKey;
  label: string;
  minimum: number;
  maximum: number;
  format: (value: number) => string;
};

const ADJUSTMENTS: Adjustment[] = [
  { key: "brightness", label: "Brillo", minimum: 0, maximum: 2, format: (value) => `${Math.round(value * 100)}%` },
  { key: "contrast", label: "Contraste", minimum: 0, maximum: 2, format: (value) => `${Math.round(value * 100)}%` },
  { key: "saturation", label: "Saturación", minimum: 0, maximum: 2, format: (value) => `${Math.round(value * 100)}%` },
  { key: "grayscale", label: "Blanco y negro", minimum: 0, maximum: 1, format: (value) => `${Math.round(value * 100)}%` },
];

function cloneSettings(settings: EditorSettings): EditorSettings {
  return { ...settings };
}

function getFileName(fileName?: string | null) {
  return (fileName || "editmypic").replace(/\.[^.]+$/, "");
}

function getExportSize(asset: ImageAsset, rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360;
  const swapsDimensions = normalized === 90 || normalized === 270;
  const sourceWidth = swapsDimensions ? asset.height : asset.width;
  const sourceHeight = swapsDimensions ? asset.width : asset.height;
  const scale = Math.min(1, MAX_EXPORT_EDGE / Math.max(sourceWidth, sourceHeight));

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export default function EditorScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const exportCanvasRef = useCanvasRef();
  const historyRef = useRef<EditorSettings[]>([cloneSettings(DEFAULT_SETTINGS)]);
  const historyIndexRef = useRef(0);

  const [asset, setAsset] = useState<ImageAsset | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(cloneSettings(DEFAULT_SETTINGS));
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [exporting, setExporting] = useState(false);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const isCompact = windowWidth < 700;
  const isNarrow = windowWidth < 430;
  const exportSize = useMemo(
    () => (asset ? getExportSize(asset, settings.rotation) : { width: 1, height: 1 }),
    [asset, settings.rotation],
  );

  const resetHistory = useCallback(() => {
    historyRef.current = [cloneSettings(DEFAULT_SETTINGS)];
    historyIndexRef.current = 0;
    setSettings(cloneSettings(DEFAULT_SETTINGS));
    setHistoryVersion((value) => value + 1);
  }, []);

  const commit = useCallback((next: EditorSettings) => {
    const currentHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    currentHistory.push(cloneSettings(next));
    historyRef.current = currentHistory.slice(-50);
    historyIndexRef.current = historyRef.current.length - 1;
    setSettings(next);
    setHistoryVersion((value) => value + 1);
  }, []);

  const updateAndCommit = useCallback(
    (producer: (current: EditorSettings) => EditorSettings) => {
      commit(producer(settings));
    },
    [commit, settings],
  );

  const usePickerResult = useCallback(
    (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets[0]) return;
      const selected = result.assets[0];
      setAsset({
        uri: selected.uri,
        width: selected.width,
        height: selected.height,
        fileName: getFileName(selected.fileName),
      });
      resetHistory();
    },
    [resetHistory],
  );

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso necesario", "Permite acceso a Fotos para elegir una imagen.");
      return;
    }

    usePickerResult(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      }),
    );
  }, [usePickerResult]);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso necesario", "Permite acceso a la cámara para tomar una fotografía.");
      return;
    }

    usePickerResult(
      await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      }),
    );
  }, [usePickerResult]);

  const openPhotoMenu = useCallback(() => {
    Alert.alert("Abrir imagen", "Elige el origen de la fotografía.", [
      { text: "Fotos", onPress: () => void pickFromLibrary() },
      { text: "Cámara", onPress: () => void takePhoto() },
      { text: "Cancelar", style: "cancel" },
    ]);
  }, [pickFromLibrary, takePhoto]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    historyIndexRef.current -= 1;
    setSettings(cloneSettings(historyRef.current[historyIndexRef.current]));
    setHistoryVersion((value) => value + 1);
  }, [canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    historyIndexRef.current += 1;
    setSettings(cloneSettings(historyRef.current[historyIndexRef.current]));
    setHistoryVersion((value) => value + 1);
  }, [canRedo]);

  const exportImage = useCallback(async () => {
    if (!asset || exporting) return;
    setExporting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const snapshot = await exportCanvasRef.current?.makeImageSnapshotAsync();
      if (!snapshot) throw new Error("No se pudo generar la imagen.");

      const output = new File(Paths.cache, `${asset.fileName}-${Date.now()}.png`);
      output.write(snapshot.encodeToBytes());

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("El menú Compartir no está disponible en este dispositivo.");
      }

      await Sharing.shareAsync(output.uri, { UTI: "public.png" });
    } catch (error) {
      Alert.alert(
        "No se pudo exportar",
        error instanceof Error ? error.message : "Inténtalo nuevamente.",
      );
    } finally {
      setExporting(false);
    }
  }, [asset, exportCanvasRef, exporting]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width: Math.max(1, width), height: Math.max(1, height) });
  }, []);

  const reset = useCallback(() => {
    commit(cloneSettings(DEFAULT_SETTINGS));
  }, [commit]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandLetter}>E</Text></View>
            {!isNarrow ? (
              <View>
                <Text style={styles.brand}>EditMyPic</Text>
                <Text style={styles.subtitle}>EDITOR NATIVO</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.topActions}>
            <Pressable
              accessibilityLabel="Deshacer"
              disabled={!canUndo}
              onPress={undo}
              style={({ pressed }) => [styles.iconButton, (!canUndo || pressed) && styles.buttonMuted]}
            >
              <Text style={styles.iconText}>↶</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Rehacer"
              disabled={!canRedo}
              onPress={redo}
              style={({ pressed }) => [styles.iconButton, (!canRedo || pressed) && styles.buttonMuted]}
            >
              <Text style={styles.iconText}>↷</Text>
            </Pressable>
            <Pressable onPress={openPhotoMenu} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.secondaryButtonText}>{isNarrow ? "Foto" : asset ? "Cambiar" : "Abrir foto"}</Text>
            </Pressable>
            <Pressable
              disabled={!asset || exporting}
              onPress={() => void exportImage()}
              style={({ pressed }) => [styles.primaryButton, (!asset || exporting) && styles.buttonMuted, pressed && styles.buttonPressed]}
            >
              {exporting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>{isNarrow ? "Guardar" : "Compartir"}</Text>}
            </Pressable>
          </View>
        </View>

        <View style={[styles.workspace, isCompact && styles.workspaceCompact]}>
          <View style={styles.editorColumn}>
            <View style={styles.canvasStage} onLayout={handleCanvasLayout}>
              {asset ? (
                <EditorCanvas
                  asset={asset}
                  settings={settings}
                  width={canvasSize.width}
                  height={canvasSize.height}
                />
              ) : (
                <Pressable onPress={openPhotoMenu} style={({ pressed }) => [styles.emptyState, pressed && styles.emptyStatePressed]}>
                  <View style={styles.uploadCircle}><Text style={styles.uploadIcon}>＋</Text></View>
                  <Text style={styles.emptyTitle}>Elige una fotografía</Text>
                  <Text style={styles.emptyCopy}>Abre una imagen desde Fotos o toma una con la cámara.</Text>
                  <Text style={styles.privateCopy}>La edición ocurre dentro de tu iPhone.</Text>
                </Pressable>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
              <ToolButton label="↺" caption="Izquierda" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation - 90 }))} />
              <ToolButton label="↻" caption="Derecha" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation + 90 }))} />
              <ToolButton label="↔" caption="Voltear H" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, flipX: !current.flipX }))} />
              <ToolButton label="↕" caption="Voltear V" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, flipY: !current.flipY }))} />
            </ScrollView>
          </View>

          <ScrollView style={[styles.inspector, isCompact && styles.inspectorCompact]} contentContainerStyle={styles.inspectorContent}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.eyebrow}>PROPIEDADES</Text>
                <Text style={styles.panelTitle}>Ajustes</Text>
              </View>
              <Pressable disabled={!asset} onPress={reset}>
                <Text style={[styles.resetText, !asset && styles.textMuted]}>Restablecer</Text>
              </Pressable>
            </View>

            {ADJUSTMENTS.map((adjustment) => (
              <View key={adjustment.key} style={styles.adjustment}>
                <View style={styles.adjustmentHeader}>
                  <Text style={styles.adjustmentLabel}>{adjustment.label}</Text>
                  <Text style={styles.adjustmentValue}>{adjustment.format(settings[adjustment.key])}</Text>
                </View>
                <EditorSlider
                  disabled={!asset}
                  minimumValue={adjustment.minimum}
                  maximumValue={adjustment.maximum}
                  value={settings[adjustment.key]}
                  onValueChange={(value) => setSettings((current) => ({ ...current, [adjustment.key]: value }))}
                  onSlidingComplete={(value) => commit({ ...settings, [adjustment.key]: value })}
                />
              </View>
            ))}

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Procesamiento local</Text>
              <Text style={styles.infoCopy}>Tus fotos no se suben a un servidor para aplicar estos ajustes.</Text>
            </View>

            <View style={styles.fileCard}>
              <Text style={styles.eyebrow}>ARCHIVO</Text>
              <Text style={styles.fileName}>{asset?.fileName ?? "Sin imagen"}</Text>
              <Text style={styles.fileMeta}>{asset ? `${asset.width} × ${asset.height} px` : "Abre una foto para comenzar"}</Text>
              <Text style={styles.historyMeta}>Historial activo · {historyVersion + 1}</Text>
            </View>
          </ScrollView>
        </View>

        {asset ? (
          <View pointerEvents="none" style={styles.offscreenCanvas}>
            <EditorCanvas
              ref={exportCanvasRef}
              asset={asset}
              settings={settings}
              width={exportSize.width}
              height={exportSize.height}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
