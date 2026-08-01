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
import { DEFAULT_SETTINGS, type EditorSettings, type ImageAsset } from "@/src/editor/types";

const MAX_EXPORT_EDGE = 4096;
type PanelTab = "adjust" | "transform" | "export";
type AdjustmentKey = "brightness" | "contrast" | "saturation" | "warmth" | "fade" | "grayscale";

type Adjustment = {
  key: AdjustmentKey;
  icon: string;
  label: string;
  minimum: number;
  maximum: number;
  format: (value: number) => string;
};

const ADJUSTMENTS: Adjustment[] = [
  { key: "brightness", icon: "☀", label: "Brillo", minimum: 0, maximum: 2, format: (value) => `${Math.round(value * 100)}%` },
  { key: "contrast", icon: "◐", label: "Contraste", minimum: 0, maximum: 2, format: (value) => `${Math.round(value * 100)}%` },
  { key: "saturation", icon: "◉", label: "Saturación", minimum: 0, maximum: 2, format: (value) => `${Math.round(value * 100)}%` },
  { key: "warmth", icon: "♨", label: "Temperatura", minimum: -1, maximum: 1, format: (value) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)}` },
  { key: "fade", icon: "◌", label: "Desvanecido", minimum: 0, maximum: 1, format: (value) => `${Math.round(value * 100)}%` },
  { key: "grayscale", icon: "◑", label: "Blanco y negro", minimum: 0, maximum: 1, format: (value) => `${Math.round(value * 100)}%` },
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
  return { width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)) };
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
  const [activeTab, setActiveTab] = useState<PanelTab>("adjust");
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const isCompact = windowWidth < 700;
  const isNarrow = windowWidth < 430;
  const displaySettings = showOriginal ? DEFAULT_SETTINGS : settings;
  const exportSize = useMemo(() => (asset ? getExportSize(asset, settings.rotation) : { width: 1, height: 1 }), [asset, settings.rotation]);

  const resetHistory = useCallback(() => {
    historyRef.current = [cloneSettings(DEFAULT_SETTINGS)];
    historyIndexRef.current = 0;
    setSettings(cloneSettings(DEFAULT_SETTINGS));
    setHistoryVersion((value) => value + 1);
  }, []);

  const commit = useCallback((next: EditorSettings) => {
    const current = historyRef.current[historyIndexRef.current];
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), cloneSettings(next)].slice(-100);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setSettings(next);
    setHistoryVersion((value) => value + 1);
  }, []);

  const updateAndCommit = useCallback((producer: (current: EditorSettings) => EditorSettings) => {
    setSettings((current) => {
      const next = producer(current);
      commit(next);
      return next;
    });
  }, [commit]);

  const usePickerResult = useCallback((result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]) return;
    const selected = result.assets[0];
    setAsset({ uri: selected.uri, width: selected.width, height: selected.height, fileName: getFileName(selected.fileName) });
    resetHistory();
    setPanelExpanded(true);
  }, [resetHistory]);

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permiso necesario", "Permite acceso a Fotos para elegir una imagen.");
    usePickerResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 }));
  }, [usePickerResult]);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permiso necesario", "Permite acceso a la cámara para tomar una fotografía.");
    usePickerResult(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 }));
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
      if (!(await Sharing.isAvailableAsync())) throw new Error("El menú Compartir no está disponible.");
      await Sharing.shareAsync(output.uri, { UTI: "public.png" });
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2200);
    } catch (error) {
      Alert.alert("No se pudo exportar", error instanceof Error ? error.message : "Inténtalo nuevamente.");
    } finally {
      setExporting(false);
    }
  }, [asset, exporting, exportCanvasRef]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width: Math.max(1, width), height: Math.max(1, height) });
  }, []);

  const reset = useCallback(() => commit(cloneSettings(DEFAULT_SETTINGS)), [commit]);

  const renderPanelContent = () => {
    if (activeTab === "transform") {
      return (
        <View style={styles.transformGrid}>
          <ToolButton label="↺" caption="Izquierda" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation - 90 }))} />
          <ToolButton label="↻" caption="Derecha" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation + 90 }))} />
          <ToolButton label="↔" caption="Voltear H" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, flipX: !current.flipX }))} />
          <ToolButton label="↕" caption="Voltear V" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, flipY: !current.flipY }))} />
        </View>
      );
    }

    if (activeTab === "export") {
      return (
        <View style={styles.exportCard}>
          <Text style={styles.exportTitle}>Exportación de alta calidad</Text>
          <Text style={styles.exportCopy}>PNG · hasta 4096 px · conserva todos los ajustes aplicados.</Text>
          <Text style={styles.exportMeta}>{asset ? `${exportSize.width} × ${exportSize.height} px` : "Selecciona una foto"}</Text>
          <Pressable disabled={!asset || exporting} onPress={() => void exportImage()} style={({ pressed }) => [styles.exportButton, (!asset || exporting) && styles.buttonMuted, pressed && styles.buttonPressed]}>
            {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.exportButtonText}>Guardar y compartir</Text>}
          </Pressable>
        </View>
      );
    }

    return ADJUSTMENTS.map((adjustment) => (
      <View key={adjustment.key} style={styles.adjustment}>
        <View style={styles.adjustmentHeader}>
          <View style={styles.adjustmentName}><Text style={styles.adjustmentIcon}>{adjustment.icon}</Text><Text style={styles.adjustmentLabel}>{adjustment.label}</Text></View>
          <Text style={styles.adjustmentValue}>{adjustment.format(settings[adjustment.key])}</Text>
        </View>
        <EditorSlider
          disabled={!asset}
          minimumValue={adjustment.minimum}
          maximumValue={adjustment.maximum}
          value={settings[adjustment.key]}
          onValueChange={(value) => setSettings((current) => ({ ...current, [adjustment.key]: value }))}
          onSlidingComplete={(value) => setSettings((current) => {
            const next = { ...current, [adjustment.key]: value };
            commit(next);
            return next;
          })}
        />
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandLetter}>E</Text></View>
            {!isNarrow && <Text style={styles.brand}>EditMyPic</Text>}
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={!canUndo} onPress={undo} style={({ pressed }) => [styles.iconButton, (!canUndo || pressed) && styles.buttonMuted]}><Text style={styles.iconText}>↶</Text></Pressable>
            <Pressable disabled={!canRedo} onPress={redo} style={({ pressed }) => [styles.iconButton, (!canRedo || pressed) && styles.buttonMuted]}><Text style={styles.iconText}>↷</Text></Pressable>
            <Pressable onPress={openPhotoMenu} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}><Text style={styles.secondaryButtonText}>Foto</Text></Pressable>
            <Pressable disabled={!asset || exporting} onPress={() => void exportImage()} style={({ pressed }) => [styles.primaryButton, (!asset || exporting) && styles.buttonMuted, pressed && styles.buttonPressed]}>
              {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryButtonText}>Guardar</Text>}
            </Pressable>
          </View>
        </View>

        <View style={[styles.workspace, isCompact && styles.workspaceCompact]}>
          <View style={styles.editorColumn}>
            <Pressable
              onLayout={handleCanvasLayout}
              onPressIn={() => asset && setShowOriginal(true)}
              onPressOut={() => setShowOriginal(false)}
              style={({ pressed }) => [styles.canvasStage, pressed && asset && styles.canvasPressed]}
            >
              {asset ? (
                <>
                  <EditorCanvas asset={asset} settings={displaySettings} width={canvasSize.width} height={canvasSize.height} />
                  <View pointerEvents="none" style={styles.compareBadge}><Text style={styles.compareText}>{showOriginal ? "ORIGINAL" : "MANTÉN PARA VER ORIGINAL"}</Text></View>
                </>
              ) : (
                <Pressable onPress={openPhotoMenu} style={styles.emptyState}>
                  <View style={styles.uploadCircle}><Text style={styles.uploadIcon}>＋</Text></View>
                  <Text style={styles.emptyTitle}>Elige una fotografía</Text>
                  <Text style={styles.emptyCopy}>Edita en tu iPhone con calidad y privacidad.</Text>
                </Pressable>
              )}
            </Pressable>
          </View>

          <View style={[styles.inspector, isCompact && styles.inspectorCompact, !panelExpanded && styles.inspectorCollapsed]}>
            <Pressable onPress={() => setPanelExpanded((value) => !value)} style={styles.sheetHandleArea}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetHint}>{panelExpanded ? "Ocultar herramientas" : "Mostrar herramientas"}</Text>
            </Pressable>

            <View style={styles.tabBar}>
              {([['adjust', 'Ajustes'], ['transform', 'Transformar'], ['export', 'Exportar']] as [PanelTab, string][]).map(([key, label]) => (
                <Pressable key={key} onPress={() => { setActiveTab(key); setPanelExpanded(true); }} style={[styles.tabButton, activeTab === key && styles.tabButtonActive]}>
                  <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {panelExpanded && (
              <ScrollView style={styles.panelScroll} contentContainerStyle={styles.inspectorContent} showsVerticalScrollIndicator={false}>
                <View style={styles.panelHeader}>
                  <View><Text style={styles.eyebrow}>EDICIÓN PROFESIONAL</Text><Text style={styles.panelTitle}>{activeTab === "adjust" ? "Ajustes" : activeTab === "transform" ? "Transformar" : "Exportar"}</Text></View>
                  {activeTab === "adjust" && <Pressable disabled={!asset} onPress={reset}><Text style={[styles.resetText, !asset && styles.textMuted]}>Restablecer</Text></Pressable>}
                </View>
                {renderPanelContent()}
                <Text style={styles.historyMeta}>Historial · {historyVersion + 1} estados</Text>
              </ScrollView>
            )}
          </View>
        </View>

        {savedMessage && <View style={styles.toast}><Text style={styles.toastText}>✓ Imagen lista para guardar o compartir</Text></View>}

        {asset && (
          <View pointerEvents="none" style={styles.offscreenCanvas}>
            <EditorCanvas ref={exportCanvasRef} asset={asset} settings={settings} width={exportSize.width} height={exportSize.height} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
