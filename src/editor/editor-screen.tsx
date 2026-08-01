import { useCallback, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EditorCanvas } from "@/components/editor-canvas";
import {
  EditorGestureSurface,
  type ViewportTransform,
} from "@/components/editor-gesture-surface";
import {
  EditorDock,
  EditorPanelBody,
} from "@/components/editor-inspector";
import { fitAspectWithin, getCropAspect } from "@/src/editor/geometry";
import { styles } from "@/src/editor/editor-styles";
import { useEditorController } from "@/src/editor/use-editor-controller";

export default function EditorScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const editor = useEditorController();
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  const isPhoneLandscape = windowWidth > windowHeight && windowHeight < 520;
  const usesBottomPanel = windowWidth < 820 && !isPhoneLandscape;
  const isNarrow = windowWidth < 410;
  const effectivePanelExpanded = usesBottomPanel
    ? editor.panelExpanded
    : true;
  const mobilePanelHeight = Math.min(
    470,
    Math.max(320, Math.round(windowHeight * 0.54)),
  );
  const sidePanelWidth = Math.min(
    390,
    Math.max(300, Math.round(windowWidth * 0.44)),
  );

  const cropFrame = useMemo(() => {
    if (!editor.asset) return null;
    return fitAspectWithin(
      canvasSize.width,
      canvasSize.height,
      getCropAspect(editor.settings, editor.asset),
      12,
    );
  }, [canvasSize.height, canvasSize.width, editor.asset, editor.settings]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({
      width: Math.max(1, width),
      height: Math.max(1, height),
    });
  }, []);

  const handleViewportChange = useCallback(
    (value: ViewportTransform) => editor.updateViewport(value),
    [editor.updateViewport],
  );

  const handleViewportComplete = useCallback(
    (value: ViewportTransform) => editor.finishViewport(value),
    [editor.finishViewport],
  );

  const openExport = useCallback(() => {
    editor.openTab("export", usesBottomPanel, true);
  }, [editor.openTab, usesBottomPanel]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>E</Text>
            </View>
            {!isNarrow ? (
              <View>
                <Text style={styles.brand}>EditMyPic</Text>
                <Text style={styles.brandTagline}>TU FOTO, MEJOR EN SEGUNDOS</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.topActions}>
            <Pressable
              accessibilityLabel="Deshacer"
              disabled={!editor.canUndo}
              onPress={editor.undo}
              style={({ pressed }) => [
                styles.iconButton,
                (!editor.canUndo || pressed) && styles.buttonMuted,
              ]}
            >
              <Text style={styles.iconText}>↶</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Rehacer"
              disabled={!editor.canRedo}
              onPress={editor.redo}
              style={({ pressed }) => [
                styles.iconButton,
                (!editor.canRedo || pressed) && styles.buttonMuted,
              ]}
            >
              <Text style={styles.iconText}>↷</Text>
            </Pressable>
            {!isNarrow ? (
              <Pressable
                accessibilityLabel="Mejora automática"
                disabled={!editor.asset}
                onPress={editor.applyAutomaticEnhancement}
                style={({ pressed }) => [
                  styles.autoTopButton,
                  !editor.asset && styles.buttonMuted,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.autoTopText}>✦ AUTO</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={editor.openPhotoMenu}
              style={({ pressed }) => [
                styles.photoButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.photoButtonText}>Foto</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Abrir opciones de guardado"
              disabled={!editor.asset}
              onPress={openExport}
              style={({ pressed }) => [
                styles.primaryIconButton,
                !editor.asset && styles.buttonMuted,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryIconText}>↑</Text>
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
            <View style={styles.canvasStage} onLayout={handleCanvasLayout}>
              {editor.asset ? (
                <>
                  <EditorGestureSurface
                    disabled={false}
                    zoom={editor.settings.zoom}
                    offsetX={editor.settings.offsetX}
                    offsetY={editor.settings.offsetY}
                    onChange={handleViewportChange}
                    onComplete={handleViewportComplete}
                    style={styles.gestureSurface}
                  >
                    <EditorCanvas
                      asset={editor.asset}
                      settings={editor.displaySettings}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      previewPadding={12}
                    />
                  </EditorGestureSurface>

                  {editor.activeTab === "crop" &&
                  effectivePanelExpanded &&
                  cropFrame ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.cropGrid,
                        {
                          left: cropFrame.x,
                          top: cropFrame.y,
                          width: cropFrame.width,
                          height: cropFrame.height,
                        },
                      ]}
                    >
                      <View
                        style={[styles.gridLineVertical, { left: "33.333%" }]}
                      />
                      <View
                        style={[styles.gridLineVertical, { left: "66.666%" }]}
                      />
                      <View
                        style={[styles.gridLineHorizontal, { top: "33.333%" }]}
                      />
                      <View
                        style={[styles.gridLineHorizontal, { top: "66.666%" }]}
                      />
                    </View>
                  ) : null}

                  <Pressable
                    onPressIn={() => editor.setShowOriginal(true)}
                    onPressOut={() => editor.setShowOriginal(false)}
                    style={[
                      styles.compareBadge,
                      editor.showOriginal && styles.compareBadgeActive,
                    ]}
                  >
                    <Text style={styles.compareText}>
                      {editor.showOriginal
                        ? "ORIGINAL"
                        : "MANTÉN PARA COMPARAR"}
                    </Text>
                  </Pressable>

                  {editor.settings.zoom > 1.01 ||
                  Math.abs(editor.settings.offsetX) > 0.01 ||
                  Math.abs(editor.settings.offsetY) > 0.01 ? (
                    <Pressable
                      accessibilityLabel="Centrar imagen"
                      onPress={editor.resetFraming}
                      style={styles.zoomBadge}
                    >
                      <Text style={styles.zoomBadgeText}>
                        {Math.round(editor.settings.zoom * 100)}% · CENTRAR
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Pressable
                  onPress={editor.openPhotoMenu}
                  style={({ pressed }) => [
                    styles.emptyState,
                    pressed && styles.emptyStatePressed,
                  ]}
                >
                  <View style={styles.uploadCircle}>
                    <Text style={styles.uploadIcon}>＋</Text>
                  </View>
                  <Text style={styles.emptyTitle}>Abre una foto</Text>
                  <Text style={styles.emptyCopy}>
                    Mejora, recorta y guarda sin subir tu imagen a ningún
                    servidor.
                  </Text>
                  <View style={styles.emptyAction}>
                    <Text style={styles.emptyActionText}>Elegir foto</Text>
                  </View>
                </Pressable>
              )}
            </View>
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
              !usesBottomPanel && { width: sidePanelWidth },
            ]}
          >
            {effectivePanelExpanded ? (
              <EditorPanelBody
                editor={editor}
                usesBottomPanel={usesBottomPanel}
              />
            ) : null}
            <EditorDock
              editor={editor}
              usesBottomPanel={usesBottomPanel}
              effectivePanelExpanded={effectivePanelExpanded}
            />
          </View>
        </View>

        {editor.toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{editor.toast}</Text>
          </View>
        ) : null}

        {editor.asset ? (
          <View pointerEvents="none" style={styles.offscreenCanvas}>
            <EditorCanvas
              ref={editor.exportCanvasRef}
              asset={editor.asset}
              settings={editor.settings}
              width={editor.exportSize.width}
              height={editor.exportSize.height}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
