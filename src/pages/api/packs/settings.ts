import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { readPackSettings, updatePackSettings } from "../../../lib/packWorldManager";

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get("type")?.trim() as "resource" | "behavior" | undefined;
  const packId = url.searchParams.get("packId")?.trim() ?? "";
  if (!type || (type !== "resource" && type !== "behavior")) {
    return errorResponse("type wajib diisi (resource/behavior).", 400);
  }
  if (!packId) {
    return errorResponse("packId wajib diisi.", 400);
  }

  try {
    const data = await readPackSettings(type, packId);
    return jsonResponse({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membaca settings pack.";
    return errorResponse(message, 400);
  }
};

export const PUT: APIRoute = async ({ request }) => {
  let payload: { type?: "resource" | "behavior"; packId?: string; settings?: unknown };

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload tidak valid.", 400);
  }

  if (!payload.type || (payload.type !== "resource" && payload.type !== "behavior")) {
    return errorResponse("type wajib diisi (resource/behavior).", 400);
  }

  const packId = payload.packId?.trim() ?? "";
  if (!packId) {
    return errorResponse("packId wajib diisi.", 400);
  }

  try {
    const data = await updatePackSettings(payload.type, packId, payload.settings ?? {});
    return jsonResponse({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan settings pack.";
    return errorResponse(message, 400);
  }
};
