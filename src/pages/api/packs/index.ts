import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { listPacks, uploadPack } from "../../../lib/packWorldManager";

export const GET: APIRoute = async () => {
  return jsonResponse({ ok: true, ...(await listPacks()) });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorResponse("File addon tidak ditemukan.", 400);
    }

    const result = await uploadPack(file);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload addon gagal.";
    return errorResponse(message, 400);
  }
};
