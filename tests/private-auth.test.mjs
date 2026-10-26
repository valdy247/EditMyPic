import test from "node:test";
import assert from "node:assert/strict";
import {
  checkPassword, clearPrivateSessionCookie, isAuthorized, isPrivateAuthConfigured,
  isSafeAuthenticatedWrite, isSameOrigin, issueSession, privateSessionCookie,
  unauthorizedResponse,
} from "../src/server/private-auth.ts";

const PASSWORD = "sample-test-owner-password-2026";
const SECRET = "sample-test-session-secret-with-at-least-32-characters";

function setConfig() {
  process.env.EDITMYPIC_PRIVATE_PASSWORD = PASSWORD;
  process.env.EDITMYPIC_SESSION_SECRET = SECRET;
}

test("private mode fails closed without server credentials", async () => {
  delete process.env.EDITMYPIC_PRIVATE_PASSWORD;
  delete process.env.EDITMYPIC_SESSION_SECRET;
  assert.equal(isPrivateAuthConfigured(), false);
  assert.equal(await checkPassword(PASSWORD), false);
  assert.equal(await isAuthorized(new Request("https://editmypic.example/api/v1/video")), false);
});

test("owner password is verified without exposing the configured value", async () => {
  setConfig();
  assert.equal(isPrivateAuthConfigured(), true);
  assert.equal(await checkPassword(PASSWORD), true);
  assert.equal(await checkPassword("incorrect-password"), false);
});

test("signed bearer tokens are accepted and tampering is rejected", async () => {
  setConfig();
  const token = await issueSession();
  assert.equal(await isAuthorized(new Request("https://editmypic.example/api/v1/video", {
    headers: { Authorization: "Bearer " + token },
  })), true);
  const [payload, signature] = token.split(".");
  const corrupted = payload.slice(0, -1) + (payload.endsWith("A") ? "B" : "A") + "." + signature;
  assert.equal(await isAuthorized(new Request("https://editmypic.example/api/v1/video", {
    headers: { Authorization: "Bearer " + corrupted },
  })), false);
});

test("HTTPS cookies use HttpOnly, SameSite Strict and __Host prefix", async () => {
  setConfig();
  const token = await issueSession();
  const request = new Request("https://editmypic.example/api/v1/session");
  const cookie = privateSessionCookie(request, token);
  assert.match(cookie, /^__Host-editmypic_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /; Secure/);
  assert.equal(await isAuthorized(new Request("https://editmypic.example/api/v1/video", {
    headers: { Cookie: cookie.split(";")[0] },
  })), true);
  assert.match(clearPrivateSessionCookie(request), /Max-Age=0/);
});

test("localhost cookies do not use __Host without HTTPS", async () => {
  setConfig();
  const token = await issueSession();
  const request = new Request("http://localhost:8081/api/v1/session");
  assert.match(privateSessionCookie(request, token), /^editmypic_dev_session=/);
});

test("browser writes reject cross-origin requests while native bearer writes work", () => {
  const browser = new Request("https://editmypic.example/api/v1/video", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(isSameOrigin(browser), false);
  assert.equal(isSafeAuthenticatedWrite(browser), false);
  const native = new Request("https://editmypic.example/api/v1/video", {
    method: "POST",
    headers: { Authorization: "Bearer test" },
  });
  assert.equal(isSafeAuthenticatedWrite(native), true);
});

test("unauthenticated requests get a non-cacheable 401", async () => {
  const response = unauthorizedResponse();
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("EAS production browser login remains same-origin behind an internal reverse proxy", async () => {
  setConfig();
  const proxiedLogin = new Request("http://internal-eas-host:3000/api/v1/session", {
    method: "POST",
    headers: {
      Origin: "https://editmypic.expo.app",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  assert.equal(isSameOrigin(proxiedLogin), true);
  const token = await issueSession();
  const cookie = privateSessionCookie(proxiedLogin, token);
  assert.match(cookie, /^__Host-editmypic_session=/);
  assert.match(cookie, /; Secure/);
  const proxiedRead = new Request("http://internal-eas-host:3000/api/v1/video", {
    headers: { Cookie: cookie.split(";")[0] },
  });
  assert.equal(await isAuthorized(proxiedRead), true);
});

test("production allowlist rejects lookalike domains and cross-site fetches", () => {
  const url = "http://internal-eas-host:3000/api/v1/session";
  assert.equal(isSameOrigin(new Request(url, {
    method: "POST",
    headers: {
      Origin: "https://editmypic.expo.app.evil.example",
      "Sec-Fetch-Site": "same-origin",
    },
  })), false);
  assert.equal(isSameOrigin(new Request(url, {
    method: "POST",
    headers: {
      Origin: "https://editmypic.expo.app",
      "Sec-Fetch-Site": "cross-site",
    },
  })), false);
  assert.equal(isSameOrigin(new Request(url, {
    method: "POST",
    headers: {
      Origin: "http://editmypic.expo.app",
      "Sec-Fetch-Site": "same-origin",
    },
  })), false);
});

test("secure production session survives an internal localhost proxy", async () => {
  setConfig();
  const login = new Request("http://127.0.0.1:3000/api/v1/session", {
    method: "POST",
    headers: { Origin: "https://editmypic.expo.app", "Sec-Fetch-Site": "same-origin" },
  });
  assert.equal(isSameOrigin(login), true);
  const cookie = privateSessionCookie(login, await issueSession());
  assert.match(cookie, /^__Host-editmypic_session=/);
  assert.match(cookie, /; Secure/);
  const followup = new Request("http://127.0.0.1:3000/api/v1/session", {
    headers: { Cookie: cookie.split(";")[0] },
  });
  assert.equal(await isAuthorized(followup), true);
});
