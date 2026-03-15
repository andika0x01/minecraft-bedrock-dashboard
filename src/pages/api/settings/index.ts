import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { readServerSettings, settingKeys, updateServerSettings } from "../../../lib/serverProperties";

export const GET: APIRoute = async () => {
  const settings = await readServerSettings();
  return jsonResponse({ ok: true, settings, keys: settingKeys });
};

export const PUT: APIRoute = async ({ request }) => {
  let payload: Record<string, string>;

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload settings tidak valid.", 400);
  }

  try {
    const settings = await updateServerSettings(payload);
    return jsonResponse({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan settings.";
    return errorResponse(message, 400);
  }
};
