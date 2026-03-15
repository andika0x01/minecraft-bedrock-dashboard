import type { APIRoute } from "astro";
import { jsonResponse } from "../../../lib/http";
import { getServerLogs } from "../../../lib/serverProcess";

export const GET: APIRoute = async ({ url }) => {
  const limit = Number(url.searchParams.get("limit") ?? "200");
  return jsonResponse({ ok: true, logs: getServerLogs(limit) });
};
