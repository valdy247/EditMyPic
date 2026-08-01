const OPENAI_EDIT_URL = "https://api.openai.com/v1/images/edits";
const MAX_BASE64_CHARACTERS = 6_500_000;
const MAX_REQUESTS_PER_HOUR = 20;

const rateLimits =
  globalThis.__editMyPicEraseRateLimits ||
  (globalThis.__editMyPicEraseRateLimits = new Map());

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-EditMyPic-Token",
  );
  response.setHeader("Cache-Control", "no-store, max-age=0");
}

function getClientKey(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const address = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || request.socket?.remoteAddress || "unknown")
        .split(",")[0]
        .trim();
  return address || "unknown";
}

function isRateLimited(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const current = rateLimits.get(key);

  if (!current || now - current.startedAt >= hour) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  rateLimits.set(key, current);
  return current.count > MAX_REQUESTS_PER_HOUR;
}

function parsePngDimensions(base64) {
  try {
    const buffer = Buffer.from(base64, "base64");
    const isPng =
      buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer.toString("ascii", 1, 4) === "PNG";
    if (!isPng) return {};
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  } catch {
    return {};
  }
}

function safeErrorMessage(payload, fallback) {
  const message = payload?.error?.message;
  if (typeof message !== "string") return fallback;
  if (/billing|quota|credit/i.test(message)) {
    return "El servicio de edición necesita saldo disponible.";
  }
  if (/safety|policy|moderation/i.test(message)) {
    return "La edición no pudo procesarse por sus controles de seguridad.";
  }
  return fallback;
}

module.exports = async function handler(request, response) {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Método no permitido." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({
      error: "El servicio de borrado todavía no tiene una clave configurada.",
    });
    return;
  }

  const requiredToken = process.env.EDIT_API_ACCESS_TOKEN;
  if (
    requiredToken &&
    request.headers["x-editmypic-token"] !== requiredToken
  ) {
    response.status(401).json({ error: "Acceso no autorizado." });
    return;
  }

  if (isRateLimited(request)) {
    response.status(429).json({
      error: "Demasiadas ediciones seguidas. Espera un momento y vuelve a probar.",
    });
    return;
  }

  const { imageBase64, maskBase64, prompt } = request.body || {};
  if (
    typeof imageBase64 !== "string" ||
    typeof maskBase64 !== "string" ||
    typeof prompt !== "string"
  ) {
    response.status(400).json({ error: "Faltan la imagen o la selección." });
    return;
  }

  if (
    imageBase64.length === 0 ||
    maskBase64.length === 0 ||
    imageBase64.length > MAX_BASE64_CHARACTERS ||
    maskBase64.length > MAX_BASE64_CHARACTERS
  ) {
    response.status(413).json({
      error: "La imagen es demasiado grande para esta edición.",
    });
    return;
  }

  try {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append(
      "image",
      new Blob([Buffer.from(imageBase64, "base64")], {
        type: "image/jpeg",
      }),
      "source.jpg",
    );
    form.append(
      "mask",
      new Blob([Buffer.from(maskBase64, "base64")], {
        type: "image/png",
      }),
      "mask.png",
    );
    form.append("prompt", prompt.slice(0, 1800));
    form.append("size", "auto");
    form.append("quality", "medium");
    form.append("output_format", "png");
    form.append("input_fidelity", "high");

    const openAIResponse = await fetch(OPENAI_EDIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });
    const payload = await openAIResponse.json();

    if (!openAIResponse.ok) {
      response.status(openAIResponse.status >= 500 ? 502 : 400).json({
        error: safeErrorMessage(
          payload,
          "La IA no pudo completar esta edición. Prueba con una zona menor.",
        ),
      });
      return;
    }

    const imageBase64Result = payload?.data?.[0]?.b64_json;
    if (typeof imageBase64Result !== "string") {
      response.status(502).json({
        error: "El servicio no devolvió una imagen válida.",
      });
      return;
    }

    const dimensions = parsePngDimensions(imageBase64Result);
    response.status(200).json({
      imageBase64: imageBase64Result,
      ...dimensions,
    });
  } catch (error) {
    console.error("EditMyPic erase failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    response.status(502).json({
      error: "El servicio de edición no está disponible en este momento.",
    });
  }
};

module.exports.config = {
  maxDuration: 60,
};
