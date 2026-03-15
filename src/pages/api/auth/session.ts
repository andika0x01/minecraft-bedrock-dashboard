import type { APIRoute } from "astro";
import { getSessionFromRequest } from "../../../lib/auth";
import { jsonResponse } from "../../../lib/http";

export const GET: APIRoute = async ({ request }) => {
  const active = getSessionFromRequest(request);
  return jsonResponse({
    ok: true,
    authenticated: Boolean(active),
    username: active?.session.username ?? null,
  });
};
