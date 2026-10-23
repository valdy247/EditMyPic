
const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";

const json = (value: Record<string, unknown>, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function headers() {
  return {
    Authorization: "Bearer " + process.env.RUNWAYML_API_SECRET,
    "X-Runway-Version": VERSION,
    "Content-Type": "application/json",
  };
}

function validId(id: string) {
  return /^[a-zA-Z0-9_-]{8,100}$/.test(id);
}

function validImage(value: unknown) {
  if (typeof value !== "string") return false;

  if (/^https:\/\//i.test(value)) {
    return value.length <= 2000;
  }

  // JPEG, PNG y WebP en base64. MÃ¡ximo aproximado: 3 MB.
  const match = value.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
  );

  return !!match && value.length <= 4_200_000;
}

export async function POST(request: Request) {
  if (!process.env.RUNWAYML_API_SECRET) {
    return json({ error: "API de Runway no configurada." }, 503);
  }

  // Evita aceptar solicitudes excesivamente grandes.
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 4_500_000) {
    return json({ error: "La imagen es demasiado grande." }, 413);
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invÃ¡lido." }, 400);
  }

  const { prompt, mode, ratio, duration, imageUrl } = body || {};

  if (
    typeof prompt !== "string" ||
    prompt.trim().length < 3 ||
    prompt.length > 1000 ||
    ![5, 10].includes(duration) ||
    !["1280:720", "720:1280"].includes(ratio) ||
    !["text", "image"].includes(mode)
  ) {
    return json({ error: "ParÃ¡metros invÃ¡lidos." }, 400);
  }

  if (mode === "image" && !validImage(imageUrl)) {
    return json(
      { error: "Selecciona una imagen JPEG, PNG o WebP vÃ¡lida." },
      400
    );
  }

  const path = mode === "image"
    ? "/image_to_video"
    : "/text_to_video";

  const payload = mode === "image"
    ? {
        model: "gen4.5",
        promptImage: imageUrl,
        promptText: prompt,
        ratio,
        duration,
      }
    : {
        model: "gen4.5",
        promptText: prompt,
        ratio,
        duration,
      };

  try {
    const upstream = await fetch(BASE + path, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });

    const result = await upstream.json();

    if (!upstream.ok) {
      return json(
        {
          error:
            upstream.status === 402
              ? "CrÃ©ditos insuficientes en Runway."
              : upstream.status === 429
                ? "LÃ­mite de solicitudes alcanzado."
                : "Runway rechazÃ³ la solicitud. Revisa el modelo, la imagen y los crÃ©ditos.",
        },
        upstream.status >= 500 ? 502 : upstream.status
      );
    }

    return json({ id: result.id }, 202);
  } catch {
    return json({ error: "No se pudo conectar con Runway." }, 502);
  }
}

export async function GET(request: Request) {
  if (!process.env.RUNWAYML_API_SECRET) {
    return json({ error: "API no configurada." }, 503);
  }

  const id = new URL(request.url).searchParams.get("id") || "";

  if (!validId(id)) {
    return json({ error: "ID invÃ¡lido." }, 400);
  }

  try {
    const upstream = await fetch(
      BASE + "/tasks/" + encodeURIComponent(id),
      { headers: headers() }
    );

    if (!upstream.ok) {
      return json(
        { error: "No se pudo consultar la tarea." },
        upstream.status >= 500 ? 502 : upstream.status
      );
    }

    const data = await upstream.json();

    return json({
      status: data.status,
      output: Array.isArray(data.output) ? data.output : [],
      failure: data.failure ? String(data.failure) : undefined,
    });
  } catch {
    return json({ error: "No se pudo consultar Runway." }, 502);
  }
}

