import React, { useEffect, useRef, useState } from "react";

type Mode = "image" | "text";
type Model = "gen4.5" | "kling";
type Ratio = "720:1280" | "1280:720";
type Job = {
  id: string;
  status: string;
  output: string[];
  failure?: string;
  prompt: string;
  model: Model;
  mode: Mode;
  ratio: Ratio;
  duration: number;
  createdAt: number;
};

const STORAGE_KEY = "editmypic:web-video-history:v1";
// Web always uses same-origin API routes (including EAS preview URLs).
const API = "/api/v1/video";
const FINISHED = ["SUCCEEDED", "FAILED", "CANCELED"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

function getOutputs(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && /^https:\/\//i.test(item))
    : [];
}

async function readImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Selecciona una imagen JPG, PNG o WebP.");
  }
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
  if (source.length <= 4_200_000) return source;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("No se pudo preparar la imagen."));
    element.src = source;
  });

  for (const limit of [1800, 1400, 1100]) {
    const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Tu navegador no permite procesar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL("image/jpeg", 0.8);
    if (compressed.length <= 4_200_000) return compressed;
  }
  throw new Error("La imagen es demasiado grande. Prueba con otra.");
}

function labelForStatus(status: string) {
  if (status === "SUCCEEDED") return "Completado";
  if (status === "FAILED") return "Falló";
  if (status === "CANCELED") return "Cancelado";
  if (status === "RUNNING") return "Generando";
  return "En espera";
}

export default function WebVideoStudio() {
  const [mode, setMode] = useState<Mode>("image");
  const [model, setModel] = useState<Model>("kling");
  const [ratio, setRatio] = useState<Ratio>("720:1280");
  const [duration, setDuration] = useState(10);
  const [prompt, setPrompt] = useState("");
  const [imageData, setImageData] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageName, setImageName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [recoverId, setRecoverId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pollInFlight = useRef(new Set<string>());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const safe = parsed.filter((item): item is Job =>
            !!item && typeof item.id === "string" && typeof item.status === "string"
          ).slice(0, 30).map((item) => ({
            ...item,
            output: getOutputs(item.output),
          }));
          setJobs(safe);
          if (safe[0]) setSelectedId(safe[0].id);
        }
      }
    } catch {
      setNotice("No fue posible cargar el historial de este navegador.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 30)));
    } catch {
      setNotice("El navegador no permite guardar el historial local.");
    }
  }, [jobs, loaded]);

  async function refreshJob(id: string, showError = false) {
    if (pollInFlight.current.has(id)) return;
    pollInFlight.current.add(id);
    try {
      const response = await fetch(API + "?id=" + encodeURIComponent(id), { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { window.location.reload(); return; }
      if (!response.ok) throw new Error(data.error || "No se pudo consultar el video.");
      setJobs((previous) => previous.map((job) =>
        job.id === id ? {
          ...job,
          status: typeof data.status === "string" ? data.status : job.status,
          output: getOutputs(data.output),
          failure: typeof data.failure === "string" ? data.failure : undefined,
        } : job
      ));
      if (showError) setNotice("Estado actualizado.");
    } catch (err) {
      if (showError) setError(errorMessage(err));
    } finally {
      pollInFlight.current.delete(id);
    }
  }

  useEffect(() => {
    if (!loaded) return;
    const pendingIds = jobs.filter((job) => !FINISHED.includes(job.status)).map((job) => job.id);
    if (!pendingIds.length) return;
    const timer = window.setInterval(() => {
      pendingIds.forEach((id) => { void refreshJob(id); });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loaded, jobs]);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    setUploading(true);
    try {
      const data = await readImage(file);
      setImageData(data);
      setImagePreview(data);
      setImageName(file.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function generate() {
    if (busy || uploading || prompt.trim().length < 3 || (mode === "image" && !imageData)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), mode, imageUrl: mode === "image" ? imageData : "", ratio, duration, videoModel: model }),
      });
      const data = await response.json();
      if (response.status === 401) { window.location.reload(); return; }
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar la generación.");
      if (typeof data.id !== "string") throw new Error("El servidor no devolvió un ID de tarea.");
      const next: Job = {
        id: data.id,
        status: "PENDING",
        output: [],
        prompt: prompt.trim(),
        model,
        mode,
        ratio,
        duration,
        createdAt: Date.now(),
      };
      setJobs((previous) => [next, ...previous.filter((item) => item.id !== next.id)].slice(0, 30));
      setSelectedId(next.id);
      setNotice("Generación iniciada. Puedes seguir trabajando mientras se procesa.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    const id = recoverId.trim();
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
      setError("Introduce un ID de tarea válido de Runway.");
      return;
    }
    setError("");
    setNotice("");
    if (jobs.some((job) => job.id === id)) {
      setSelectedId(id);
      await refreshJob(id, true);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(API + "?id=" + encodeURIComponent(id), { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { window.location.reload(); return; }
      if (!response.ok) throw new Error(data.error || "No se encontró la tarea en esta cuenta.");
      const next: Job = {
        id,
        status: typeof data.status === "string" ? data.status : "PENDING",
        output: getOutputs(data.output),
        failure: typeof data.failure === "string" ? data.failure : undefined,
        prompt: "Video recuperado mediante ID",
        model: "gen4.5",
        mode: "image",
        ratio: "720:1280",
        duration: 5,
        createdAt: Date.now(),
      };
      setJobs((previous) => [next, ...previous].slice(0, 30));
      setSelectedId(id);
      setRecoverId("");
      setNotice("Tarea añadida al historial de este navegador.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = jobs.find((job) => job.id === selectedId) || jobs[0];
  const videoUrl = selected?.status === "SUCCEEDED" ? selected.output[0] : undefined;
  const canGenerate = prompt.trim().length >= 3 && (mode === "text" || !!imageData) && !busy && !uploading;

  return (
    <div className="emp-app">
      <style>{STYLES}</style>
      <aside className="emp-sidebar">
        <div className="emp-brand"><span className="emp-logo">✦</span><span>EditMyPic<small>CREATOR STUDIO</small></span></div>
        <div className="emp-side-section">WORKSPACE</div>
        <div className="emp-nav active">◈ <span>AI Video Studio</span></div>
        <div className="emp-side-section emp-side-gap">TU ESTUDIO</div>
        <div className="emp-nav muted">▤ <span>Historial local</span><b>{jobs.length}</b></div>
        <div className="emp-sidebar-bottom">
          <div className="emp-dot" /> Versión web para computadora
          <p>El editor de iPhone sigue funcionando por separado.</p>
        </div>
      </aside>

      <main className="emp-main">
        <header className="emp-topbar"><div className="emp-breadcrumb">Workspace <span>/</span> AI Video Studio</div><div className="emp-top-actions"><span className="emp-top-pill">● &nbsp; CREATOR MODE</span><button type="button" className="emp-logout" onClick={async () => { await fetch("/api/v1/session", { method: "DELETE" }); window.location.reload(); }}>Cerrar sesión</button></div></header>
        <div className="emp-page">
          <div className="emp-hero">
            <div className="emp-eyebrow">TU ESTUDIO CREATIVO CON IA</div>
            <h1>Convierte tus ideas <em>en movimiento.</em></h1>
            <p>De una imagen a una escena cinematográfica. Crea, revisa y recupera tus videos desde tu PC.</p>
          </div>

          <div className="emp-columns">
            <section className="emp-panel emp-create">
              <div className="emp-panel-heading"><div><div className="emp-step">01 / CREAR</div><h2>Nueva generación</h2></div><span className="emp-panel-symbol">✳</span></div>
              <label className="emp-label">Tipo de creación</label>
              <div className="emp-toggle">
                <button type="button" className={mode === "image" ? "chosen" : ""} onClick={() => setMode("image")}>▧ &nbsp; Imagen a video</button>
                <button type="button" className={mode === "text" ? "chosen" : ""} onClick={() => setMode("text")}>✎ &nbsp; Texto a video</button>
              </div>

              {mode === "image" && (
                <div className="emp-field">
                  <label className="emp-label">Imagen de referencia</label>
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} style={{ display: "none" }} />
                  <button type="button" className={"emp-upload " + (imagePreview ? "has-image" : "")} onClick={() => fileInput.current?.click()} disabled={uploading}>
                    {imagePreview ? <img src={imagePreview} alt="Vista previa de referencia" /> : <span className="emp-upload-icon">↑</span>}
                    <span><strong>{uploading ? "Preparando imagen..." : imageName || "Selecciona una imagen"}</strong><small>JPG, PNG o WebP · Se optimiza automáticamente</small></span>
                    <span className="emp-upload-cta">Explorar</span>
                  </button>
                </div>
              )}

              <div className="emp-field">
                <div className="emp-label-row"><label className="emp-label" htmlFor="emp-prompt">Describe tu escena</label><span>{prompt.length} / 1000</span></div>
                <textarea id="emp-prompt" maxLength={1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ej.: A cinematic 3D animated scene. The strawberry character pours jam across two Instagram posts while the banana reacts..." />
                <div className="emp-hint">Consejo: indica acciones por segundos y escribe el diálogo exacto en español.</div>
              </div>

              <div className="emp-field"><label className="emp-label">Motor de generación</label>
                <div className="emp-options two">
                  <button type="button" className={model === "kling" ? "selected" : ""} onClick={() => setModel("kling")}><strong>Kling 3.0 Pro</strong><small>Video + audio</small></button>
                  <button type="button" className={model === "gen4.5" ? "selected" : ""} onClick={() => setModel("gen4.5")}><strong>Runway Gen-4.5</strong><small>Video cinematográfico</small></button>
                </div>
              </div>

              <div className="emp-settings">
                <div><label className="emp-label">Duración</label><div className="emp-options"><button type="button" className={duration === 5 ? "selected" : ""} onClick={() => setDuration(5)}>5s</button><button type="button" className={duration === 10 ? "selected" : ""} onClick={() => setDuration(10)}>10s</button></div></div>
                <div><label className="emp-label">Formato</label><div className="emp-options"><button type="button" className={ratio === "720:1280" ? "selected" : ""} onClick={() => setRatio("720:1280")}>▯ 9:16</button><button type="button" className={ratio === "1280:720" ? "selected" : ""} onClick={() => setRatio("1280:720")}>▭ 16:9</button></div></div>
              </div>
              <button type="button" className="emp-generate" disabled={!canGenerate} onClick={() => { void generate(); }}>{busy ? "Procesando solicitud..." : "✦  Generar video"}</button>
              <p className="emp-credit-note">Cada generación consume créditos de tu cuenta Runway. Revisa el costo antes de generar.</p>
              {error && <div role="alert" className="emp-message error">{error}</div>}
              {notice && <div role="status" className="emp-message success">{notice}</div>}
            </section>

            <div className="emp-right">
              <section className="emp-panel emp-preview">
                <div className="emp-panel-heading"><div><div className="emp-step">02 / RESULTADO</div><h2>Vista previa</h2></div>{selected && <span className={"emp-status " + (selected.status === "SUCCEEDED" ? "done" : "")}>{labelForStatus(selected.status)}</span>}</div>
                <div className={"emp-stage " + (selected?.ratio === "1280:720" ? "wide" : "")}>
                  {videoUrl ? <video key={videoUrl} src={videoUrl} controls playsInline preload="metadata" /> : <div className="emp-stage-empty"><span>✧</span><strong>{selected ? labelForStatus(selected.status) : "Tu próxima creación"}</strong><small>{selected?.failure || (selected ? "La vista previa aparecerá cuando termine el procesamiento." : "Tu video aparecerá aquí cuando lo generes.")}</small></div>}
                </div>
                {selected && <div className="emp-result-actions"><button type="button" onClick={() => { void refreshJob(selected.id, true); }}>↻ Actualizar</button>{videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer">↗ Abrir / guardar video</a>}</div>}
                <p className="emp-fineprint">Los enlaces de Runway pueden caducar. Guarda tus videos terminados en tu computadora.</p>
              </section>

              <section className="emp-panel emp-history">
                <div className="emp-panel-heading"><div><div className="emp-step">03 / BIBLIOTECA</div><h2>Historial de videos</h2></div><span className="emp-count">{jobs.length}</span></div>
                <div className="emp-history-list">
                  {jobs.length === 0 ? <div className="emp-empty-history">Todavía no hay generaciones guardadas en este navegador.</div> : jobs.map((job) => (
                    <button type="button" key={job.id} className={"emp-history-item " + (selected?.id === job.id ? "active" : "")} onClick={() => setSelectedId(job.id)}>
                      <span className="emp-history-icon">▶</span><span className="emp-history-copy"><strong>{job.prompt}</strong><small>{new Date(job.createdAt).toLocaleString("es-ES")} · {job.duration}s</small></span><span className={"emp-mini-status " + (job.status === "SUCCEEDED" ? "done" : "")}>{labelForStatus(job.status)}</span>
                    </button>
                  ))}
                </div>
                <div className="emp-recover"><label className="emp-label" htmlFor="emp-recover-id">¿Tienes un ID de Runway?</label><div className="emp-recover-row"><input id="emp-recover-id" placeholder="Pega el ID de la tarea" value={recoverId} onChange={(event) => setRecoverId(event.target.value)} /><button type="button" disabled={busy || !recoverId.trim()} onClick={() => { void recover(); }}>Recuperar</button></div><small>Historial local de esta PC, no sincronizado con iPhone. Conserva hasta 30 tareas.</small></div>
              </section>
            </div>
          </div>
          <footer className="emp-footer">EditMyPic · AI Video Studio <span>Diseñado para crear sin límites.</span></footer>
        </div>
      </main>
    </div>
  );
}

const STYLES = String.raw`
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; min-height: 100%; background: #0c0c0f; }
  button, input, textarea { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .45; }
  .emp-app { min-height: 100vh; display: flex; color: #f5f3f7; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0c0c0f; }
  .emp-sidebar { width: 244px; flex: 0 0 244px; border-right: 1px solid #27252a; padding: 28px 17px; display: flex; flex-direction: column; min-height: 100vh; background: #101013; }
  .emp-brand { display: flex; align-items: center; gap: 12px; padding: 5px 10px 40px; font-weight: 800; font-size: 22px; letter-spacing: -.8px; }
  .emp-brand small { display: block; font-size: 9px; font-weight: 700; color: #98919f; letter-spacing: 2px; margin-top: 3px; }
  .emp-logo { display: grid; place-items: center; width: 38px; height: 38px; background: linear-gradient(140deg, #f3b482, #d1a5fa); color: #24152b; border-radius: 12px; font-size: 25px; }
  .emp-side-section { color: #77717f; font-size: 10px; letter-spacing: 2px; font-weight: 800; padding: 0 12px 14px; }
  .emp-side-gap { padding-top: 32px; }
  .emp-nav { border-radius: 11px; display: flex; align-items: center; gap: 12px; padding: 14px; font-size: 14px; font-weight: 700; }
  .emp-nav.active { background: #2b202f; color: #e8c8fc; border: 1px solid #4b3453; }
  .emp-nav.muted { color: #a49ca8; font-weight: 500; }
  .emp-nav b { margin-left: auto; color: #ddd; }
  .emp-sidebar-bottom { margin-top: auto; border-top: 1px solid #27252a; padding: 23px 9px 0; color: #bbb2bf; font-size: 11px; line-height: 1.6; }
  .emp-sidebar-bottom p { color: #716c78; margin: 8px 0 0; }
  .emp-dot { display: inline-block; width: 7px; height: 7px; background: #b4d6aa; border-radius: 50%; margin-right: 5px; }
  .emp-main { flex: 1; min-width: 0; }
  .emp-topbar { height: 78px; border-bottom: 1px solid #262329; display: flex; justify-content: space-between; align-items: center; padding: 0 46px; }
  .emp-top-actions { display: flex; align-items: center; gap: 15px; }.emp-logout { color: #e5c4e8; background: #302436; border: 1px solid #58425e; padding: 10px 13px; border-radius: 10px; font-size: 11px; font-weight: 750; }
  .emp-breadcrumb { color: #9c939f; font-size: 13px; }.emp-breadcrumb span { margin: 0 10px; color: #514b55; }
  .emp-top-pill { border: 1px solid #4d3b4c; color: #ddbcda; padding: 9px 14px; border-radius: 30px; font-size: 10px; font-weight: 800; letter-spacing: 1.1px; }
  .emp-page { max-width: 1460px; margin: auto; padding: 40px 46px 22px; }
  .emp-hero { padding: 4px 0 35px; }.emp-eyebrow,.emp-step { color: #e1a8da; font-size: 10px; letter-spacing: 2px; font-weight: 800; }
  .emp-hero h1 { font-size: clamp(29px,3vw,47px); margin: 13px 0 12px; letter-spacing: -1.9px; line-height: 1.14; }
  .emp-hero h1 em { font-style: normal; background: linear-gradient(100deg, #efb48a, #dfb4ff); background-clip: text; -webkit-background-clip: text; color: transparent; }
  .emp-hero p { color: #a9a1ad; font-size: 14px; margin: 0; line-height: 1.7; }
  .emp-columns { display: grid; grid-template-columns: minmax(0, 1.13fr) minmax(335px, .87fr); gap: 22px; align-items: start; }
  .emp-panel { background: #171619; border: 1px solid #302b32; border-radius: 18px; padding: 25px; box-shadow: 0 14px 50px rgba(0,0,0,.12); }
  .emp-panel-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
  .emp-panel-heading h2 { font-size: 20px; letter-spacing: -.5px; margin: 8px 0 0; }.emp-panel-symbol { color: #b29abd; font-size: 30px; }
  .emp-label { color: #e8e3ea; font-size: 12px; font-weight: 750; display: block; margin-bottom: 10px; }
  .emp-toggle { display: flex; gap: 8px; margin-bottom: 24px; }
  .emp-toggle button { background: #201e23; border: 1px solid #353039; border-radius: 11px; color: #9f96a3; padding: 12px 16px; flex: 1; font-size: 13px; font-weight: 650; }
  .emp-toggle button.chosen { background: #35283b; border-color: #9a6baf; color: #f5d9ff; }
  .emp-field { margin-top: 23px; }
  .emp-upload { width: 100%; background: #1e1c20; border: 1px dashed #615365; border-radius: 12px; display: flex; align-items: center; gap: 13px; padding: 16px; text-align: left; color: #f3eef5; min-height: 91px; }
  .emp-upload.has-image { border-style: solid; }.emp-upload img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; }
  .emp-upload-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 12px; background: #372a3c; color: #e2b6ec; font-size: 25px; }
  .emp-upload span:nth-last-child(2) { min-width: 0; flex: 1; }.emp-upload strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .emp-upload small { display: block; color: #99909e; font-size: 11px; margin-top: 6px; }
  .emp-upload-cta { font-size: 11px; font-weight: 750; color: #e9c4ef; padding: 9px 11px; border: 1px solid #615166; border-radius: 8px; }
  .emp-label-row { display: flex; justify-content: space-between; align-items: center; }.emp-label-row span { color: #8b8390; font-size: 11px; }
  .emp-create textarea { display: block; width: 100%; min-height: 156px; resize: vertical; background: #211f24; border: 1px solid #3a343e; color: #f5f2f6; border-radius: 11px; padding: 15px; outline: none; line-height: 1.6; font-size: 13px; }
  .emp-create textarea:focus,.emp-recover input:focus { border-color: #b68fcb; }.emp-create textarea::placeholder { color: #7c7580; }
  .emp-hint { color: #8b8390; font-size: 11px; margin-top: 9px; line-height: 1.5; }
  .emp-options { display: flex; gap: 8px; }.emp-options button { flex: 1; min-width: 0; border: 1px solid #39333e; background: #211e24; color: #c7bfca; padding: 12px 10px; border-radius: 10px; font-size: 12px; font-weight: 750; }
  .emp-options button.selected { border-color: #b38ac5; background: #372a3e; color: #f2d7ff; }.emp-options.two button { text-align: left; padding: 15px; }.emp-options.two strong { display: block; }.emp-options.two small { display: block; color: #aaa0ae; margin-top: 6px; font-size: 11px; }
  .emp-settings { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .emp-generate { width: 100%; margin-top: 27px; background: linear-gradient(100deg,#efb587,#d9a8f2); color: #231724; border: 0; border-radius: 11px; padding: 16px; font-size: 14px; font-weight: 850; box-shadow: 0 7px 30px rgba(206,154,211,.13); }
  .emp-credit-note,.emp-fineprint { color: #837c88; font-size: 11px; line-height: 1.6; margin: 12px 0 0; }
  .emp-message { border-radius: 9px; padding: 11px 13px; margin-top: 12px; font-size: 12px; line-height: 1.5; }.emp-message.error { color: #ffb4b4; background: #382329; }.emp-message.success { color: #d4e9c5; background: #243329; }
  .emp-right { display: flex; flex-direction: column; gap: 20px; }
  .emp-status,.emp-mini-status { font-size: 10px; color: #d5b3d8; background: #3a2a3d; border-radius: 20px; padding: 8px 10px; white-space: nowrap; }.emp-status.done,.emp-mini-status.done { background: #27392c; color: #c2e4c6; }
  .emp-stage { background: radial-gradient(ellipse at 50% 35%, #2e2533, #121114 70%); border: 1px solid #39313b; border-radius: 12px; min-height: 290px; height: min(50vh, 430px); overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .emp-stage.wide { height: 270px; min-height: 270px; }.emp-stage video { width: 100%; height: 100%; object-fit: contain; }
  .emp-stage-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 13px; padding: 25px; }.emp-stage-empty span { font-size: 47px; color: #a883b6; }.emp-stage-empty strong { font-size: 16px; }.emp-stage-empty small { font-size: 12px; line-height: 1.6; color: #8f8492; max-width: 260px; }
  .emp-result-actions { display: flex; gap: 9px; margin-top: 13px; }.emp-result-actions button,.emp-result-actions a { flex: 1; text-align: center; text-decoration: none; color: #ead5ed; border: 1px solid #59465d; background: #2b222f; border-radius: 9px; padding: 11px 9px; font-size: 12px; font-weight: 750; }
  .emp-count { color: #d8b2e4; background: #3a2b3d; padding: 6px 10px; border-radius: 9px; font-size: 12px; }
  .emp-history-list { display: flex; flex-direction: column; max-height: 255px; overflow-y: auto; gap: 8px; }.emp-empty-history { color: #8f8492; font-size: 12px; padding: 12px 0 22px; line-height: 1.6; }
  .emp-history-item { display: flex; width: 100%; text-align: left; align-items: center; gap: 10px; background: #201d22; border: 1px solid #302b34; color: #fff; border-radius: 10px; padding: 10px; }.emp-history-item.active { border-color: #a47bad; background: #302536; }
  .emp-history-icon { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 8px; background: #403045; color: #f1c8ef; font-size: 12px; }
  .emp-history-copy { min-width: 0; flex: 1; }.emp-history-copy strong { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; font-weight: 750; }.emp-history-copy small { display: block; color: #938a97; font-size: 10px; margin-top: 5px; }.emp-mini-status { font-size: 9px; padding: 6px; }
  .emp-recover { border-top: 1px solid #342d37; margin-top: 20px; padding-top: 20px; }.emp-recover-row { display: flex; gap: 8px; }.emp-recover input { flex: 1; min-width: 0; color: #fff; background: #201e23; border: 1px solid #3d3540; outline: none; border-radius: 8px; padding: 11px; font-size: 12px; }.emp-recover-row button { border: 1px solid #715879; border-radius: 8px; background: #382a3d; color: #efd6f4; padding: 0 12px; font-size: 11px; font-weight: 800; }.emp-recover small { display: block; margin-top: 11px; color: #857b88; font-size: 10px; line-height: 1.5; }
  .emp-footer { display: flex; justify-content: space-between; padding: 29px 0 10px; color: #6f6873; font-size: 11px; }
  @media (max-width: 1160px) { .emp-sidebar { width: 190px; flex-basis: 190px; }.emp-page { padding: 30px 24px; }.emp-topbar { padding: 0 24px; }.emp-columns { grid-template-columns: minmax(0,1fr); }.emp-right { display: grid; grid-template-columns: 1fr 1fr; }.emp-stage { height: 300px; } }
  @media (max-width: 790px) { .emp-sidebar { display: none; }.emp-topbar { height: 60px; }.emp-top-pill { display: none; }.emp-page { padding: 27px 16px; }.emp-hero h1 { letter-spacing: -1px; }.emp-columns,.emp-right { display: flex; flex-direction: column; }.emp-panel { width: 100%; padding: 19px; }.emp-stage { height: 350px; }.emp-footer span { display: none; } }
  @media (max-width: 420px) { .emp-settings { grid-template-columns: 1fr; }.emp-upload-cta { display: none; }.emp-toggle button { padding: 11px 7px; font-size: 11px; } }
`;
