import { File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useCanvasRef } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ZoomableStage } from "@/components/zoomable-stage";
import { getExportSize } from "@/src/editor/geometry";
import {
  FILTER_PRESETS,
  applyAutoEnhance,
  settingsFromPreset,
  type FilterPreset,
} from "@/src/editor/presets";
import { styles } from "@/src/editor/editor-styles";
import {
  ADJUSTMENT_KEYS,
  DEFAULT_SETTINGS,
  type AdjustmentKey,
  type CropRatio,
  type EditorSettings,
  type ImageAsset,
} from "@/src/editor/types";

const PROJECT_FILE_NAME = "editmypic-project.json";

type ToolSection = "light" | "color" | "detail" | "crop" | "filters" | "export";
type ExportFormat = "png" | "jpeg";
type ExportAction = "save" | "share";
type OutputScale = 1 | 0.75 | 0.5;
type ExportQuality = 1 | 0.92 | 0.8;

type Adjustment = {
  key: AdjustmentKey;
  label: string;
  icon: string;
  minimum: number;
  maximum: number;
  step: number;
  neutral: number;
  format: (value: number) => string;
};

type SavedProject = { asset: ImageAsset; settings: EditorSettings };

const signedPercent = (value: number) => {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

const LIGHT_ADJUSTMENTS: Adjustment[] = [
  { key: "exposure", label: "Exposición", icon: "◒", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "brightness", label: "Brillo", icon: "☀", minimum: 0.5, maximum: 1.5, step: 0.01, neutral: 1, format: (value) => signedPercent((value - 1) * 100) },
  { key: "contrast", label: "Contraste", icon: "◐", minimum: 0.5, maximum: 1.5, step: 0.01, neutral: 1, format: (value) => signedPercent((value - 1) * 100) },
  { key: "highlights", label: "Altas luces", icon: "◯", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "shadows", label: "Sombras", icon: "●", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "whites", label: "Blancos", icon: "◇", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "blacks", label: "Negros", icon: "◆", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
];

const COLOR_ADJUSTMENTS: Adjustment[] = [
  { key: "warmth", label: "Temperatura", icon: "♨", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "tint", label: "Matiz", icon: "◫", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "saturation", label: "Saturación", icon: "◉", minimum: 0, maximum: 2, step: 0.01, neutral: 1, format: (value) => signedPercent((value - 1) * 100) },
  { key: "vibrance", label: "Vibrancia", icon: "✦", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "fade", label: "Desvanecer", icon: "○", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
  { key: "grayscale", label: "Blanco y negro", icon: "◑", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
];

const DETAIL_ADJUSTMENTS: Adjustment[] = [
  { key: "clarity", label: "Claridad", icon: "✧", minimum: -1, maximum: 1, step: 0.01, neutral: 0, format: (value) => signedPercent(value * 100) },
  { key: "sharpness", label: "Nitidez", icon: "△", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
  { key: "vignette", label: "Viñeta", icon: "◉", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
  { key: "grain", label: "Grano", icon: "⠿", minimum: 0, maximum: 1, step: 0.01, neutral: 0, format: (value) => `${Math.round(value * 100)}` },
];

const TOOLS: { key: ToolSection; icon: string; label: string }[] = [
  { key: "light", icon: "☀", label: "Luz" },
  { key: "color", icon: "◉", label: "Color" },
  { key: "detail", icon: "✧", label: "Detalle" },
  { key: "crop", icon: "⌗", label: "Recortar" },
  { key: "filters", icon: "◇", label: "Filtros" },
  { key: "export", icon: "↑", label: "Guardar" },
];

const SECTION_COPY: Record<ToolSection, { title: string; copy: string }> = {
  light: { title: "Luz", copy: "Recupera detalle sin perder naturalidad." },
  color: { title: "Color", copy: "Ajusta el ambiente con movimientos precisos." },
  detail: { title: "Detalle", copy: "Define textura, enfoque y acabado." },
  crop: { title: "Encuadre", copy: "Elige el formato y centra lo importante." },
  filters: { title: "Looks", copy: "Estilos listos, siempre ajustables." },
  export: { title: "Exportar", copy: "Controla formato, calidad y tamaño." },
};

const CROP_RATIOS: { key: CropRatio; label: string; caption: string }[] = [
  { key: "original", label: "Original", caption: "Libre" },
  { key: "square", label: "1:1", caption: "Cuadrado" },
  { key: "portrait", label: "4:5", caption: "Post" },
  { key: "story", label: "9:16", caption: "Story" },
  { key: "landscape", label: "16:9", caption: "Panorama" },
];

function cloneSettings(settings: EditorSettings): EditorSettings { return { ...settings }; }

function neutralizeAdjustments(settings: EditorSettings): EditorSettings {
  const next = { ...settings };
  for (const key of ADJUSTMENT_KEYS) next[key] = DEFAULT_SETTINGS[key];
  return next;
}

function normalizeSettings(value?: Partial<EditorSettings>): EditorSettings {
  return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
}

function getFileName(fileName?: string | null) {
  return (fileName || "editmypic").replace(/\.[^.]+$/, "");
}

function getExtension(fileName?: string | null) {
  const match = fileName?.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || "jpg";
}

function getProjectFile() { return new File(Paths.document, PROJECT_FILE_NAME); }

async function persistSelectedImage(asset: ImagePicker.ImagePickerAsset) {
  try {
    const extension = getExtension(asset.fileName);
    const destination = new File(Paths.document, `editmypic-current.${extension}`);
    if (destination.exists) destination.delete();
    await new File(asset.uri).copy(destination);
    return destination.uri;
  } catch {
    return asset.uri;
  }
}

export default function EditorScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const exportCanvasRef = useCanvasRef();
  const initialSettings = cloneSettings(DEFAULT_SETTINGS);
  const historyRef = useRef<EditorSettings[]>([initialSettings]);
  const historyIndexRef = useRef(0);
  const settingsRef = useRef<EditorSettings>(initialSettings);
  const restoredRef = useRef(false);

  const [asset, setAsset] = useState<ImageAsset | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [activeSection, setActiveSection] = useState<ToolSection>("light");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [filterIntensity, setFilterIntensity] = useState(1);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("jpeg");
  const [exportQuality, setExportQuality] = useState<ExportQuality>(0.92);
  const [outputScale, setOutputScale] = useState<OutputScale>(1);
  const [exportingAction, setExportingAction] = useState<ExportAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [zoomResetKey, setZoomResetKey] = useState(0);

  const isPhoneLandscape = windowWidth > windowHeight && windowHeight < 520;
  const usesBottomPanel = windowWidth < 780 && !isPhoneLandscape;
  const isNarrow = windowWidth < 410;
  const effectivePanelExpanded = usesBottomPanel ? panelExpanded : true;
  const mobilePanelHeight = Math.min(480, Math.max(310, windowHeight * 0.5));
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const isExporting = exportingAction !== null;

  const displaySettings = useMemo(
    () => (showOriginal ? neutralizeAdjustments(settings) : settings),
    [settings, showOriginal],
  );

  const exportSize = useMemo(
    () => asset ? getExportSize(asset, settings, outputScale) : { width: 1, height: 1 },
    [asset, outputScale, settings],
  );

  const activePreset = useMemo(
    () => FILTER_PRESETS.find((preset) => preset.id === activePresetId) ?? null,
    [activePresetId],
  );

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2600);
  }, []);

  const applySettings = useCallback((next: EditorSettings) => {
    const cloned = cloneSettings(next);
    settingsRef.current = cloned;
    setSettings(cloned);
  }, []);

  const replaceHistory = useCallback((next: EditorSettings) => {
    const cloned = cloneSettings(next);
    historyRef.current = [cloned];
    historyIndexRef.current = 0;
    applySettings(cloned);
    setHistoryVersion((value) => value + 1);
  }, [applySettings]);

  const commit = useCallback((next: EditorSettings) => {
    const cloned = cloneSettings(next);
    const current = historyRef.current[historyIndexRef.current];
    if (JSON.stringify(current) !== JSON.stringify(cloned)) {
      const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), cloned].slice(-100);
      historyRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;
      setHistoryVersion((value) => value + 1);
    }
    applySettings(cloned);
  }, [applySettings]);

  const updateAndCommit = useCallback((producer: (current: EditorSettings) => EditorSettings) => {
    commit(producer(settingsRef.current));
  }, [commit]);

  useEffect(() => {
    let active = true;
    const restoreProject = async () => {
      try {
        const projectFile = getProjectFile();
        if (!projectFile.exists) return;
        const saved = JSON.parse(projectFile.textSync()) as Partial<SavedProject>;
        if (!saved.asset?.uri) return;
        const source = new File(saved.asset.uri);
        if (!source.exists || !active) return;
        const restoredSettings = normalizeSettings(saved.settings);
        setAsset(saved.asset as ImageAsset);
        replaceHistory(restoredSettings);
        showToast("Tu última edición volvió contigo");
      } catch {
        // A damaged draft should never block the editor.
      } finally {
        restoredRef.current = true;
      }
    };
    void restoreProject();
    return () => { active = false; };
  }, [replaceHistory, showToast]);

  useEffect(() => {
    if (!restoredRef.current || !asset) return;
    const timer = setTimeout(() => {
      try {
        const projectFile = getProjectFile();
        if (!projectFile.exists) projectFile.create();
        projectFile.write(JSON.stringify({ asset, settings } satisfies SavedProject));
      } catch {
        // Autosave is best effort; editing stays available even if storage fails.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [asset, settings]);

  const usePickerResult = useCallback(async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]) return;
    const selected = result.assets[0];
    const persistentUri = await persistSelectedImage(selected);
    const nextAsset: ImageAsset = { uri: persistentUri, width: selected.width, height: selected.height, fileName: getFileName(selected.fileName) };
    setAsset(nextAsset);
    replaceHistory(cloneSettings(DEFAULT_SETTINGS));
    setActiveSection("light");
    setActivePresetId(null);
    setFilterIntensity(1);
    setPanelExpanded(false);
    setZoomResetKey((value) => value + 1);
    restoredRef.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [replaceHistory]);

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Abre tu fototeca", "Activa el acceso a Fotos para elegir una imagen.");
      return;
    }
    await usePickerResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 }));
  }, [usePickerResult]);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Activa la cámara", "Permite el acceso para capturar una foto nueva.");
      return;
    }
    await usePickerResult(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 }));
  }, [usePickerResult]);

  const openPhotoMenu = useCallback(() => {
    Alert.alert("Nueva foto", "Elige cómo quieres empezar.", [
      { text: "Fotos", onPress: () => void pickFromLibrary() },
      { text: "Cámara", onPress: () => void takePhoto() },
      { text: "Cancelar", style: "cancel" },
    ]);
  }, [pickFromLibrary, takePhoto]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    historyIndexRef.current -= 1;
    applySettings(historyRef.current[historyIndexRef.current]);
    setActivePresetId(null);
    setHistoryVersion((value) => value + 1);
    void Haptics.selectionAsync();
  }, [applySettings, canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    historyIndexRef.current += 1;
    applySettings(historyRef.current[historyIndexRef.current]);
    setActivePresetId(null);
    setHistoryVersion((value) => value + 1);
    void Haptics.selectionAsync();
  }, [applySettings, canRedo]);

  const openSection = useCallback((section: ToolSection) => {
    setActiveSection(section);
    setPanelExpanded(true);
    void Haptics.selectionAsync();
  }, []);

  const updateAdjustment = useCallback((key: AdjustmentKey, value: number) => {
    setActivePresetId(null);
    applySettings({ ...settingsRef.current, [key]: value });
  }, [applySettings]);

  const finishAdjustment = useCallback((key: AdjustmentKey, value: number) => {
    commit({ ...settingsRef.current, [key]: value });
  }, [commit]);

  const resetSection = useCallback(() => {
    const keys = activeSection === "light" ? LIGHT_ADJUSTMENTS.map((item) => item.key) : activeSection === "color" ? COLOR_ADJUSTMENTS.map((item) => item.key) : activeSection === "detail" ? DETAIL_ADJUSTMENTS.map((item) => item.key) : [];
    if (keys.length === 0) return;
    const next = { ...settingsRef.current };
    for (const key of keys) next[key] = DEFAULT_SETTINGS[key];
    setActivePresetId(null);
    commit(next);
  }, [activeSection, commit]);

  const enhancePhoto = useCallback(() => {
    if (!asset) return;
    setActivePresetId(null);
    commit(applyAutoEnhance(settingsRef.current));
    showToast("Mejora rápida aplicada");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [asset, commit, showToast]);

  const choosePreset = useCallback((preset: FilterPreset | null) => {
    if (!asset) return;
    setFilterIntensity(1);
    if (!preset) {
      setActivePresetId(null);
      commit(neutralizeAdjustments(settingsRef.current));
    } else {
      setActivePresetId(preset.id);
      commit(settingsFromPreset(settingsRef.current, preset, 1));
    }
    void Haptics.selectionAsync();
  }, [asset, commit]);

  const updateFilterIntensity = useCallback((value: number) => {
    if (!activePreset) return;
    setFilterIntensity(value);
    applySettings(settingsFromPreset(settingsRef.current, activePreset, value));
  }, [activePreset, applySettings]);

  const finishFilterIntensity = useCallback((value: number) => {
    if (!activePreset) return;
    setFilterIntensity(value);
    commit(settingsFromPreset(settingsRef.current, activePreset, value));
  }, [activePreset, commit]);

  const changeCropRatio = useCallback((cropRatio: CropRatio) => {
    updateAndCommit((current) => ({ ...current, cropRatio, cropX: 0, cropY: 0 }));
    setZoomResetKey((value) => value + 1);
    void Haptics.selectionAsync();
  }, [updateAndCommit]);

  const prepareExport = useCallback(async () => {
    if (!asset) throw new Error("Primero elige una foto.");
    await new Promise((resolve) => setTimeout(resolve, 180));
    const snapshot = await exportCanvasRef.current?.makeImageSnapshotAsync();
    if (!snapshot) throw new Error("No pudimos preparar la imagen.");
    const pngFile = new File(Paths.cache, `${asset.fileName}-${Date.now()}.png`);
    if (!pngFile.exists) pngFile.create();
    pngFile.write(snapshot.encodeToBytes());
    if (exportFormat === "png") return { uri: pngFile.uri, mimeType: "image/png", uti: "public.png" };
    const context = ImageManipulator.manipulate(pngFile.uri);
    const rendered = await context.renderAsync();
    const jpeg = await rendered.saveAsync({ compress: exportQuality, format: ImageManipulator.SaveFormat.JPEG });
    return { uri: jpeg.uri, mimeType: "image/jpeg", uti: "public.jpeg" };
  }, [asset, exportCanvasRef, exportFormat, exportQuality]);

  const runExport = useCallback(async (action: ExportAction) => {
    if (!asset || isExporting) return;
    setExportingAction(action);
    try {
      const output = await prepareExport();
      if (action === "save") {
        const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
        if (!permission.granted) throw new Error("Activa el permiso para guardar en Fotos.");
        const mediaApi = MediaLibrary as unknown as { Asset?: { create: (uri: string) => Promise<unknown> }; createAssetAsync?: (uri: string) => Promise<unknown> };
        if (mediaApi.Asset?.create) await mediaApi.Asset.create(output.uri);
        else if (mediaApi.createAssetAsync) await mediaApi.createAssetAsync(output.uri);
        else throw new Error("Guardar en Fotos no está disponible.");
        showToast("Guardada en Fotos");
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error("Compartir no está disponible en este dispositivo.");
        await Sharing.shareAsync(output.uri, { mimeType: output.mimeType, UTI: output.uti });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("No se pudo exportar", error instanceof Error ? error.message : "Prueba nuevamente.");
    } finally {
      setExportingAction(null);
    }
  }, [asset, isExporting, prepareExport, showToast]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    setCanvasSize({ width: Math.max(1, event.nativeEvent.layout.width), height: Math.max(1, event.nativeEvent.layout.height) });
  }, []);

  const renderAdjustments = (items: Adjustment[]) => items.map((adjustment) => (
    <View key={adjustment.key} style={styles.adjustment}>
      <View style={styles.adjustmentHeader}>
        <View style={styles.adjustmentName}><Text style={styles.adjustmentIcon}>{adjustment.icon}</Text><Text style={styles.adjustmentLabel}>{adjustment.label}</Text></View>
        <Text style={styles.adjustmentValue}>{adjustment.format(settings[adjustment.key])}</Text>
      </View>
      <EditorSlider disabled={!asset} minimumValue={adjustment.minimum} maximumValue={adjustment.maximum} step={adjustment.step} neutralValue={adjustment.neutral} value={settings[adjustment.key]} onValueChange={(value) => updateAdjustment(adjustment.key, value)} onSlidingComplete={(value) => finishAdjustment(adjustment.key, value)} />
    </View>
  ));

  const renderCrop = () => (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratioRow}>
        {CROP_RATIOS.map((ratio) => (
          <Pressable key={ratio.key} disabled={!asset} onPress={() => changeCropRatio(ratio.key)} style={({ pressed }) => [styles.ratioCard, settings.cropRatio === ratio.key && styles.ratioCardActive, pressed && styles.buttonPressed, !asset && styles.buttonMuted]}>
            <Text style={[styles.ratioLabel, settings.cropRatio === ratio.key && styles.ratioLabelActive]}>{ratio.label}</Text>
            <Text style={styles.ratioCaption}>{ratio.caption}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.adjustment}>
        <View style={styles.adjustmentHeader}><View style={styles.adjustmentName}><Text style={styles.adjustmentIcon}>∠</Text><Text style={styles.adjustmentLabel}>Enderezar</Text></View><Text style={styles.adjustmentValue}>{signedPercent(settings.straighten)}°</Text></View>
        <EditorSlider disabled={!asset} minimumValue={-15} maximumValue={15} step={0.5} neutralValue={0} value={settings.straighten} onValueChange={(value) => applySettings({ ...settingsRef.current, straighten: value })} onSlidingComplete={(value) => commit({ ...settingsRef.current, straighten: value })} />
      </View>
      {settings.cropRatio !== "original" ? (
        <View style={styles.positionCard}>
          <Text style={styles.positionTitle}>Posición dentro del encuadre</Text>
          <Text style={styles.positionCopy}>Desliza horizontal y verticalmente para centrar el sujeto.</Text>
          <View style={styles.compactAdjustment}><Text style={styles.compactLabel}>Horizontal</Text><EditorSlider disabled={!asset} minimumValue={-1} maximumValue={1} step={0.01} neutralValue={0} value={settings.cropX} onValueChange={(value) => applySettings({ ...settingsRef.current, cropX: value })} onSlidingComplete={(value) => commit({ ...settingsRef.current, cropX: value })} /></View>
          <View style={styles.compactAdjustment}><Text style={styles.compactLabel}>Vertical</Text><EditorSlider disabled={!asset} minimumValue={-1} maximumValue={1} step={0.01} neutralValue={0} value={settings.cropY} onValueChange={(value) => applySettings({ ...settingsRef.current, cropY: value })} onSlidingComplete={(value) => commit({ ...settingsRef.current, cropY: value })} /></View>
        </View>
      ) : null}
      <View style={styles.transformGrid}>
        <ToolButton label="↺" caption="Izquierda" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation - 90 }))} />
        <ToolButton label="↻" caption="Derecha" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation + 90 }))} />
        <ToolButton label="↔" caption="Espejo H" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, flipX: !current.flipX }))} />
        <ToolButton label="↕" caption="Espejo V" disabled={!asset} onPress={() => updateAndCommit((current) => ({ ...current, flipY: !current.flipY }))} />
      </View>
    </View>
  );

  const renderFilters = () => (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <Pressable disabled={!asset} onPress={() => choosePreset(null)} style={({ pressed }) => [styles.filterCard, activePresetId === null && styles.filterCardActive, pressed && styles.buttonPressed, !asset && styles.buttonMuted]}>
          <View style={[styles.filterSymbol, { backgroundColor: "#242833" }]}><Text style={styles.filterSymbolText}>×</Text></View>
          <Text style={styles.filterName}>Original</Text><Text style={styles.filterCaption}>Sin look</Text>
        </Pressable>
        {FILTER_PRESETS.map((preset) => (
          <Pressable key={preset.id} disabled={!asset} onPress={() => choosePreset(preset)} style={({ pressed }) => [styles.filterCard, activePresetId === preset.id && styles.filterCardActive, pressed && styles.buttonPressed, !asset && styles.buttonMuted]}>
            <View style={[styles.filterSymbol, { backgroundColor: preset.accent }]}><Text style={styles.filterSymbolTextDark}>{preset.symbol}</Text></View>
            <Text style={styles.filterName}>{preset.name}</Text><Text style={styles.filterCaption}>{preset.caption}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {activePreset ? (
        <View style={styles.filterIntensityCard}>
          <View style={styles.adjustmentHeader}><Text style={styles.adjustmentLabel}>Intensidad de {activePreset.name}</Text><Text style={styles.adjustmentValue}>{Math.round(filterIntensity * 100)}</Text></View>
          <EditorSlider disabled={!asset} minimumValue={0} maximumValue={1} step={0.01} value={filterIntensity} onValueChange={updateFilterIntensity} onSlidingComplete={finishFilterIntensity} />
        </View>
      ) : null}
    </View>
  );

  const renderExport = () => (
    <View>
      <View style={styles.exportSummary}><View><Text style={styles.exportSummaryLabel}>SALIDA</Text><Text style={styles.exportDimensions}>{asset ? `${exportSize.width} × ${exportSize.height} px` : "Selecciona una foto"}</Text></View><View style={styles.readyBadge}><Text style={styles.readyBadgeText}>ALTA CALIDAD</Text></View></View>
      <Text style={styles.optionLabel}>Formato</Text>
      <View style={styles.optionRow}>{(["jpeg", "png"] as ExportFormat[]).map((format) => <Pressable key={format} onPress={() => setExportFormat(format)} style={[styles.optionChip, exportFormat === format && styles.optionChipActive]}><Text style={[styles.optionChipText, exportFormat === format && styles.optionChipTextActive]}>{format.toUpperCase()}</Text></Pressable>)}</View>
      {exportFormat === "jpeg" ? <><Text style={styles.optionLabel}>Calidad</Text><View style={styles.optionRow}>{([[0.8, "Ligera"], [0.92, "Alta"], [1, "Máxima"]] as [ExportQuality, string][]).map(([quality, label]) => <Pressable key={quality} onPress={() => setExportQuality(quality)} style={[styles.optionChip, exportQuality === quality && styles.optionChipActive]}><Text style={[styles.optionChipText, exportQuality === quality && styles.optionChipTextActive]}>{label}</Text></Pressable>)}</View></> : null}
      <Text style={styles.optionLabel}>Tamaño</Text>
      <View style={styles.optionRow}>{([[1, "100%"], [0.75, "75%"], [0.5, "50%"]] as [OutputScale, string][]).map(([scale, label]) => <Pressable key={scale} onPress={() => setOutputScale(scale)} style={[styles.optionChip, outputScale === scale && styles.optionChipActive]}><Text style={[styles.optionChipText, outputScale === scale && styles.optionChipTextActive]}>{label}</Text></Pressable>)}</View>
      <Pressable disabled={!asset || isExporting} onPress={() => void runExport("save")} style={({ pressed }) => [styles.savePhotoButton, (!asset || isExporting) && styles.buttonMuted, pressed && styles.buttonPressed]}>{exportingAction === "save" ? <ActivityIndicator color="#fff" /> : <><Text style={styles.savePhotoIcon}>↓</Text><View><Text style={styles.savePhotoTitle}>Guardar en Fotos</Text><Text style={styles.savePhotoCopy}>Lista en tu fototeca</Text></View></>}</Pressable>
      <Pressable disabled={!asset || isExporting} onPress={() => void runExport("share")} style={({ pressed }) => [styles.shareButton, (!asset || isExporting) && styles.buttonMuted, pressed && styles.buttonPressed]}>{exportingAction === "share" ? <ActivityIndicator color="#d8ceff" /> : <Text style={styles.shareButtonText}>Compartir archivo</Text>}</Pressable>
    </View>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case "light": return renderAdjustments(LIGHT_ADJUSTMENTS);
      case "color": return renderAdjustments(COLOR_ADJUSTMENTS);
      case "detail": return renderAdjustments(DETAIL_ADJUSTMENTS);
      case "crop": return renderCrop();
      case "filters": return renderFilters();
      case "export": return renderExport();
    }
  };

  const renderToolRail = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRailContent} style={styles.toolRail}>
      {TOOLS.map((tool) => (
        <Pressable key={tool.key} onPress={() => openSection(tool.key)} style={({ pressed }) => [styles.toolTab, activeSection === tool.key && styles.toolTabActive, pressed && styles.toolTabPressed]}>
          <Text style={[styles.toolTabIcon, activeSection === tool.key && styles.toolTabIconActive]}>{tool.icon}</Text>
          <Text style={[styles.toolTabLabel, activeSection === tool.key && styles.toolTabLabelActive]}>{tool.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const sectionInfo = SECTION_COPY[activeSection];
  const showReset = ["light", "color", "detail"].includes(activeSection);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandLetter}>E</Text></View>{!isNarrow ? <View><Text style={styles.brand}>EditMyPic</Text><Text style={styles.autosaveLabel}>{asset ? "BORRADOR GUARDADO" : "ESTUDIO MÓVIL"}</Text></View> : null}</View>
          <View style={styles.topActions}>
            <Pressable accessibilityLabel="Deshacer" disabled={!canUndo} onPress={undo} style={({ pressed }) => [styles.iconButton, (!canUndo || pressed) && styles.buttonMuted]}><Text style={styles.iconText}>↶</Text></Pressable>
            <Pressable accessibilityLabel="Rehacer" disabled={!canRedo} onPress={redo} style={({ pressed }) => [styles.iconButton, (!canRedo || pressed) && styles.buttonMuted]}><Text style={styles.iconText}>↷</Text></Pressable>
            <Pressable disabled={!asset} onPress={enhancePhoto} style={({ pressed }) => [styles.magicButton, !asset && styles.buttonMuted, pressed && styles.buttonPressed]}><Text style={styles.magicButtonText}>✦ {!isNarrow ? "Mejorar" : ""}</Text></Pressable>
            <Pressable onPress={openPhotoMenu} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}><Text style={styles.secondaryButtonText}>{isNarrow ? "+" : "Foto"}</Text></Pressable>
            <Pressable disabled={!asset} onPress={() => openSection("export")} style={({ pressed }) => [styles.primaryButton, !asset && styles.buttonMuted, pressed && styles.buttonPressed]}><Text style={styles.primaryButtonText}>{isNarrow ? "↑" : "Guardar"}</Text></Pressable>
          </View>
        </View>

        <View style={[styles.workspace, usesBottomPanel && styles.workspaceCompact]}>
          <View style={styles.editorColumn}>
            <View onLayout={handleCanvasLayout} style={styles.canvasStage}>
              <ZoomableStage disabled={!asset} resetKey={`${asset?.uri ?? "empty"}-${zoomResetKey}`} onCompareChange={setShowOriginal} style={styles.zoomStage}>
                {(transform) => asset ? <EditorCanvas asset={asset} settings={displaySettings} width={canvasSize.width} height={canvasSize.height} preview previewScale={transform.scale} previewTranslateX={transform.translateX} previewTranslateY={transform.translateY} /> : <Pressable onPress={openPhotoMenu} style={styles.emptyState}><View style={styles.uploadCircle}><Text style={styles.uploadIcon}>＋</Text></View><Text style={styles.emptyEyebrow}>TU FOTO, TU ESTILO</Text><Text style={styles.emptyTitle}>Empieza en segundos</Text><Text style={styles.emptyCopy}>Elige una imagen y edítala con precisión, directamente en tu iPhone.</Text><View style={styles.emptyAction}><Text style={styles.emptyActionText}>Abrir foto</Text></View></Pressable>}
              </ZoomableStage>
              {asset ? <><View pointerEvents="none" style={styles.compareBadge}><Text style={styles.compareText}>{showOriginal ? "ORIGINAL" : "MANTÉN PARA COMPARAR"}</Text></View><View pointerEvents="none" style={styles.gestureHint}><Text style={styles.gestureHintText}>Pellizca para zoom · doble toque para ajustar</Text></View></> : null}
            </View>
          </View>

          <View style={[styles.inspector, usesBottomPanel && styles.inspectorCompact, usesBottomPanel && effectivePanelExpanded && { height: mobilePanelHeight, minHeight: mobilePanelHeight, maxHeight: mobilePanelHeight }, usesBottomPanel && !effectivePanelExpanded && styles.inspectorCollapsed]}>
            {!effectivePanelExpanded ? <View style={styles.collapsedDock}>{renderToolRail()}</View> : <>
              {usesBottomPanel ? <Pressable onPress={() => setPanelExpanded(false)} style={styles.sheetTopRow}><View style={styles.sheetHandle} /><Text style={styles.sheetHideText}>Toca para ocultar</Text></Pressable> : null}
              {renderToolRail()}
              <ScrollView style={styles.panelScroll} contentContainerStyle={styles.inspectorContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.panelHeader}><View style={styles.panelHeading}><Text style={styles.panelTitle}>{sectionInfo.title}</Text><Text style={styles.panelCopy}>{sectionInfo.copy}</Text></View>{showReset ? <Pressable disabled={!asset} onPress={resetSection}><Text style={[styles.resetText, !asset && styles.textMuted]}>Reiniciar</Text></Pressable> : null}</View>
                {renderSectionContent()}
                {asset && activeSection !== "export" ? <Text style={styles.historyMeta}>{historyVersion + 1} estados en el historial</Text> : null}
              </ScrollView>
            </>}
          </View>
        </View>

        {toastMessage ? <View style={styles.toast}><Text style={styles.toastText}>✓ {toastMessage}</Text></View> : null}
        {asset ? <View pointerEvents="none" style={styles.offscreenCanvas}><EditorCanvas ref={exportCanvasRef} asset={asset} settings={settings} width={exportSize.width} height={exportSize.height} /></View> : null}
      </View>
    </SafeAreaView>
  );
}
