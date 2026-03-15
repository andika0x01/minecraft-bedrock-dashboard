import { execSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import { BEDROCK_BINARY, BEDROCK_DIR } from "./paths";

const DEDICATED_LOG_PATH = `${BEDROCK_DIR}/Dedicated_Server.txt`;

type ServerState = {
  process: ChildProcessWithoutNullStreams | null;
  startedAt: number | null;
  logs: string[];
  lastError: string | null;
};

const state: ServerState = {
  process: null,
  startedAt: null,
  logs: [],
  lastError: null,
};

function detectExternalBedrockPid() {
  try {
    const output = execSync("ss -lntup", { encoding: "utf-8" });
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes("bedrock_server")) {
        continue;
      }
      if (!line.includes(":19132") && !line.includes(":19133")) {
        continue;
      }
      const match = line.match(/pid=(\d+)/);
      if (match) {
        return Number(match[1]);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeExternalCommand(pid: number, command: string) {
  const stdinPath = `/proc/${pid}/fd/0`;
  try {
    fs.appendFileSync(stdinPath, `${command.trim()}\n`, { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

async function stopExternalProcess(pid: number) {
  if (!isPidRunning(pid)) {
    return;
  }

  if (writeExternalCommand(pid, "stop")) {
    const gracefulDeadline = Date.now() + 4000;
    while (Date.now() < gracefulDeadline) {
      if (!isPidRunning(pid)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }
}

function pushLog(line: string) {
  state.logs.push(line);
  if (state.logs.length > 500) {
    state.logs.shift();
  }

  try {
    fs.appendFileSync(DEDICATED_LOG_PATH, `${line}\n`);
  } catch {}
}

function ensureBinaryExists() {
  if (!fs.existsSync(BEDROCK_BINARY)) {
    throw new Error("Binary bedrock_server tidak ditemukan.");
  }

  try {
    fs.accessSync(BEDROCK_BINARY, fs.constants.X_OK);
  } catch {
    fs.chmodSync(BEDROCK_BINARY, 0o755);
    fs.accessSync(BEDROCK_BINARY, fs.constants.X_OK);
  }
}

export function getServerStatus() {
  const managedRunning = Boolean(state.process && state.process.pid && !state.process.killed && state.process.exitCode === null);
  const externalPid = managedRunning ? null : detectExternalBedrockPid();
  const isRunning = managedRunning || Boolean(externalPid);
  return {
    running: isRunning,
    pid: state.process?.pid ?? externalPid ?? null,
    startedAt: state.startedAt,
    uptimeMs: state.startedAt ? Date.now() - state.startedAt : 0,
    lastError: state.lastError,
  };
}

export function getServerLogs(limit = 200) {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const memoryLogs = state.logs.slice(-safeLimit);
  if (memoryLogs.length >= safeLimit) {
    return memoryLogs;
  }

  try {
    const raw = fs.readFileSync(DEDICATED_LOG_PATH, "utf-8");
    const fileLogs = raw.split(/\r?\n/).filter(Boolean);
    if (memoryLogs.length === 0) {
      if (fileLogs.length === 0) {
        const status = getServerStatus();
        if (status.running && status.lastError) {
          return [status.lastError];
        }
        return ["Belum ada log server. Jalankan server dari dashboard untuk melihat log live."];
      }
      return fileLogs.slice(-safeLimit);
    }

    const merged = [...fileLogs.slice(-safeLimit), ...memoryLogs];
    return merged.slice(-safeLimit);
  } catch {
    if (memoryLogs.length > 0) {
      return memoryLogs;
    }
    const status = getServerStatus();
    if (status.running && status.lastError) {
      return [status.lastError];
    }
    return ["Belum ada log server. Jalankan server dari dashboard untuk melihat log live."];
  }
}

export async function startServer() {
  const status = getServerStatus();
  const managedRunning = Boolean(state.process && state.process.pid && !state.process.killed && state.process.exitCode === null);
  if (managedRunning) {
    return status;
  }

  if (status.running && status.pid) {
    await stopExternalProcess(status.pid);
    pushLog(`Proses lama dihentikan (pid=${status.pid}) sebelum start baru.`);
    state.process = null;
    state.startedAt = null;
  }

  ensureBinaryExists();

  const proc = spawn("./bedrock_server", {
    cwd: BEDROCK_DIR,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ".",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  state.process = proc;
  state.startedAt = Date.now();
  state.lastError = null;

  if (!proc.pid) {
    state.process = null;
    state.startedAt = null;
    throw new Error("Gagal menjalankan bedrock_server. Cek izin file binary dan library server.");
  }

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf-8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      pushLog(line);
    }
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf-8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      pushLog(`[ERR] ${line}`);
      state.lastError = line;
    }
  });

  proc.on("exit", (code, signal) => {
    pushLog(`Server berhenti (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    state.process = null;
    state.startedAt = null;
  });

  proc.on("error", (error) => {
    state.lastError = error.message;
    pushLog(`[ERR] ${error.message}`);
    state.process = null;
    state.startedAt = null;
  });

  pushLog("Server dijalankan.");

  return new Promise<ReturnType<typeof getServerStatus>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const current = getServerStatus();
      if (current.running) {
        resolve(current);
        return;
      }
      reject(new Error(state.lastError ?? "Server gagal dijalankan."));
    }, 1200);

    proc.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error(state.lastError ?? "Server berhenti setelah dijalankan."));
    });
  });
}

export async function stopServer() {
  const proc = state.process;
  if (!proc || proc.exitCode !== null || proc.killed) {
    const status = getServerStatus();
    if (status.running && status.pid) {
      await stopExternalProcess(status.pid);
      pushLog(`Server dihentikan (pid=${status.pid}).`);
      return getServerStatus();
    }
    state.process = null;
    state.startedAt = null;
    return status;
  }

  return new Promise<ReturnType<typeof getServerStatus>>((resolve) => {
    let resolved = false;

    const done = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(getServerStatus());
    };

    const timeout = setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
      done();
    }, 10000);

    proc.once("exit", () => {
      clearTimeout(timeout);
      done();
    });

    try {
      proc.stdin.write("stop\n");
    } catch {
      proc.kill("SIGTERM");
    }
  });
}

export async function restartServer() {
  await stopServer();
  return await startServer();
}

export async function sendServerCommand(command: string) {
  const proc = state.process;
  if (!proc || proc.exitCode !== null || proc.killed) {
    const status = getServerStatus();
    if (status.running && status.pid) {
      await stopExternalProcess(status.pid);
      pushLog(`Takeover proses lama (pid=${status.pid}) untuk sinkronisasi command.`);
      await startServer();
    } else {
      throw new Error("Server tidak sedang berjalan.");
    }
  }

  if (!state.process || state.process.exitCode !== null || state.process.killed) {
    throw new Error("Server belum siap menerima command.");
  }

  state.process.stdin.write(`${command.trim()}\n`);
  pushLog(`[CMD] ${command.trim()}`);
  return getServerStatus();
}
