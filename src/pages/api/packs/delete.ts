import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { deletePack } from "../../../lib/packWorldManager";

export const POST: APIRoute = async ({ request }) => {
  let payload: {
    type?: "resource" | "behavior";
    packId?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload tidak valid.", 400);
  }

  if (!payload.type || !payload.packId) {
    return errorResponse("type dan packId wajib diisi.", 400);
  }

  try {
    const packs = await deletePack(payload.type, payload.packId);
    return jsonResponse({ ok: true, ...packs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menghapus addon.";
    return errorResponse(message, 400);
  }
};
