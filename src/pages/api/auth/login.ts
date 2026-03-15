import type { APIRoute } from "astro";
import { buildSessionCookie, createSession, verifyAdminLogin } from "../../../lib/auth";
import { errorResponse, jsonResponse } from "../../../lib/http";

export const POST: APIRoute = async ({ request }) => {
  let payload: { username?: string; password?: string };

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload login tidak valid.", 400);
  }

  const username = payload.username?.trim() ?? "";
  const password = payload.password?.trim() ?? "";

  if (!username || !password) {
    return errorResponse("Username dan password wajib diisi.", 400);
  }

  if (!verifyAdminLogin(username, password)) {
    return errorResponse("Username atau password salah.", 401);
  }

  const token = createSession(username);
  return jsonResponse(
    { ok: true },
    {
      headers: {
        "set-cookie": buildSessionCookie(token),
      },
    }
  );
};
