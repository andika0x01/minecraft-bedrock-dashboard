import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { readWorldSettings, updateWorldSettings } from "../../../lib/packWorldManager";

export const GET: APIRoute = async ({ url }) => {
  const worldName = url.searchParams.get("worldName")?.trim() ?? "";
  if (!worldName) {
    return errorResponse("worldName wajib diisi.", 400);
  }

  try {
    const data = await readWorldSettings(worldName);
    return jsonResponse({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membaca settings world.";
    return errorResponse(message, 400);
  }
};

export const PUT: APIRoute = async ({ request }) => {
  let payload: { worldName?: string; settings?: unknown };

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload tidak valid.", 400);
  }

  const worldName = payload.worldName?.trim() ?? "";
  if (!worldName) {
    return errorResponse("worldName wajib diisi.", 400);
  }

  try {
    const data = await updateWorldSettings(worldName, payload.settings ?? {});
    return jsonResponse({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan settings world.";
    return errorResponse(message, 400);
  }
};
