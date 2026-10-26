// Server-only authentication for the single-owner EditMyPic studio.
// Do not import this module from client components.
const SECURE_COOKIE_NAME = "__Host-editmypic_session";
const DEV_COOKIE_NAME = "editmypic_dev_session";
// EAS Hosting can pass an internal request URL through its reverse proxy.
// Only this exact public origin is trusted as an additional browser origin.
const PRODUCTION_ORIGIN = "https://editmypic.expo.app";
const SESSION_SECONDS = 60 * 60 * 12;
const encoder = new TextEncoder();

function credentials() {
  const password = process.env.EDITMYPIC_PRIVATE_PASSWORD || "";
  const secret = process.env.EDITMYPIC_SESSION_SECRET || "";
  if (password.length < 20 || secret.length < 32) return null;
  return { password, secret };
}

export function isPrivateAuthConfigured() {
  return !!credentials();
}

function secureCookie(request: Request) {
  const url = new URL(request.url);
  // Do not rely solely on the internal URL protocol behind EAS Hosting:
  // the public HTTPS endpoint may be proxied to an internal HTTP URL.
  return url.protocol === "https:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function cookieName(request: Request) {
  return secureCookie(request) ? SECURE_COOKIE_NAME : DEV_COOKIE_NAME;
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function checkPassword(candidate: unknown) {
  const config = credentials();
  if (!config || typeof candidate !== "string" || candidate.length > 512) return false;
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(config.password)),
  ]);
  return bytesEqual(new Uint8Array(actual), new Uint8Array(expected));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

function toBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function issueSession() {
  const config = credentials();
  if (!config) throw new Error("Private access is not configured");
  const payload = {
    sub: "owner",
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(config.secret), encoder.encode(encoded)));
  return encoded + "." + toBase64Url(signature);
}

async function validSession(value: string) {
  const config = credentials();
  if (!config || value.length > 2048) return false;
  const pieces = value.split(".");
  if (pieces.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(pieces[0]) || !/^[A-Za-z0-9_-]+$/.test(pieces[1])) return false;
  try {
    const verified = await crypto.subtle.verify(
      "HMAC", await signingKey(config.secret),
      fromBase64Url(pieces[1]), encoder.encode(pieces[0])
    );
    if (!verified) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(pieces[0])));
    const now = Math.floor(Date.now() / 1000);
    return payload.sub === "owner" && Number.isSafeInteger(payload.exp) && payload.exp > now && payload.exp <= now + SESSION_SECONDS;
  } catch {
    return false;
  }
}

function readCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const entry of cookieHeader.split(";")) {
    const [name, ...value] = entry.trim().split("=");
    if (name === cookieName(request)) return value.join("=");
  }
  return "";
}

export async function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) return validSession(authorization.slice(7));
  return validSession(readCookie(request));
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  if (!origin) return true; // Native apps don't send Origin.
  try {
    const suppliedOrigin = new URL(origin).origin;
    // Preserve same-origin enforcement locally and for EAS previews.
    // In production the public hostname can differ from the internal
    // request URL after the EAS reverse proxy forwards the request.
    return suppliedOrigin === new URL(request.url).origin ||
      suppliedOrigin === PRODUCTION_ORIGIN;
  } catch {
    return false;
  }
}

export function isSafeAuthenticatedWrite(request: Request) {
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return true; // Native
  return isSameOrigin(request); // Browser cookie sessions require same-origin.
}

export function privateSessionCookie(request: Request, token: string) {
  return cookieName(request) + "=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + SESSION_SECONDS + (secureCookie(request) ? "; Secure" : "");
}

export function clearPrivateSessionCookie(request: Request) {
  return cookieName(request) + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + (secureCookie(request) ? "; Secure" : "");
}

export function unauthorizedResponse() {
  return Response.json({ error: "Acceso privado. Inicia sesión para continuar." }, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}
