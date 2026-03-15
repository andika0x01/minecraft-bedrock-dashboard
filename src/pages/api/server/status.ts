import type { APIRoute } from "astro";
import { jsonResponse } from "../../../lib/http";
import { getServerStatus } from "../../../lib/serverProcess";
import { getSystemMetrics } from "../../../lib/systemMetrics";

export const GET: APIRoute = async () => {
  return jsonResponse({ ok: true, status: getServerStatus(), metrics: getSystemMetrics() });
};
