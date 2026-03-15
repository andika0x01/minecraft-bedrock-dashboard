import type { APIRoute } from "astro";
import { buildClearSessionCookie, clearSession, getSessionFromRequest } from "../../../lib/auth";
import { jsonResponse } from "../../../lib/http";

export const POST: APIRoute = async ({ request }) => {
  const active = getSessionFromRequest(request);
  clearSession(active?.token);

  return jsonResponse(
    { ok: true },
    {
      headers: {
        "set-cookie": buildClearSessionCookie(),
      },
    }
  );
};
