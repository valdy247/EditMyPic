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
  createForegroundMask,
  isForegroundRemovalSupported,
} from "@/modules/editmypic-vision";
import {
  BACKGROUND_ADJUSTMENTS,
  BACKGROUND_BLUR_ADJUSTMENT,
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
  type BackgroundMode,
  type EditorSettings,
  type EraseStroke,
  type FilterId,
  type ImageAsset,
  type SavedLook,
} from "@/src/editor/types";

const PROJECT_FILE = new File(Paths.document, "editmypic-project.json");
const LOOK_FILE = new File(Paths.document, "editmypic-look.json");
const AI_MAX_EDGE = 1536;

type HistoryEntry = {
  settings: EditorSettings;
  label: string;
};

type PersistedProject = {
  asset: ImageAsset;
  settings: EditorSettings;
};

type ProcessingAction = "background" | "erase" | null;

type EraseApiResponse = {
  imageBase64?: string;
  width?: number;
  height?: number;
  error?: string;
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

function getEraseEndpoint() {
  const configured = process.env.EXPO_PUBLIC_EDIT_API_URL?.trim();
  if (!configured) return null;
  const clean = configured.replace(/\/$/, "");
  return clean.endsWith("/api/v1/erase")
    ? clean
    : `${clean}/api/v1/erase`;
}

async function deleteOwnedFile(uri: string | null | undefined) {
  if (!uri || !uri.includes("editmypic-")) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Cleanup must never interrupt editing.
  }
}

export function useEditorController() {
  const exportCanvasRef = useCanvasRef();
  const aiCanvasRef = useCanvasRef();
  const eraseMaskCanvasRef = useCanvasRef();
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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [processingAction, setProcessingAction] =
    useState<ProcessingAction>(null);
  const [exportFormat, setExportFormatState] =
    useState<ExportFormat>("jpeg");
  const [exportQuality, setExportQuality] = useState(90);
  const [exportEdge, setExportEdge] = useState<ExportEdge>(4096);
  const [eraseStrokes, setEraseStrokes] = useState<EraseStroke[]>([]);
  const [eraseBrushSize, setEraseBrushSize] = useState(0.085);

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
  const aiSize = useMemo(
    () =>
      asset
        ? getExportSize(asset, settings, AI_MAX_EDGE)
        : { width: 1, height: 1 },
    [asset, settings],
  );
  const estimatedBytes = useMemo(() => {
    const pixels = exportSize.width * exportSize.height;
    return exportFormat === "png"
      ? pixels * 1.25
      : pixels * (0.16 + (exportQuality / 100) * 0.26);
  }, [exportFormat, exportQuality, exportSize.height, exportSize.width]);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

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
    async (
      selected: ImagePicker.ImagePickerAsset,
      prefix = "editmypic-source",
    ) => {
      const extension = getExtension(selected.uri);
      const targetUri = FileSystem.documentDirectory
        ? `${FileSystem.documentDirectory}${prefix}-${Date.now()}.${extension}`
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

      await deleteOwnedFile(asset?.uri);
      await deleteOwnedFile(settingsRef.current.foregroundMaskUri);
      await deleteOwnedFile(settingsRef.current.backgroundImageUri);

      setAsset(nextAsset);
      setEraseStrokes([]);
      resetHistory();
      setActiveTab("looks");
      setPanelExpanded(false);
      setExportFormatState("jpeg");
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

  const removeBackground = useCallback(async () => {
    if (!asset || processingAction) return;
    if (!isForegroundRemovalSupported()) {
      Alert.alert(
        "Necesita la build nueva",
        "Quitar fondo usa Apple Vision. Crea un Launch nuevo para activarlo.",
      );
      return;
    }

    setProcessingAction("background");
    try {
      const result = await createForegroundMask(asset.uri);
      const maskFile = new File(
        Paths.document,
        `editmypic-mask-${Date.now()}.png`,
      );
      await FileSystem.copyAsync({
        from: result.maskUri,
        to: maskFile.uri,
      });
      await deleteOwnedFile(settingsRef.current.foregroundMaskUri);

      commit(
        {
          ...settingsRef.current,
          foregroundMaskUri: maskFile.uri,
          backgroundMode: "transparent",
        },
        "Quitar fondo",
      );
      setExportFormatState("png");
      Vibration.vibrate(12);
      showToast(
        result.mode === "subjects"
          ? "Fondo eliminado en tu iPhone ✓"
          : "Persona separada del fondo ✓",
      );
    } catch (error) {
      Alert.alert(
        "No se pudo quitar el fondo",
        error instanceof Error
          ? error.message
          : "Prueba con una foto donde el sujeto se vea completo.",
      );
    } finally {
      setProcessingAction(null);
    }
  }, [asset, commit, processingAction, showToast]);

  const setBackgroundMode = useCallback(
    (backgroundMode: BackgroundMode) => {
      if (!settingsRef.current.foregroundMaskUri && backgroundMode !== "original") {
        showToast("Primero toca Quitar fondo");
        return;
      }
      commit(
        { ...settingsRef.current, backgroundMode },
        backgroundMode === "original" ? "Fondo original" : "Cambiar fondo",
      );
      if (backgroundMode === "transparent") setExportFormatState("png");
    },
    [commit, showToast],
  );

  const setBackgroundColors = useCallback(
    (primary: string, secondary = primary, gradient = false) => {
      if (!settingsRef.current.foregroundMaskUri) {
        showToast("Primero toca Quitar fondo");
        return;
      }
      commit(
        {
          ...settingsRef.current,
          backgroundMode: gradient ? "gradient" : "solid",
          backgroundColor: primary,
          backgroundColorSecondary: secondary,
        },
        gradient ? "Fondo degradado" : "Fondo de color",
      );
    },
    [commit, showToast],
  );

  const pickBackgroundPhoto = useCallback(async () => {
    if (!asset) return;
    if (!settingsRef.current.foregroundMaskUri) {
      showToast("Primero toca Quitar fondo");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Abre tu fototeca",
        "Activa el acceso a Fotos para elegir un fondo.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    const previous = settingsRef.current.backgroundImageUri;
    const backgroundImageUri = await persistSelectedImage(
      result.assets[0],
      "editmypic-background",
    );
    await deleteOwnedFile(previous);
    commit(
      {
        ...settingsRef.current,
        backgroundMode: "photo",
        backgroundImageUri,
      },
      "Fondo con foto",
    );
  }, [asset, commit, persistSelectedImage, showToast]);

  const resetBackground = useCallback(async () => {
    const current = settingsRef.current;
    await deleteOwnedFile(current.foregroundMaskUri);
    await deleteOwnedFile(current.backgroundImageUri);
    commit(
      {
        ...current,
        foregroundMaskUri: null,
        backgroundMode: DEFAULT_SETTINGS.backgroundMode,
        backgroundColor: DEFAULT_SETTINGS.backgroundColor,
        backgroundColorSecondary: DEFAULT_SETTINGS.backgroundColorSecondary,
        backgroundImageUri: null,
        backgroundBlur: DEFAULT_SETTINGS.backgroundBlur,
        maskFeather: DEFAULT_SETTINGS.maskFeather,
        subjectShadow: DEFAULT_SETTINGS.subjectShadow,
      },
      "Reiniciar fondo",
    );
    setExportFormatState("jpeg");
  }, [commit]);

  const addEraseStroke = useCallback((stroke: EraseStroke) => {
    setEraseStrokes((current) => [...current, stroke].slice(-80));
  }, []);

  const undoEraseStroke = useCallback(() => {
    setEraseStrokes((current) => current.slice(0, -1));
  }, []);

  const clearEraseSelection = useCallback(() => {
    setEraseStrokes([]);
  }, []);

  const applyObjectErase = useCallback(async () => {
    if (!asset || processingAction || eraseStrokes.length === 0) return;
    const endpoint = getEraseEndpoint();
    if (!endpoint) {
      Alert.alert(
        "Falta conectar la IA",
        "Configura EXPO_PUBLIC_EDIT_API_URL en Expo para activar Borrar objetos.",
      );
      return;
    }

    setProcessingAction("erase");
    try {
      await new Promise((resolve) => setTimeout(resolve, 180));
      const imageSnapshot =
        await aiCanvasRef.current?.makeImageSnapshotAsync();
      const maskSnapshot =
        await eraseMaskCanvasRef.current?.makeImageSnapshotAsync();
      if (!imageSnapshot || !maskSnapshot) {
        throw new Error("No pudimos preparar la selección.");
      }

      const imageFile = new File(
        Paths.cache,
        `editmypic-ai-source-${Date.now()}.jpg`,
      );
      const maskFile = new File(
        Paths.cache,
        `editmypic-ai-mask-${Date.now()}.png`,
      );
      imageFile.write(imageSnapshot.encodeToBytes(ImageFormat.JPEG, 92));
      maskFile.write(maskSnapshot.encodeToBytes(ImageFormat.PNG, 100));

      const [imageBase64, maskBase64] = await Promise.all([
        FileSystem.readAsStringAsync(imageFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
        FileSystem.readAsStringAsync(maskFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
      ]);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          maskBase64,
          prompt:
            "Remove the selected people or objects and reconstruct the area naturally. Preserve everything outside the transparent mask exactly, including lighting, perspective, texture, and image composition. Do not add new subjects or text.",
        }),
      });
      const payload = (await response.json()) as EraseApiResponse;
      if (!response.ok || !payload.imageBase64) {
        throw new Error(payload.error || "La IA no pudo completar el borrado.");
      }

      const output = new File(
        Paths.document,
        `editmypic-clean-${Date.now()}.png`,
      );
      await FileSystem.writeAsStringAsync(output.uri, payload.imageBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const oldAsset = asset;
      const nextAsset: ImageAsset = {
        uri: output.uri,
        width: payload.width ?? aiSize.width,
        height: payload.height ?? aiSize.height,
        fileName: `${asset.fileName}-clean`,
      };
      setAsset(nextAsset);
      setEraseStrokes([]);
      resetHistory(cloneSettings(DEFAULT_SETTINGS), "Objeto borrado");
      setActiveTab("looks");
      setPanelExpanded(false);
      setExportFormatState("png");
      await deleteOwnedFile(oldAsset.uri);
      Vibration.vibrate([0, 12, 50, 12]);
      showToast("Selección borrada y reconstruida ✓");
    } catch (error) {
      Alert.alert(
        "No se pudo borrar",
        error instanceof Error ? error.message : "Prueba con una zona menor.",
      );
    } finally {
      setProcessingAction(null);
    }
  }, [
    aiSize.height,
    aiSize.width,
    asset,
    eraseStrokes.length,
    processingAction,
    resetHistory,
    showToast,
  ]);

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
    } else if (activeTab === "background") {
      void resetBackground();
      return;
    } else if (activeTab === "erase") {
      clearEraseSelection();
      return;
    } else if (activeTab === "effects") {
      for (const adjustment of EFFECT_ADJUSTMENTS) {
        (next as unknown as Record<string, unknown>)[adjustment.key] =
          adjustment.neutral;
      }
      label = "Reiniciar efectos";
    }

    commit(next, label);
  }, [
    activeTab,
    clearEraseSelection,
    commit,
    resetBackground,
  ]);

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
  }, [asset, exportFormat, exportQuality]);

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

  const changeExportFormat = useCallback(
    (format: ExportFormat) => {
      if (
        format === "jpeg" &&
        settingsRef.current.backgroundMode === "transparent"
      ) {
        showToast("La transparencia necesita PNG");
        return;
      }
      setExportFormatState(format);
    },
    [showToast],
  );

  return {
    asset,
    settings,
    settingsRef,
    displaySettings,
    exportCanvasRef,
    aiCanvasRef,
    eraseMaskCanvasRef,
    exportSize,
    aiSize,
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
    processingAction,
    exportFormat,
    exportQuality,
    exportEdge,
    eraseStrokes,
    eraseBrushSize,
    setAdjustGroup,
    setPanelExpanded,
    setShowOriginal,
    setExportFormat: changeExportFormat,
    setExportQuality,
    setExportEdge,
    setEraseBrushSize,
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
    removeBackground,
    setBackgroundMode,
    setBackgroundColors,
    pickBackgroundPhoto,
    resetBackground,
    addEraseStroke,
    undoEraseStroke,
    clearEraseSelection,
    applyObjectErase,
    resetCurrentSection,
    openTab,
    saveToPhotos,
    shareImage,
    backgroundAdjustments: BACKGROUND_ADJUSTMENTS,
    backgroundBlurAdjustment: BACKGROUND_BLUR_ADJUSTMENT,
  };
}

export type EditorController = ReturnType<typeof useEditorController>;
