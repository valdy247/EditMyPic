import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  Asset as MediaLibraryAsset,
  requestPermissionsAsync as requestMediaLibraryPermissionsAsync,
} from "expo-media-library";
import * as Sharing from "expo-sharing";
import { ImageFormat, useCanvasRef } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Vibration } from "react-native";

import type { ViewportTransform } from "@/components/editor-gesture-surface";
import {
  COLOR_ADJUSTMENTS,
  EFFECT_ADJUSTMENTS,
  LIGHT_ADJUSTMENTS,
  type AdjustGroup,
  type Adjustment,
  type ExportEdge,
  type ExportFormat,
  type NumericSettingKey,
  type PanelTab,
} from "@/src/editor/editor-config";
import { getExportSize } from "@/src/editor/geometry";
import { FILTER_PRESETS } from "@/src/editor/presets";
import {
  DEFAULT_SETTINGS,
  LOOK_KEYS,
  type EditorSettings,
  type FilterId,
  type ImageAsset,
  type SavedLook,
} from "@/src/editor/types";

const PROJECT_FILE = new File(Paths.document, "editmypic-project.json");
const LOOK_FILE = new File(Paths.document, "editmypic-look.json");

type HistoryEntry = {
  settings: EditorSettings;
  label: string;
};

type PersistedProject = {
  asset: ImageAsset;
  settings: EditorSettings;
};

function cloneSettings(settings: EditorSettings): EditorSettings {
  return { ...settings };
}

function getFileName(fileName?: string | null) {
  return (fileName || "editmypic").replace(/\.[^.]+$/, "");
}

function getExtension(uri: string) {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() || "jpg";
}

function extractLook(settings: EditorSettings): SavedLook {
  const look = {} as SavedLook;
  for (const key of LOOK_KEYS) {
    (look as Record<string, unknown>)[key] = settings[key];
  }
  return look;
}

function originalComparison(settings: EditorSettings): EditorSettings {
  return {
    ...DEFAULT_SETTINGS,
    rotation: settings.rotation,
    straighten: settings.straighten,
    perspectiveX: settings.perspectiveX,
    perspectiveY: settings.perspectiveY,
    flipX: settings.flipX,
    flipY: settings.flipY,
    cropPreset: settings.cropPreset,
    freeAspect: settings.freeAspect,
    zoom: settings.zoom,
    offsetX: settings.offsetX,
    offsetY: settings.offsetY,
  };
}

export function useEditorController() {
  const exportCanvasRef = useCanvasRef();
  const initialSettings = cloneSettings(DEFAULT_SETTINGS);
  const historyRef = useRef<HistoryEntry[]>([
    { settings: initialSettings, label: "Inicio" },
  ]);
  const historyIndexRef = useRef(0);
  const settingsRef = useRef<EditorSettings>(initialSettings);
  const neutralTouchRef = useRef<
    Partial<Record<NumericSettingKey, boolean>>
  >({});
  const projectReadyRef = useRef(false);

  const [asset, setAsset] = useState<ImageAsset | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<PanelTab>("looks");
  const [adjustGroup, setAdjustGroup] = useState<AdjustGroup>("light");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedLook, setSavedLook] = useState<SavedLook | null>(null);
  const [exportingAction, setExportingAction] = useState<
    "save" | "share" | null
  >(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("jpeg");
  const [exportQuality, setExportQuality] = useState(90);
  const [exportEdge, setExportEdge] = useState<ExportEdge>(4096);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const lastHistoryLabel =
    historyRef.current[historyIndexRef.current]?.label ?? "Inicio";
  const displaySettings = showOriginal
    ? originalComparison(settings)
    : settings;
  const exportSize = useMemo(
    () =>
      asset
        ? getExportSize(asset, settings, exportEdge)
        : { width: 1, height: 1 },
    [asset, exportEdge, settings],
  );
  const estimatedBytes = useMemo(() => {
    const pixels = exportSize.width * exportSize.height;
    return exportFormat === "png"
      ? pixels * 1.25
      : pixels * (0.16 + (exportQuality / 100) * 0.26);
  }, [exportFormat, exportQuality, exportSize.height, exportSize.width]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const applySettings = useCallback((next: EditorSettings) => {
    const cloned = cloneSettings(next);
    settingsRef.current = cloned;
    setSettings(cloned);
  }, []);

  const resetHistory = useCallback(
    (next = cloneSettings(DEFAULT_SETTINGS), label = "Nueva foto") => {
      historyRef.current = [{ settings: cloneSettings(next), label }];
      historyIndexRef.current = 0;
      applySettings(next);
      setHistoryVersion((value) => value + 1);
    },
    [applySettings],
  );

  const commit = useCallback(
    (next: EditorSettings, label: string) => {
      const current = historyRef.current[historyIndexRef.current]?.settings;
      const cloned = cloneSettings(next);

      if (!current || JSON.stringify(current) !== JSON.stringify(cloned)) {
        const nextHistory = [
          ...historyRef.current.slice(0, historyIndexRef.current + 1),
          { settings: cloned, label },
        ].slice(-120);
        historyRef.current = nextHistory;
        historyIndexRef.current = nextHistory.length - 1;
        setHistoryVersion((value) => value + 1);
      }

      applySettings(cloned);
    },
    [applySettings],
  );

  const updateAndCommit = useCallback(
    (producer: (current: EditorSettings) => EditorSettings, label: string) => {
      commit(producer(settingsRef.current), label);
    },
    [commit],
  );

  useEffect(() => {
    try {
      if (LOOK_FILE.exists) {
        const storedLook = JSON.parse(
          LOOK_FILE.textSync(),
        ) as Partial<SavedLook>;
        setSavedLook({ ...extractLook(DEFAULT_SETTINGS), ...storedLook });
      }

      if (PROJECT_FILE.exists) {
        const project = JSON.parse(
          PROJECT_FILE.textSync(),
        ) as PersistedProject;
        const imageFile = new File(project.asset.uri);
        if (imageFile.exists) {
          setAsset(project.asset);
          resetHistory(
            { ...DEFAULT_SETTINGS, ...project.settings },
            "Proyecto recuperado",
          );
          showToast("Tu última edición volvió contigo");
        }
      }
    } catch {
      // A damaged local draft should never block the editor.
    } finally {
      projectReadyRef.current = true;
    }
  }, [resetHistory, showToast]);

  useEffect(() => {
    if (!projectReadyRef.current || !asset) return;
    const timeout = setTimeout(() => {
      try {
        PROJECT_FILE.write(
          JSON.stringify({ asset, settings } satisfies PersistedProject),
        );
      } catch {
        // Autosave is best effort and stays invisible when storage is full.
      }
    }, 450);
    return () => clearTimeout(timeout);
  }, [asset, settings]);

  const persistSelectedImage = useCallback(
    async (selected: ImagePicker.ImagePickerAsset) => {
      const extension = getExtension(selected.uri);
      const targetUri = FileSystem.documentDirectory
        ? `${FileSystem.documentDirectory}editmypic-source-${Date.now()}.${extension}`
        : selected.uri;

      if (targetUri !== selected.uri) {
        try {
          await FileSystem.copyAsync({ from: selected.uri, to: targetUri });
        } catch {
          return selected.uri;
        }
      }
      return targetUri;
    },
    [],
  );

  const usePickerResult = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets[0]) return;
      const selected = result.assets[0];
      const uri = await persistSelectedImage(selected);
      const nextAsset: ImageAsset = {
        uri,
        width: selected.width,
        height: selected.height,
        fileName: getFileName(selected.fileName),
      };

      if (
        asset?.uri &&
        asset.uri !== uri &&
        asset.uri.includes("editmypic-source-")
      ) {
        try {
          await FileSystem.deleteAsync(asset.uri, { idempotent: true });
        } catch {
          // Cleanup should never block opening a new photo.
        }
      }

      setAsset(nextAsset);
      resetHistory();
      setActiveTab("looks");
      setPanelExpanded(false);
      showToast("Foto lista. Pellizca para acercar");
    },
    [asset?.uri, persistSelectedImage, resetHistory, showToast],
  );

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Abre tu fototeca",
        "Activa el acceso a Fotos para elegir una imagen.",
      );
      return;
    }
    await usePickerResult(
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
      Alert.alert(
        "Activa la cámara",
        "Necesitamos la cámara para capturar una foto nueva.",
      );
      return;
    }
    await usePickerResult(
      await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      }),
    );
  }, [usePickerResult]);

  const openPhotoMenu = useCallback(() => {
    Alert.alert("Elige tu foto", "¿De dónde quieres traerla?", [
      { text: "Fotos", onPress: () => void pickFromLibrary() },
      { text: "Cámara", onPress: () => void takePhoto() },
      { text: "Cancelar", style: "cancel" },
    ]);
  }, [pickFromLibrary, takePhoto]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    historyIndexRef.current -= 1;
    applySettings(historyRef.current[historyIndexRef.current].settings);
    setHistoryVersion((value) => value + 1);
  }, [applySettings, canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    historyIndexRef.current += 1;
    applySettings(historyRef.current[historyIndexRef.current].settings);
    setHistoryVersion((value) => value + 1);
  }, [applySettings, canRedo]);

  const updateAdjustment = useCallback(
    (adjustment: Adjustment, value: number) => {
      const atNeutral =
        Math.abs(value - adjustment.neutral) <= adjustment.step / 2;
      if (atNeutral && !neutralTouchRef.current[adjustment.key]) {
        Vibration.vibrate(7);
      }
      neutralTouchRef.current[adjustment.key] = atNeutral;
      applySettings({ ...settingsRef.current, [adjustment.key]: value });
    },
    [applySettings],
  );

  const finishAdjustment = useCallback(
    (adjustment: Adjustment, value: number) => {
      commit(
        { ...settingsRef.current, [adjustment.key]: value },
        adjustment.label,
      );
    },
    [commit],
  );

  const resetAdjustment = useCallback(
    (adjustment: Adjustment) => {
      commit(
        { ...settingsRef.current, [adjustment.key]: adjustment.neutral },
        `Reiniciar ${adjustment.label}`,
      );
    },
    [commit],
  );

  const applyAutomaticEnhancement = useCallback(() => {
    if (!asset) return;
    const current = settingsRef.current;
    const toward = (value: number, target: number) =>
      value + (target - value) * 0.68;
    commit(
      {
        ...current,
        exposure: toward(current.exposure, 0.12),
        contrast: toward(current.contrast, 1.08),
        highlights: toward(current.highlights, -0.1),
        shadows: toward(current.shadows, 0.16),
        vibrance: toward(current.vibrance, 0.16),
        warmth: toward(current.warmth, 0.04),
        clarity: toward(current.clarity, 0.08),
        sharpness: toward(current.sharpness, 0.1),
      },
      "Mejora automática",
    );
    showToast("Mejora aplicada. Todo sigue editable");
  }, [asset, commit, showToast]);

  const selectFilter = useCallback(
    (filterId: FilterId) => {
      const label =
        FILTER_PRESETS.find((preset) => preset.id === filterId)?.label ??
        "Natural";
      commit({ ...settingsRef.current, filterId }, `Look ${label}`);
    },
    [commit],
  );

  const saveCurrentLook = useCallback(() => {
    if (!asset) return;
    const look = extractLook(settingsRef.current);
    try {
      LOOK_FILE.write(JSON.stringify(look));
      setSavedLook(look);
      showToast("Tu look quedó guardado");
    } catch {
      Alert.alert(
        "No se pudo guardar el look",
        "Prueba otra vez en unos segundos.",
      );
    }
  }, [asset, showToast]);

  const applySavedLook = useCallback(() => {
    if (!savedLook) return;
    commit({ ...settingsRef.current, ...savedLook }, "Mi look");
  }, [commit, savedLook]);

  const updateViewport = useCallback(
    (value: ViewportTransform) => {
      applySettings({ ...settingsRef.current, ...value });
    },
    [applySettings],
  );

  const finishViewport = useCallback(
    (value: ViewportTransform) => {
      commit({ ...settingsRef.current, ...value }, "Encuadre");
    },
    [commit],
  );

  const resetFraming = useCallback(() => {
    commit(
      { ...settingsRef.current, zoom: 1, offsetX: 0, offsetY: 0 },
      "Centrar imagen",
    );
  }, [commit]);

  const resetCurrentSection = useCallback(() => {
    const current = settingsRef.current;
    let next = cloneSettings(current);
    let label = "Reiniciar sección";

    if (activeTab === "looks") {
      for (const key of LOOK_KEYS) {
        (next as unknown as Record<string, unknown>)[key] =
          DEFAULT_SETTINGS[key];
      }
      label = "Reiniciar look";
    } else if (activeTab === "adjust") {
      for (const adjustment of [
        ...LIGHT_ADJUSTMENTS,
        ...COLOR_ADJUSTMENTS,
      ]) {
        (next as unknown as Record<string, unknown>)[adjustment.key] =
          adjustment.neutral;
      }
      label = "Reiniciar ajustes";
    } else if (activeTab === "crop") {
      next = {
        ...next,
        rotation: DEFAULT_SETTINGS.rotation,
        straighten: DEFAULT_SETTINGS.straighten,
        perspectiveX: DEFAULT_SETTINGS.perspectiveX,
        perspectiveY: DEFAULT_SETTINGS.perspectiveY,
        flipX: DEFAULT_SETTINGS.flipX,
        flipY: DEFAULT_SETTINGS.flipY,
        cropPreset: DEFAULT_SETTINGS.cropPreset,
        freeAspect: DEFAULT_SETTINGS.freeAspect,
        zoom: DEFAULT_SETTINGS.zoom,
        offsetX: DEFAULT_SETTINGS.offsetX,
        offsetY: DEFAULT_SETTINGS.offsetY,
      };
      label = "Reiniciar recorte";
    } else if (activeTab === "effects") {
      for (const adjustment of EFFECT_ADJUSTMENTS) {
        (next as unknown as Record<string, unknown>)[adjustment.key] =
          adjustment.neutral;
      }
      label = "Reiniciar efectos";
    }

    commit(next, label);
  }, [activeTab, commit]);

  const openTab = useCallback(
    (tab: PanelTab, usesBottomPanel: boolean, forceOpen = false) => {
      if (
        !forceOpen &&
        usesBottomPanel &&
        activeTab === tab &&
        panelExpanded
      ) {
        setPanelExpanded(false);
        return;
      }
      setActiveTab(tab);
      setPanelExpanded(true);
    },
    [activeTab, panelExpanded],
  );

  const renderExportFile = useCallback(async () => {
    if (!asset) throw new Error("Primero elige una foto.");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const snapshot = await exportCanvasRef.current?.makeImageSnapshotAsync();
    if (!snapshot) throw new Error("No pudimos preparar la imagen.");

    const isJpeg = exportFormat === "jpeg";
    const extension = isJpeg ? "jpg" : "png";
    const format = isJpeg ? ImageFormat.JPEG : ImageFormat.PNG;
    const output = new File(
      Paths.cache,
      `${asset.fileName}-${Date.now()}.${extension}`,
    );
    output.write(
      snapshot.encodeToBytes(format, isJpeg ? exportQuality : 100),
    );
    return output;
  }, [asset, exportCanvasRef, exportFormat, exportQuality]);

  const saveToPhotos = useCallback(async () => {
    if (!asset || exportingAction) return;
    setExportingAction("save");
    try {
      const permission = await requestMediaLibraryPermissionsAsync(true, [
        "photo",
      ]);
      if (!permission.granted) {
        throw new Error("Activa el permiso para guardar en Fotos.");
      }
      const output = await renderExportFile();
      await MediaLibraryAsset.create(output.uri);
      showToast("Guardada en Fotos ✓");
    } catch (error) {
      Alert.alert(
        "No se pudo guardar",
        error instanceof Error ? error.message : "Prueba nuevamente.",
      );
    } finally {
      setExportingAction(null);
    }
  }, [asset, exportingAction, renderExportFile, showToast]);

  const shareImage = useCallback(async () => {
    if (!asset || exportingAction) return;
    setExportingAction("share");
    try {
      const output = await renderExportFile();
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Compartir no está disponible en este dispositivo.");
      }
      await Sharing.shareAsync(output.uri, {
        mimeType: exportFormat === "jpeg" ? "image/jpeg" : "image/png",
        UTI: exportFormat === "jpeg" ? "public.jpeg" : "public.png",
      });
    } catch (error) {
      Alert.alert(
        "No se pudo compartir",
        error instanceof Error ? error.message : "Prueba nuevamente.",
      );
    } finally {
      setExportingAction(null);
    }
  }, [asset, exportFormat, exportingAction, renderExportFile]);

  return {
    asset,
    settings,
    settingsRef,
    displaySettings,
    exportCanvasRef,
    exportSize,
    estimatedBytes,
    historyVersion,
    lastHistoryLabel,
    canUndo,
    canRedo,
    activeTab,
    adjustGroup,
    panelExpanded,
    showOriginal,
    toast,
    savedLook,
    exportingAction,
    exportFormat,
    exportQuality,
    exportEdge,
    setAdjustGroup,
    setPanelExpanded,
    setShowOriginal,
    setExportFormat,
    setExportQuality,
    setExportEdge,
    applySettings,
    commit,
    updateAndCommit,
    openPhotoMenu,
    undo,
    redo,
    updateAdjustment,
    finishAdjustment,
    resetAdjustment,
    applyAutomaticEnhancement,
    selectFilter,
    saveCurrentLook,
    applySavedLook,
    updateViewport,
    finishViewport,
    resetFraming,
    resetCurrentSection,
    openTab,
    saveToPhotos,
    shareImage,
  };
}

export type EditorController = ReturnType<typeof useEditorController>;
