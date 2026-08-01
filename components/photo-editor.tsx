"use client";

import {
  ChangeEvent,
  DragEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type EditorSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

type ExportFormat = "image/png" | "image/jpeg";

const DEFAULT_SETTINGS: EditorSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_RENDER_DIMENSION = 2400;

const adjustmentControls: Array<{
  key: keyof Pick<EditorSettings, "brightness" | "contrast" | "saturation" | "grayscale">;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "brightness", label: "Brillo", min: 0, max: 200 },
  { key: "contrast", label: "Contraste", min: 0, max: 200 },
  { key: "saturation", label: "Saturación", min: 0, max: 200 },
  { key: "grayscale", label: "Escala de grises", min: 0, max: 100 },
];

function cloneSettings(settings: EditorSettings): EditorSettings {
  return { ...settings };
}

function areSettingsEqual(a: EditorSettings, b: EditorSettings) {
  return (
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.saturation === b.saturation &&
    a.grayscale === b.grayscale &&
    a.rotation === b.rotation &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY
  );
}

export function PhotoEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const settingsRef = useRef<EditorSettings>(DEFAULT_SETTINGS);
  const historyRef = useRef<EditorSettings[]>([cloneSettings(DEFAULT_SETTINGS)]);
  const historyIndexRef = useRef(0);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("editmypic");
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("image/png");
  const [quality, setQuality] = useState(92);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const replaceSettings = useCallback((next: EditorSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const commitHistory = useCallback((next = settingsRef.current) => {
    const history = historyRef.current;
    const current = history[historyIndexRef.current];

    if (current && areSettingsEqual(current, next)) return;

    const trimmed = history.slice(0, historyIndexRef.current + 1);
    trimmed.push(cloneSettings(next));
    historyRef.current = trimmed.slice(-40);
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryVersion((version) => version + 1);
  }, []);

  const updateAndCommit = useCallback(
    (producer: (current: EditorSettings) => EditorSettings) => {
      const next = producer(settingsRef.current);
      replaceSettings(next);
      commitHistory(next);
    },
    [commitHistory, replaceSettings],
  );

  const resetHistory = useCallback((next: EditorSettings) => {
    historyRef.current = [cloneSettings(next)];
    historyIndexRef.current = 0;
    setHistoryVersion((version) => version + 1);
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      setError("");

      if (!file.type.startsWith("image/")) {
        setError("Selecciona un archivo de imagen válido.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("La imagen supera el límite de 25 MB.");
        return;
      }

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;

      const nextImage = new Image();
      nextImage.onload = () => {
        setImage(nextImage);
        setFileName(file.name.replace(/\.[^.]+$/, "") || "editmypic");
        replaceSettings(cloneSettings(DEFAULT_SETTINGS));
        resetHistory(DEFAULT_SETTINGS);
      };
      nextImage.onerror = () => {
        setError("No se pudo abrir la imagen.");
        URL.revokeObjectURL(objectUrl);
        objectUrlRef.current = null;
      };
      nextImage.src = objectUrl;
    },
    [replaceSettings, resetHistory],
  );

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const renderScale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const sourceWidth = Math.max(1, Math.round(naturalWidth * renderScale));
    const sourceHeight = Math.max(1, Math.round(naturalHeight * renderScale));
    const normalizedRotation = ((settings.rotation % 360) + 360) % 360;
    const swapsDimensions = normalizedRotation === 90 || normalizedRotation === 270;

    canvas.width = swapsDimensions ? sourceHeight : sourceWidth;
    canvas.height = swapsDimensions ? sourceWidth : sourceHeight;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((normalizedRotation * Math.PI) / 180);
    context.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
    context.filter = [
      `brightness(${settings.brightness}%)`,
      `contrast(${settings.contrast}%)`,
      `saturate(${settings.saturation}%)`,
      `grayscale(${settings.grayscale}%)`,
    ].join(" ");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    context.restore();
  }, [image, settings]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleAdjustment = (
    key: keyof Pick<EditorSettings, "brightness" | "contrast" | "saturation" | "grayscale">,
    value: number,
  ) => {
    replaceSettings({ ...settingsRef.current, [key]: value });
  };

  const handleAdjustmentCommit = (_event: PointerEvent<HTMLInputElement>) => {
    commitHistory();
  };

  const undo = () => {
    if (!canUndo) return;
    historyIndexRef.current -= 1;
    replaceSettings(cloneSettings(historyRef.current[historyIndexRef.current]));
    setHistoryVersion((version) => version + 1);
  };

  const redo = () => {
    if (!canRedo) return;
    historyIndexRef.current += 1;
    replaceSettings(cloneSettings(historyRef.current[historyIndexRef.current]));
    setHistoryVersion((version) => version + 1);
  };

  const reset = () => {
    replaceSettings(cloneSettings(DEFAULT_SETTINGS));
    commitHistory(DEFAULT_SETTINGS);
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const extension = exportFormat === "image/png" ? "png" : "jpg";
    const exportQuality = exportFormat === "image/png" ? undefined : quality / 100;

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("No se pudo exportar la imagen.");
          return;
        }

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${fileName}-edited.${extension}`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      exportFormat,
      exportQuality,
    );
  };

  const dimensions = image ? `${image.naturalWidth} × ${image.naturalHeight} px` : "Sin imagen";

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div className="brand" aria-label="EditMyPic">
          <span className="brand-mark">E</span>
          <span>EditMyPic</span>
          <span className="beta-badge">BETA</span>
        </div>

        <div className="history-actions" aria-label="Historial">
          <button className="icon-button" type="button" onClick={undo} disabled={!canUndo} title="Deshacer">
            ↶
          </button>
          <button className="icon-button" type="button" onClick={redo} disabled={!canRedo} title="Rehacer">
            ↷
          </button>
          <span className="history-count" aria-hidden="true">{historyVersion + 1}</span>
        </div>

        <div className="topbar-actions">
          <button className="button button-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            Abrir imagen
          </button>
          <button className="button button-primary" type="button" onClick={exportImage} disabled={!image}>
            Exportar
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="tool-rail" aria-label="Herramientas">
          <button className="tool-button is-active" type="button" title="Mover">↖</button>
          <button className="tool-button" type="button" title="Recortar" disabled>⌗</button>
          <button className="tool-button" type="button" title="Pincel" disabled>✎</button>
          <button className="tool-button" type="button" title="Texto" disabled>T</button>
          <span className="tool-divider" />
          <button className="tool-button" type="button" title="Rotar a la izquierda" disabled={!image} onClick={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation - 90 }))}>↺</button>
          <button className="tool-button" type="button" title="Rotar a la derecha" disabled={!image} onClick={() => updateAndCommit((current) => ({ ...current, rotation: current.rotation + 90 }))}>↻</button>
          <button className="tool-button" type="button" title="Voltear horizontalmente" disabled={!image} onClick={() => updateAndCommit((current) => ({ ...current, flipX: !current.flipX }))}>↔</button>
          <button className="tool-button" type="button" title="Voltear verticalmente" disabled={!image} onClick={() => updateAndCommit((current) => ({ ...current, flipY: !current.flipY }))}>↕</button>
        </aside>

        <div
          className={`canvas-stage ${dragActive ? "is-dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          {image ? (
            <div className="canvas-frame">
              <canvas ref={canvasRef} aria-label="Vista previa de la imagen editada" />
            </div>
          ) : (
            <button className="empty-state" type="button" onClick={() => fileInputRef.current?.click()}>
              <span className="upload-icon">＋</span>
              <strong>Arrastra una fotografía aquí</strong>
              <span>o haz clic para seleccionar una imagen</span>
              <small>PNG, JPG o WebP · máximo 25 MB</small>
            </button>
          )}

          {dragActive && <div className="drop-overlay">Suelta la imagen para editarla</div>}
          {error && <div className="error-toast" role="alert">{error}</div>}
        </div>

        <aside className="inspector">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PROPIEDADES</span>
              <h2>Ajustes</h2>
            </div>
            <button className="text-button" type="button" onClick={reset} disabled={!image}>Restablecer</button>
          </div>

          <div className="adjustments">
            {adjustmentControls.map((control) => (
              <label className="slider-control" key={control.key}>
                <span>
                  <span>{control.label}</span>
                  <output>{settings[control.key]}%</output>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  value={settings[control.key]}
                  disabled={!image}
                  onChange={(event) => handleAdjustment(control.key, Number(event.target.value))}
                  onPointerUp={handleAdjustmentCommit}
                  onKeyUp={() => commitHistory()}
                />
              </label>
            ))}
          </div>

          <div className="panel-section">
            <span className="eyebrow">EXPORTACIÓN</span>
            <label className="field-label" htmlFor="format">Formato</label>
            <select id="format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              <option value="image/png">PNG — alta calidad</option>
              <option value="image/jpeg">JPG — archivo ligero</option>
            </select>

            {exportFormat === "image/jpeg" && (
              <label className="slider-control compact">
                <span>
                  <span>Calidad</span>
                  <output>{quality}%</output>
                </span>
                <input type="range" min="40" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} />
              </label>
            )}
          </div>

          <div className="privacy-note">
            <span>◉</span>
            <p><strong>Edición privada</strong>La imagen se procesa localmente en tu navegador.</p>
          </div>
        </aside>
      </section>

      <footer className="statusbar">
        <span>{dimensions}</span>
        <span>{image ? fileName : "EditMyPic listo"}</span>
        <span>Procesamiento local</span>
      </footer>

      <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
    </main>
  );
}
