import { memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { EditorCanvas } from "@/components/editor-canvas";
import { EditorSlider } from "@/components/editor-slider";
import { ToolButton } from "@/components/tool-button";
import {
  COLOR_ADJUSTMENTS,
  CROP_ADJUSTMENTS,
  CROP_PRESETS,
  EFFECT_ADJUSTMENTS,
  LIGHT_ADJUSTMENTS,
  PANEL_COPY,
  PANEL_TITLES,
  TAB_ITEMS,
  formatBytes,
  type AdjustGroup,
  type Adjustment,
  type ExportEdge,
  type ExportFormat,
} from "@/src/editor/editor-config";
import { styles } from "@/src/editor/editor-styles";
import { FILTER_PRESETS } from "@/src/editor/presets";
import type { EditorController } from "@/src/editor/use-editor-controller";
import {
  DEFAULT_SETTINGS,
  type EditorSettings,
  type FilterId,
  type ImageAsset,
} from "@/src/editor/types";

const FILTER_PREVIEW_SETTINGS = Object.fromEntries(
  FILTER_PRESETS.map((preset) => [
    preset.id,
    {
      ...DEFAULT_SETTINGS,
      filterId: preset.id,
      filterIntensity: 0.85,
    } satisfies EditorSettings,
  ]),
) as Record<FilterId, EditorSettings>;

const FilterThumbnail = memo(function FilterThumbnail({
  asset,
  filterId,
  accent,
}: {
  asset: ImageAsset | null;
  filterId: FilterId;
  accent: string;
}) {
  return asset ? (
    <EditorCanvas
      asset={asset}
      settings={FILTER_PREVIEW_SETTINGS[filterId]}
      width={86}
      height={72}
    />
  ) : (
    <View style={[styles.filterPlaceholder, { backgroundColor: accent }]} />
  );
});

export function EditorDock({
  editor,
  usesBottomPanel,
  effectivePanelExpanded,
}: {
  editor: EditorController;
  usesBottomPanel: boolean;
  effectivePanelExpanded: boolean;
}) {
  return (
    <View style={styles.toolDock}>
      {TAB_ITEMS.map((tab) => {
        const active =
          editor.activeTab === tab.id && effectivePanelExpanded;
        return (
          <Pressable
            key={tab.id}
            accessibilityLabel={tab.label}
            onPress={() => editor.openTab(tab.id, usesBottomPanel)}
            style={({ pressed }) => [
              styles.dockItem,
              active && styles.dockItemActive,
              pressed && styles.dockItemPressed,
            ]}
          >
            <Text style={[styles.dockIcon, active && styles.dockIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.dockLabel, active && styles.dockLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EditorPanelBody({
  editor,
  usesBottomPanel,
}: {
  editor: EditorController;
  usesBottomPanel: boolean;
}) {
  const renderAdjustment = (adjustment: Adjustment) => (
    <View key={adjustment.key} style={styles.adjustment}>
      <View style={styles.adjustmentHeader}>
        <View style={styles.adjustmentName}>
          <Text style={styles.adjustmentIcon}>{adjustment.icon}</Text>
          <Text style={styles.adjustmentLabel}>{adjustment.label}</Text>
        </View>
        <Pressable
          accessibilityLabel={`Reiniciar ${adjustment.label}`}
          disabled={!editor.asset}
          onPress={() => editor.resetAdjustment(adjustment)}
          style={styles.valuePill}
        >
          <Text style={styles.adjustmentValue}>
            {adjustment.format(editor.settings[adjustment.key])}
          </Text>
        </Pressable>
      </View>
      <EditorSlider
        disabled={!editor.asset}
        minimumValue={adjustment.minimum}
        maximumValue={adjustment.maximum}
        step={adjustment.step}
        value={editor.settings[adjustment.key]}
        onValueChange={(value) => editor.updateAdjustment(adjustment, value)}
        onSlidingComplete={(value) =>
          editor.finishAdjustment(adjustment, value)
        }
      />
    </View>
  );

  const renderLooks = () => (
    <>
      <Pressable
        disabled={!editor.asset}
        onPress={editor.applyAutomaticEnhancement}
        style={({ pressed }) => [
          styles.autoCard,
          !editor.asset && styles.buttonMuted,
          pressed && styles.buttonPressed,
        ]}
      >
        <View style={styles.autoIcon}>
          <Text style={styles.autoIconText}>✦</Text>
        </View>
        <View style={styles.autoCopy}>
          <Text style={styles.autoTitle}>Mejora automática</Text>
          <Text style={styles.autoSubtitle}>
            Equilibra luz, color y detalle sin bloquear los controles.
          </Text>
        </View>
        <Text style={styles.autoChevron}>›</Text>
      </Pressable>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>LOOKS</Text>
        <Pressable disabled={!editor.asset} onPress={editor.saveCurrentLook}>
          <Text
            style={[
              styles.inlineAction,
              !editor.asset && styles.textMuted,
            ]}
          >
            Guardar mi look
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTER_PRESETS.map((preset) => {
          const selected = editor.settings.filterId === preset.id;
          return (
            <Pressable
              key={preset.id}
              disabled={!editor.asset}
              onPress={() => editor.selectFilter(preset.id)}
              style={[
                styles.filterCard,
                selected && styles.filterCardActive,
              ]}
            >
              <View style={styles.filterPreview}>
                <FilterThumbnail
                  asset={editor.asset}
                  filterId={preset.id}
                  accent={preset.accent}
                />
                {selected ? (
                  <View style={styles.filterCheck}>
                    <Text style={styles.filterCheckText}>✓</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.filterLabel,
                  selected && styles.filterLabelActive,
                ]}
              >
                {preset.label}
              </Text>
              <Text style={styles.filterSubtitle}>{preset.subtitle}</Text>
            </Pressable>
          );
        })}

        {editor.savedLook ? (
          <Pressable
            disabled={!editor.asset}
            onPress={editor.applySavedLook}
            style={styles.filterCard}
          >
            <View style={[styles.filterPreview, styles.savedLookPreview]}>
              <Text style={styles.savedLookIcon}>★</Text>
            </View>
            <Text style={styles.filterLabel}>Mi look</Text>
            <Text style={styles.filterSubtitle}>Tu estilo</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {editor.settings.filterId !== "none" ? (
        <View style={styles.filterIntensity}>
          <View style={styles.adjustmentHeader}>
            <Text style={styles.adjustmentLabel}>Intensidad</Text>
            <Text style={styles.adjustmentValue}>
              {Math.round(editor.settings.filterIntensity * 100)}
            </Text>
          </View>
          <EditorSlider
            disabled={!editor.asset}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={editor.settings.filterIntensity}
            onValueChange={(value) =>
              editor.applySettings({
                ...editor.settingsRef.current,
                filterIntensity: value,
              })
            }
            onSlidingComplete={(value) =>
              editor.commit(
                {
                  ...editor.settingsRef.current,
                  filterIntensity: value,
                },
                "Intensidad del look",
              )
            }
          />
        </View>
      ) : null}
    </>
  );

  const renderAdjust = () => (
    <>
      <View style={styles.segmentedControl}>
        {(["light", "color"] as AdjustGroup[]).map((group) => (
          <Pressable
            key={group}
            onPress={() => editor.setAdjustGroup(group)}
            style={[
              styles.segmentButton,
              editor.adjustGroup === group && styles.segmentButtonActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                editor.adjustGroup === group && styles.segmentTextActive,
              ]}
            >
              {group === "light" ? "Luz" : "Color"}
            </Text>
          </Pressable>
        ))}
      </View>
      {(editor.adjustGroup === "light"
        ? LIGHT_ADJUSTMENTS
        : COLOR_ADJUSTMENTS
      ).map(renderAdjustment)}
    </>
  );

  const renderCrop = () => (
    <>
      <Text style={styles.sectionLabel}>FORMATO</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cropPresetRow}
      >
        {CROP_PRESETS.map((preset) => {
          const selected = editor.settings.cropPreset === preset.id;
          return (
            <Pressable
              key={preset.id}
              disabled={!editor.asset}
              onPress={() =>
                editor.updateAndCommit(
                  (current) => ({
                    ...current,
                    cropPreset: preset.id,
                    zoom: 1,
                    offsetX: 0,
                    offsetY: 0,
                  }),
                  `Formato ${preset.label}`,
                )
              }
              style={[
                styles.cropPreset,
                selected && styles.cropPresetActive,
              ]}
            >
              <Text
                style={[
                  styles.cropRatio,
                  selected && styles.cropRatioActive,
                ]}
              >
                {preset.ratio}
              </Text>
              <Text
                style={[
                  styles.cropPresetLabel,
                  selected && styles.cropPresetLabelActive,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {editor.settings.cropPreset === "free" ? (
        <View style={styles.freeAspectCard}>
          <View style={styles.adjustmentHeader}>
            <Text style={styles.adjustmentLabel}>Proporción libre</Text>
            <Text style={styles.adjustmentValue}>
              {editor.settings.freeAspect.toFixed(2)}
            </Text>
          </View>
          <EditorSlider
            disabled={!editor.asset}
            minimumValue={0.5}
            maximumValue={2}
            step={0.01}
            value={editor.settings.freeAspect}
            onValueChange={(value) =>
              editor.applySettings({
                ...editor.settingsRef.current,
                freeAspect: value,
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
              })
            }
            onSlidingComplete={(value) =>
              editor.commit(
                { ...editor.settingsRef.current, freeAspect: value },
                "Proporción libre",
              )
            }
          />
        </View>
      ) : null}

      <View style={styles.transformGrid}>
        <ToolButton
          label="↺"
          caption="Izquierda"
          disabled={!editor.asset}
          onPress={() =>
            editor.updateAndCommit(
              (current) => ({
                ...current,
                rotation: current.rotation - 90,
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
              }),
              "Girar izquierda",
            )
          }
        />
        <ToolButton
          label="↻"
          caption="Derecha"
          disabled={!editor.asset}
          onPress={() =>
            editor.updateAndCommit(
              (current) => ({
                ...current,
                rotation: current.rotation + 90,
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
              }),
              "Girar derecha",
            )
          }
        />
        <ToolButton
          label="↔"
          caption="Espejo H"
          disabled={!editor.asset}
          onPress={() =>
            editor.updateAndCommit(
              (current) => ({ ...current, flipX: !current.flipX }),
              "Espejo horizontal",
            )
          }
        />
        <ToolButton
          label="↕"
          caption="Espejo V"
          disabled={!editor.asset}
          onPress={() =>
            editor.updateAndCommit(
              (current) => ({ ...current, flipY: !current.flipY }),
              "Espejo vertical",
            )
          }
        />
      </View>

      {CROP_ADJUSTMENTS.map(renderAdjustment)}

      <Pressable
        disabled={!editor.asset}
        onPress={editor.resetFraming}
        style={({ pressed }) => [
          styles.softButton,
          !editor.asset && styles.buttonMuted,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.softButtonText}>Centrar y ajustar a pantalla</Text>
      </Pressable>
      <Text style={styles.gestureHint}>
        Pellizca para acercar · arrastra para mover · doble toque para centrar.
      </Text>
    </>
  );

  const renderExport = () => (
    <View style={styles.exportStack}>
      <View style={styles.exportSummary}>
        <View>
          <Text style={styles.exportSummaryLabel}>SALIDA</Text>
          <Text style={styles.exportDimensions}>
            {editor.exportSize.width} × {editor.exportSize.height} px
          </Text>
        </View>
        <View style={styles.sizeBadge}>
          <Text style={styles.sizeBadgeText}>
            ≈ {formatBytes(editor.estimatedBytes)}
          </Text>
        </View>
      </View>

      <Text style={styles.optionLabel}>Formato</Text>
      <View style={styles.optionRow}>
        {(["jpeg", "png"] as ExportFormat[]).map((format) => (
          <Pressable
            key={format}
            onPress={() => editor.setExportFormat(format)}
            style={[
              styles.optionChip,
              editor.exportFormat === format && styles.optionChipActive,
            ]}
          >
            <Text
              style={[
                styles.optionChipText,
                editor.exportFormat === format &&
                  styles.optionChipTextActive,
              ]}
            >
              {format.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {editor.exportFormat === "jpeg" ? (
        <>
          <Text style={styles.optionLabel}>Calidad</Text>
          <View style={styles.optionRow}>
            {[75, 90, 100].map((quality) => (
              <Pressable
                key={quality}
                onPress={() => editor.setExportQuality(quality)}
                style={[
                  styles.optionChip,
                  editor.exportQuality === quality && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    editor.exportQuality === quality &&
                      styles.optionChipTextActive,
                  ]}
                >
                  {quality === 75
                    ? "Ligera"
                    : quality === 90
                      ? "Alta"
                      : "Máxima"}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.optionLabel}>Resolución</Text>
      <View style={styles.optionRow}>
        {([4096, 2048, 1080] as ExportEdge[]).map((edge) => (
          <Pressable
            key={edge}
            onPress={() => editor.setExportEdge(edge)}
            style={[
              styles.optionChip,
              editor.exportEdge === edge && styles.optionChipActive,
            ]}
          >
            <Text
              style={[
                styles.optionChipText,
                editor.exportEdge === edge && styles.optionChipTextActive,
              ]}
            >
              {edge === 4096 ? "Máxima" : `${edge}px`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.privacyCard}>
        <Text style={styles.privacyIcon}>⌾</Text>
        <View style={styles.privacyCopy}>
          <Text style={styles.privacyTitle}>Exportación privada</Text>
          <Text style={styles.privacyText}>
            La copia nueva no conserva ubicación ni metadatos de la foto
            original.
          </Text>
        </View>
      </View>

      <Pressable
        disabled={!editor.asset || editor.exportingAction !== null}
        onPress={() => void editor.saveToPhotos()}
        style={({ pressed }) => [
          styles.savePhotosButton,
          (!editor.asset || editor.exportingAction !== null) &&
            styles.buttonMuted,
          pressed && styles.buttonPressed,
        ]}
      >
        {editor.exportingAction === "save" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.savePhotosText}>Guardar en Fotos</Text>
        )}
      </Pressable>

      <Pressable
        disabled={!editor.asset || editor.exportingAction !== null}
        onPress={() => void editor.shareImage()}
        style={({ pressed }) => [
          styles.shareButton,
          (!editor.asset || editor.exportingAction !== null) &&
            styles.buttonMuted,
          pressed && styles.buttonPressed,
        ]}
      >
        {editor.exportingAction === "share" ? (
          <ActivityIndicator color="#d8ceff" />
        ) : (
          <Text style={styles.shareButtonText}>Compartir…</Text>
        )}
      </Pressable>
    </View>
  );

  const renderPanelContent = () => {
    switch (editor.activeTab) {
      case "looks":
        return renderLooks();
      case "adjust":
        return renderAdjust();
      case "crop":
        return renderCrop();
      case "effects":
        return <>{EFFECT_ADJUSTMENTS.map(renderAdjustment)}</>;
      case "export":
        return renderExport();
    }
  };

  return (
    <View style={styles.panelBody}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeading}>
          <Text style={styles.panelTitle}>
            {PANEL_TITLES[editor.activeTab]}
          </Text>
          <Text style={styles.panelCopy}>
            {PANEL_COPY[editor.activeTab]}
          </Text>
        </View>
        <View style={styles.panelHeaderActions}>
          {editor.activeTab !== "export" ? (
            <Pressable
              disabled={!editor.asset}
              onPress={editor.resetCurrentSection}
            >
              <Text
                style={[
                  styles.resetText,
                  !editor.asset && styles.textMuted,
                ]}
              >
                Reiniciar
              </Text>
            </Pressable>
          ) : null}
          {usesBottomPanel ? (
            <Pressable
              accessibilityLabel="Ocultar herramientas"
              onPress={() => editor.setPanelExpanded(false)}
              style={styles.closePanelButton}
            >
              <Text style={styles.closePanelText}>⌄</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.inspectorContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderPanelContent()}
        {editor.asset && editor.activeTab !== "export" ? (
          <Text style={styles.historyMeta}>
            Último cambio: {editor.lastHistoryLabel} · {editor.historyVersion + 1}{" "}
            estados
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
