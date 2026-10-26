import {
  checkPassword, clearPrivateSessionCookie, isAuthorized, isPrivateAuthConfigured,
  isSameOrigin, issueSession, privateSessionCookie,
} from "@/src/server/private-auth";

const json = (data: Record<string, unknown>, status = 200, extra?: HeadersInit) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });

// This throttle is only a best-effort local safeguard; deploy a durable rate
// limiter/WAF before expanding access beyond the single owner.
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;

function clientKey(request: Request) {
  const address = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
  return address.slice(0, 80);
}

export async function GET(request: Request) {
  if (!isPrivateAuthConfigured()) return json({ authenticated: false, configured: false }, 503);
  return json({ authenticated: await isAuthorized(request), configured: true });
}

export async function POST(request: Request) {
  if (!isPrivateAuthConfigured()) return json({ error: "Acceso privado sin configurar en el servidor." }, 503);
  if (!isSameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const key = clientKey(request);
  const now = Date.now();
  const previous = failures.get(key);
  if (previous && previous.until > now && previous.count >= 5) {
    return json({ error: "Demasiados intentos. Vuelve a probar en 15 minutos." }, 429);
  }
  if (Number(request.headers.get("content-length") || 0) > 2048) {
    return json({ error: "Solicitud demasiado grande." }, 413);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const password = body && typeof body === "object" && "password" in body
    ? (body as { password: unknown }).password : undefined;
  if (!await checkPassword(password)) {
    failures.set(key, {
      count: previous && previous.until > now ? previous.count + 1 : 1,
      until: now + WINDOW_MS,
    });
    return json({ error: "Contraseña incorrecta." }, 401);
  }
  failures.delete(key);
  const token = await issueSession();
  const nativeClient = request.headers.get("x-editmypic-client") === "native";
  return json(
    { authenticated: true, ...(nativeClient ? { token } : {}) },
    200,
    { "Set-Cookie": privateSessionCookie(request, token) },
  );
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  return json({ authenticated: false }, 200, {
    "Set-Cookie": clearPrivateSessionCookie(request),
  });
}
