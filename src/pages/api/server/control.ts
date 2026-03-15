import type { APIRoute } from "astro";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { restartServer, sendServerCommand, startServer, stopServer } from "../../../lib/serverProcess";

export const POST: APIRoute = async ({ request }) => {
  let payload: { action?: string; command?: string };

  try {
    payload = await request.json();
  } catch {
    return errorResponse("Payload kontrol tidak valid.", 400);
  }

  const action = payload.action;

  try {
    if (action === "start") {
      return jsonResponse({ ok: true, status: await startServer() });
    }

    if (action === "stop") {
      return jsonResponse({ ok: true, status: await stopServer() });
    }

    if (action === "restart") {
      return jsonResponse({ ok: true, status: await restartServer() });
    }

    if (action === "command") {
      const command = payload.command?.trim() ?? "";
      if (!command) {
        return errorResponse("Command tidak boleh kosong.", 400);
      }
      return jsonResponse({ ok: true, status: await sendServerCommand(command) });
    }

    return errorResponse("Aksi tidak didukung.", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operasi gagal.";
    return errorResponse(message, 500);
  }
};
