const OPENAI_EDIT_URL = "https://api.openai.com/v1/images/edits";
const MAX_BASE64_CHARACTERS = 6_500_000;
const MAX_REQUESTS_PER_HOUR = 20;
const EDIT_PROMPT =
  "Remove the selected people or objects and reconstruct the area naturally. Preserve everything outside the transparent mask exactly, including lighting, perspective, texture, and image composition. Do not add new subjects, text, logos, or watermarks.";

type RateLimitEntry = {
  startedAt: number;
  count: number;
};

type EraseRequestBody = {
  imageBase64?: unknown;
  maskBase64?: unknown;
};

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
};

const rateLimits = new Map<string, RateLimitEntry>();

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parsePngDimensions(base64: string) {
  try {
    const bytes = base64ToBytes(base64);
    const isPng =
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    if (!isPng) return {};

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  } catch {
    return {};
  }
}

function getClientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isRateLimited(request: Request) {
  const key = getClientKey(request);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const current = rateLimits.get(key);

  if (!current || now - current.startedAt >= hour) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return false;
  }

  const next = { ...current, count: current.count + 1 };
  rateLimits.set(key, next);
  return next.count > MAX_REQUESTS_PER_HOUR;
}

function safeErrorMessage(payload: OpenAIImageResponse) {
  const message = payload.error?.message;
  if (typeof message !== "string") {
    return "La IA no pudo completar esta edición. Prueba con una zona menor.";
  }
  if (/billing|quota|credit/i.test(message)) {
    return "El servicio de edición necesita saldo disponible.";
  }
  if (/safety|policy|moderation/i.test(message)) {
    return "La edición no pudo procesarse por sus controles de seguridad.";
  }
  return "La IA no pudo completar esta edición. Prueba con una zona menor.";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(
      { error: "Borrar todavía no tiene la clave de OpenAI configurada en Expo." },
      503,
    );
  }

  if (isRateLimited(request)) {
    return json(
      {
        error:
          "Demasiadas ediciones seguidas. Espera un momento y vuelve a probar.",
      },
      429,
    );
  }

  let body: EraseRequestBody;
  try {
    body = (await request.json()) as EraseRequestBody;
  } catch {
    return json({ error: "La solicitud no contiene una imagen válida." }, 400);
  }

  const imageBase64 = body.imageBase64;
  const maskBase64 = body.maskBase64;
  if (typeof imageBase64 !== "string" || typeof maskBase64 !== "string") {
    return json({ error: "Faltan la imagen o la selección." }, 400);
  }

  if (
    imageBase64.length === 0 ||
    maskBase64.length === 0 ||
    imageBase64.length > MAX_BASE64_CHARACTERS ||
    maskBase64.length > MAX_BASE64_CHARACTERS
  ) {
    return json({ error: "La imagen es demasiado grande para esta edición." }, 413);
  }

  try {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append(
      "image",
      new Blob([base64ToBytes(imageBase64)], { type: "image/jpeg" }),
      "source.jpg",
    );
    form.append(
      "mask",
      new Blob([base64ToBytes(maskBase64)], { type: "image/png" }),
      "mask.png",
    );
    form.append("prompt", EDIT_PROMPT);
    form.append("size", "auto");
    form.append("quality", "medium");
    form.append("output_format", "png");
    form.append("input_fidelity", "high");

    const openAIResponse = await fetch(OPENAI_EDIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    const payload = (await openAIResponse.json()) as OpenAIImageResponse;

    if (!openAIResponse.ok) {
      return json(
        { error: safeErrorMessage(payload) },
        openAIResponse.status >= 500 ? 502 : 400,
      );
    }

    const imageBase64Result = payload.data?.[0]?.b64_json;
    if (typeof imageBase64Result !== "string") {
      return json({ error: "El servicio no devolvió una imagen válida." }, 502);
    }

    return json({
      imageBase64: imageBase64Result,
      ...parsePngDimensions(imageBase64Result),
    });
  } catch (error) {
    console.error("EditMyPic erase failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return json(
      { error: "El servicio de edición no está disponible en este momento." },
      502,
    );
  }
}
