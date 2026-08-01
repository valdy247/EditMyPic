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

type PanelTab = "adjust" | "transform" | "export";
type AdjustmentKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "warmth"
  | "fade"
  | "grayscale";

type Adjustment = {
  key: AdjustmentKey;
  icon: string;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  format: (value: number) => string;
};

const signedPercent = (value: number) => {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

const ADJUSTMENTS: Adjustment[] = [
  {
    key: "brightness",
    icon: "☀",
    label: "Brillo",
    minimum: 0.4,
    maximum: 1.6,
    step: 0.01,
    format: (value) => signedPercent((value - 1) * 100),
  },
  {
    key: "contrast",
    icon: "◐",
    label: "Contraste",
    minimum: 0.4,
    maximum: 1.6,
    step: 0.01,
    format: (value) => signedPercent((value - 1) * 100),
  },
  {
    key: "saturation",
    icon: "◉",
    label: "Color",
    minimum: 0,
    maximum: 2,
    step: 0.01,
    format: (value) => signedPercent((value - 1) * 100),
  },
  {
    key: "warmth",
    icon: "♨",
    label: "Temperatura",
    minimum: -1,
    maximum: 1,
    step: 0.01,
    format: (value) => signedPercent(value * 100),
  },
  {
    key: "fade",
    icon: "◌",
    label: "Desvanecer",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)}`,
  },
  {
    key: "grayscale",
    icon: "◑",
    label: "Blanco y negro",
    minimum: 0,
    maximum: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)}`,
  },
];

const TAB_LABELS: Record<PanelTab, string> = {
  adjust: "Ajustar",
  transform: "Girar",
  export: "Guardar",
};

const PANEL_TITLES: Record<PanelTab, string> = {
  adjust: "Dale tu estilo",
  transform: "Ponla en su lugar",
  export: "Tu foto está lista",
};

const PANEL_COPY: Record<PanelTab, string> = {
  adjust: "Movimientos pequeños, cambios precisos.",
  transform: "Gira o refleja sin perder calidad.",
  export: "Sácala en alta resolución y compártela.",
};

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const exportCanvasRef = useCanvasRef();
  const initialSettings = cloneSettings(DEFAULT_SETTINGS);
  const historyRef = useRef<EditorSettings[]>([initialSettings]);
  const historyIndexRef = useRef(0);
  const settingsRef = useRef<EditorSettings>(initialSettings);

  const [asset, setAsset] = useState<ImageAsset | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("adjust");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  const isPhoneLandscape = windowWidth > windowHeight && windowHeight < 500;
  const usesBottomPanel = windowWidth < 760 && !isPhoneLandscape;
  const isNarrow = windowWidth < 410;
  const effectivePanelExpanded = usesBottomPanel ? panelExpanded : true;
  const mobilePanelHeight = Math.min(
    370,
    Math.max(250, Math.round(windowHeight * 0.38)),
  );

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const displaySettings = useMemo(
    () =>
      showOriginal
        ? {
            ...DEFAULT_SETTINGS,
            rotation: settings.rotation,
            flipX: settings.flipX,
            flipY: settings.flipY,
          }
        : settings,
    [settings, showOriginal],
  );

  const exportSize = useMemo(
    () =>
      asset
        ? getExportSize(asset, settings.rotation)
        : { width: 1, height: 1 },
    [asset, settings.rotation],
  );

  const applySettings = useCallback((next: EditorSettings) => {
    const cloned = cloneSettings(next);
    settingsRef.current = cloned;
    setSettings(cloned);
  }, []);

  const resetHistory = useCallback(() => {
    const next = cloneSettings(DEFAULT_SETTINGS);
    historyRef.current = [next];
    historyIndexRef.current = 0;
    applySettings(next);
    setHistoryVersion((value) => value + 1);
  }, [applySettings]);

  const commit = useCallback(
    (next: EditorSettings) => {
      const current = historyRef.current[historyIndexRef.current];
      const cloned = cloneSettings(next);

      if (JSON.stringify(current) !== JSON.stringify(cloned)) {
        const nextHistory = [
          ...historyRef.current.slice(0, historyIndexRef.current + 1),
          cloned,
        ].slice(-100);

        historyRef.current = nextHistory;
        historyIndexRef.current = nextHistory.length - 1;
        setHistoryVersion((value) => value + 1);
      }

      applySettings(cloned);
    },
    [applySettings],
  );

  const updateAndCommit = useCallback(
    (producer: (current: EditorSettings) => EditorSettings) => {
      commit(producer(settingsRef.current));
    },
    [commit],
  );

  const updateAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      applySettings({ ...settingsRef.current, [key]: value });
    },
    [applySettings],
  );

  const finishAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      commit({ ...settingsRef.current, [key]: value });
    },
    [commit],
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
      setActiveTab("adjust");
      setPanelExpanded(false);
    },
    [resetHistory],
  );

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Abre tu fototeca",
        "Activa el acceso a Fotos para elegir la imagen que quieres mejorar.",
      );
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
      Alert.alert(
        "Activa la cámara",
        "Necesitamos la cámara para capturar una foto nueva.",
      );
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
    Alert.alert("Elige tu foto", "¿De dónde quieres traerla?", [
      { text: "Fotos", onPress: () => void pickFromLibrary() },
      { text: "Cámara", onPress: () => void takePhoto() },
      { text: "Ahora no", style: "cancel" },
    ]);
  }, [pickFromLibrary, takePhoto]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    historyIndexRef.current -= 1;
    applySettings(historyRef.current[historyIndexRef.current]);
    setHistoryVersion((value) => value + 1);
  }, [applySettings, canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    historyIndexRef.current += 1;
    applySettings(historyRef.current[historyIndexRef.current]);
    setHistoryVersion((value) => value + 1);
  }, [applySettings, canRedo]);

  const exportImage = useCallback(async () => {
    if (!asset || exporting) return;
    setExporting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const snapshot = await exportCanvasRef.current?.makeImageSnapshotAsync();

      if (!snapshot) {
        throw new Error("No pudimos preparar la imagen.");
      }

      const output = new File(
        Paths.cache,
        `${asset.fileName}-${Date.now()}.png`,
      );
      output.write(snapshot.encodeToBytes());

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Compartir no está disponible en este dispositivo.");
      }

      await Sharing.shareAsync(output.uri, { UTI: "public.png" });
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2400);
    } catch (error) {
      Alert.alert(
        "No salió esta vez",
        error instanceof Error ? error.message : "Prueba nuevamente.",
      );
    } finally {
      setExporting(false);
    }
  }, [asset, exporting, exportCanvasRef]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({
      width: Math.max(1, width),
      height: Math.max(1, height),
    });
  }, []);

  const reset = useCallback(() => {
    commit(cloneSettings(DEFAULT_SETTINGS));
  }, [commit]);

  const openTab = useCallback((tab: PanelTab) => {
    setActiveTab(tab);
    setPanelExpanded(true);
  }, []);

  const renderPanelContent = () => {
    if (activeTab === "transform") {
      return (
        <View style={styles.transformGrid}>
          <ToolButton
            label="↺"
            caption="Izquierda"
            disabled={!asset}
            onPress={() =>
              updateAndCommit((current) => ({
                ...current,
                rotation: current.rotation - 90,
              }))
            }
          />
          <ToolButton
            label="↻"
            caption="Derecha"
            disabled={!asset}
            onPress={() =>
              updateAndCommit((current) => ({
                ...current,
                rotation: current.rotation + 90,
              }))
            }
          />
          <ToolButton
            label="↔"
            caption="Espejo H"
            disabled={!asset}
            onPress={() =>
              updateAndCommit((current) => ({
                ...current,
                flipX: !current.flipX,
              }))
            }
          />
          <ToolButton
            label="↕"
            caption="Espejo V"
            disabled={!asset}
            onPress={() =>
              updateAndCommit((current) => ({
                ...current,
                flipY: !current.flipY,
              }))
            }
          />
        </View>
      );
    }

    if (activeTab === "export") {
      return (
        <View style={styles.exportCard}>
          <Text style={styles.exportTitle}>Lista para compartir</Text>
          <Text style={styles.exportCopy}>
            PNG nítido, con todos tus cambios y hasta 4096 px.
          </Text>
          <Text style={styles.exportMeta}>
            {asset
              ? `${exportSize.width} × ${exportSize.height} px`
              : "Primero elige una foto"}
          </Text>
          <Pressable
            disabled={!asset || exporting}
            onPress={() => void exportImage()}
            style={({ pressed }) => [
              styles.exportButton,
              (!asset || exporting) && styles.buttonMuted,
              pressed && styles.buttonPressed,
            ]}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.exportButtonText}>Guardar o compartir</Text>
            )}
          </Pressable>
        </View>
      );
    }

    return ADJUSTMENTS.map((adjustment) => (
      <View key={adjustment.key} style={styles.adjustment}>
        <View style={styles.adjustmentHeader}>
          <View style={styles.adjustmentName}>
            <Text style={styles.adjustmentIcon}>{adjustment.icon}</Text>
            <Text style={styles.adjustmentLabel}>{adjustment.label}</Text>
          </View>
          <Text style={styles.adjustmentValue}>
            {adjustment.format(settings[adjustment.key])}
          </Text>
        </View>
        <EditorSlider
          disabled={!asset}
          minimumValue={adjustment.minimum}
          maximumValue={adjustment.maximum}
          step={adjustment.step}
          value={settings[adjustment.key]}
          onValueChange={(value) =>
            updateAdjustment(adjustment.key, value)
          }
          onSlidingComplete={(value) =>
            finishAdjustment(adjustment.key, value)
          }
        />
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>E</Text>
            </View>
            {!isNarrow ? <Text style={styles.brand}>EditMyPic</Text> : null}
          </View>

          <View style={styles.topActions}>
            <Pressable
              accessibilityLabel="Deshacer"
              disabled={!canUndo}
              onPress={undo}
              style={({ pressed }) => [
                styles.iconButton,
                (!canUndo || pressed) && styles.buttonMuted,
              ]}
            >
              <Text style={styles.iconText}>↶</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Rehacer"
              disabled={!canRedo}
              onPress={redo}
              style={({ pressed }) => [
                styles.iconButton,
                (!canRedo || pressed) && styles.buttonMuted,
              ]}
            >
              <Text style={styles.iconText}>↷</Text>
            </Pressable>
            <Pressable
              onPress={openPhotoMenu}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Foto</Text>
            </Pressable>
            <Pressable
              disabled={!asset || exporting}
              onPress={() => void exportImage()}
              style={({ pressed }) => [
                styles.primaryButton,
                (!asset || exporting) && styles.buttonMuted,
                pressed && styles.buttonPressed,
              ]}
            >
              {exporting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Guardar</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.workspace,
            usesBottomPanel && styles.workspaceCompact,
          ]}
        >
          <View style={styles.editorColumn}>
            <Pressable
              onLayout={handleCanvasLayout}
              onPress={!asset ? openPhotoMenu : undefined}
              onPressIn={() => {
                if (asset) setShowOriginal(true);
              }}
              onPressOut={() => setShowOriginal(false)}
              style={({ pressed }) => [
                styles.canvasStage,
                pressed && asset && styles.canvasPressed,
              ]}
            >
              {asset ? (
                <>
                  <EditorCanvas
                    asset={asset}
                    settings={displaySettings}
                    width={canvasSize.width}
                    height={canvasSize.height}
                  />
                  <View pointerEvents="none" style={styles.compareBadge}>
                    <Text style={styles.compareText}>
                      {showOriginal
                        ? "ORIGINAL"
                        : "MANTÉN PULSADO PARA COMPARAR"}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.uploadCircle}>
                    <Text style={styles.uploadIcon}>＋</Text>
                  </View>
                  <Text style={styles.emptyTitle}>Empieza con una foto</Text>
                  <Text style={styles.emptyCopy}>
                    Elige una de Fotos o toma una nueva. Tus imágenes se editan
                    dentro del iPhone.
                  </Text>
                  <View style={styles.emptyAction}>
                    <Text style={styles.emptyActionText}>Abrir foto</Text>
                  </View>
                </View>
              )}
            </Pressable>
          </View>

          <View
            style={[
              styles.inspector,
              usesBottomPanel && styles.inspectorCompact,
              usesBottomPanel &&
                effectivePanelExpanded && {
                  height: mobilePanelHeight,
                  minHeight: mobilePanelHeight,
                  maxHeight: mobilePanelHeight,
                },
              usesBottomPanel &&
                !effectivePanelExpanded &&
                styles.inspectorCollapsed,
            ]}
          >
            {!effectivePanelExpanded ? (
              <Pressable
                onPress={() => setPanelExpanded(true)}
                style={({ pressed }) => [
                  styles.collapsedBar,
                  pressed && styles.collapsedBarPressed,
                ]}
              >
                <View>
                  <Text style={styles.collapsedTitle}>Herramientas</Text>
                  <Text style={styles.collapsedCopy}>
                    {TAB_LABELS[activeTab]} · toca para abrir
                  </Text>
                </View>
                <Text style={styles.collapsedChevron}>⌃</Text>
              </Pressable>
            ) : (
              <>
                {usesBottomPanel ? (
                  <Pressable
                    onPress={() => setPanelExpanded(false)}
                    style={styles.sheetTopRow}
                  >
                    <View style={styles.sheetHandle} />
                    <Text style={styles.sheetHideText}>Ocultar</Text>
                  </Pressable>
                ) : null}

                <View style={styles.tabBar}>
                  {(
                    [
                      ["adjust", "☀  Ajustar"],
                      ["transform", "↻  Girar"],
                      ["export", "↑  Guardar"],
                    ] as [PanelTab, string][]
                  ).map(([key, label]) => (
                    <Pressable
                      key={key}
                      onPress={() => openTab(key)}
                      style={[
                        styles.tabButton,
                        activeTab === key && styles.tabButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          activeTab === key && styles.tabTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <ScrollView
                  style={styles.panelScroll}
                  contentContainerStyle={styles.inspectorContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.panelHeader}>
                    <View style={styles.panelHeading}>
                      <Text style={styles.panelTitle}>
                        {PANEL_TITLES[activeTab]}
                      </Text>
                      <Text style={styles.panelCopy}>
                        {PANEL_COPY[activeTab]}
                      </Text>
                    </View>
                    {activeTab === "adjust" ? (
                      <Pressable disabled={!asset} onPress={reset}>
                        <Text
                          style={[
                            styles.resetText,
                            !asset && styles.textMuted,
                          ]}
                        >
                          Reiniciar
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {renderPanelContent()}

                  {asset ? (
                    <Text style={styles.historyMeta}>
                      {historyVersion + 1} cambios disponibles para deshacer
                    </Text>
                  ) : null}
                </ScrollView>
              </>
            )}
          </View>
        </View>

        {savedMessage ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>
              Listo. Ahora elige “Guardar imagen” o compártela.
            </Text>
          </View>
        ) : null}

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
