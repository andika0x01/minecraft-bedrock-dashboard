import fs from "node:fs";
import os from "node:os";
import { BEDROCK_DIR } from "./paths";

type CpuSnapshot = {
  idle: number;
  total: number;
};

type MemoryMetrics = {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
};

type StorageMetrics = {
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
};

export type SystemMetrics = {
  cpuPercent: number;
  memory: MemoryMetrics;
  storage: StorageMetrics;
  sampledAt: number;
};

let previousCpuSnapshot: CpuSnapshot | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }

  return { idle, total };
}

function getCpuPercent() {
  const current = readCpuSnapshot();
  if (!previousCpuSnapshot) {
    previousCpuSnapshot = current;
    return 0;
  }

  const totalDelta = current.total - previousCpuSnapshot.total;
  const idleDelta = current.idle - previousCpuSnapshot.idle;
  previousCpuSnapshot = current;

  if (totalDelta <= 0) {
    return 0;
  }

  const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
  return clamp(Number(usage.toFixed(1)), 0, 100);
}

function getMemoryMetrics(): MemoryMetrics {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const usedPercent = totalBytes > 0 ? clamp(Number(((usedBytes / totalBytes) * 100).toFixed(1)), 0, 100) : 0;

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent,
  };
}

function getStorageMetrics(targetPath: string): StorageMetrics {
  try {
    const stat = fs.statfsSync(targetPath);
    const totalBytes = stat.blocks * stat.bsize;
    const freeBytes = stat.bavail * stat.bsize;
    const usedBytes = totalBytes - freeBytes;
    const usedPercent = totalBytes > 0 ? clamp(Number(((usedBytes / totalBytes) * 100).toFixed(1)), 0, 100) : 0;

    return {
      path: targetPath,
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent,
    };
  } catch {
    return {
      path: targetPath,
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      usedPercent: 0,
    };
  }
}

export function getSystemMetrics(): SystemMetrics {
  return {
    cpuPercent: getCpuPercent(),
    memory: getMemoryMetrics(),
    storage: getStorageMetrics(BEDROCK_DIR),
    sampledAt: Date.now(),
  };
}
