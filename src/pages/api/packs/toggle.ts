import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { setPackEnabled } from "../../../lib/packWorldManager";

export const POST: APIRoute = async ({ request }) => {
  let payload: {
    type?: "resource" | "behavior";
    packId?: string;
    version?: string;
    enabled?: boolean;
  };

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload tidak valid.", 400);
  }

  if (!payload.type || !payload.packId || !payload.version) {
    return errorResponse("type, packId, version wajib diisi.", 400);
  }

  try {
    const packs = await setPackEnabled(payload.type, payload.packId, payload.version, Boolean(payload.enabled));

    return jsonResponse({ ok: true, ...packs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengubah status addon.";
    return errorResponse(message, 400);
  }
};
