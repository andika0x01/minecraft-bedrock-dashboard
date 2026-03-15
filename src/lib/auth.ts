import crypto from "node:crypto";
import { getAdminCredentials } from "./env";

const SESSION_COOKIE = "mbd_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

type Session = {
  username: string;
  expiresAt: number;
};

const sessions = new Map<string, Session>();

function parseCookies(rawCookie: string | null) {
  if (!rawCookie) {
    return new Map<string, string>();
  }

  const pairs = rawCookie.split(";");
  const map = new Map<string, string>();

  for (const pair of pairs) {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) {
      continue;
    }
    map.set(key, decodeURIComponent(rest.join("=")));
  }

  return map;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function createSession(username: string) {
  cleanupSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function clearSession(token: string | undefined) {
  if (!token) {
    return;
  }
  sessions.delete(token);
}

export function getSessionFromRequest(request: Request) {
  cleanupSessions();
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.get(SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, session };
}

export function isLoggedIn(request: Request) {
  return Boolean(getSessionFromRequest(request));
}

export function verifyAdminLogin(username: string, password: string) {
  const admin = getAdminCredentials();
  return username === admin.username && password === admin.password;
}

export function buildSessionCookie(token: string) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearSessionCookie() {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}
