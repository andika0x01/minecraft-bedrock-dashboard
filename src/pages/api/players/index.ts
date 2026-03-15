import type { APIRoute } from "astro";
import { jsonResponse } from "../../../lib/http";
import { listPlayersByDuration } from "../../../lib/playerStats";

export const GET: APIRoute = async () => {
  const players = listPlayersByDuration();
  return jsonResponse({ ok: true, players });
};
