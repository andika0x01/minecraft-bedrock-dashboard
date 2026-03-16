import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { BEHAVIOR_PACKS_DIR, RESOURCE_PACKS_DIR, WORLDS_DIR } from "./paths";
import { readServerSettings, updateServerSettings } from "./serverProperties";

type PackType = "resource" | "behavior";

type PackSummary = {
  id: string;
  name: string;
  version: string;
  type: PackType;
  folder: string;
  enabled: boolean;
  hasSettings: boolean;
};

type WorldSummary = {
  name: string;
  active: boolean;
};

type ManifestInfo = {
  uuid: string;
  name: string;
  version: string;
  type: PackType;
};

type JsonRecord = Record<string, unknown>;

function sanitizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function detectPackType(manifest: any): PackType | null {
  const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
  for (const module of modules) {
    if (module?.type === "resources") {
      return "resource";
    }
    if (module?.type === "data" || module?.type === "script") {
      return "behavior";
    }
  }
  return null;
}

function readManifestInfo(manifestRaw: string): ManifestInfo {
  const manifest = JSON.parse(manifestRaw);
  const header = manifest?.header;
  const uuid = header?.uuid;
  const name = header?.name;
  const versionArray = Array.isArray(header?.version) ? header.version : null;
  const type = detectPackType(manifest);

  if (!uuid || !name || !versionArray || !type) {
    throw new Error("Manifest addon tidak valid.");
  }

  return {
    uuid,
    name,
    version: versionArray.join("."),
    type,
  };
}

async function readManifestFromFolder(folderPath: string) {
  const manifestPath = path.join(folderPath, "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf-8");
  return readManifestInfo(raw);
}

async function findPackSettingsFile(type: PackType, folderPath: string) {
  const candidates =
    type === "behavior"
      ? ["settings.json", "behavior_settings.json", "server_settings.json"]
      : ["settings.json", "resource_settings.json", "client_settings.json"];

  for (const fileName of candidates) {
    const target = path.join(folderPath, fileName);
    if (await exists(target)) {
      return target;
    }
  }

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const dynamic = entries.find((entry) => entry.isFile() && /settings.*\.json$/i.test(entry.name));
    if (dynamic) {
      return path.join(folderPath, dynamic.name);
    }
  } catch {
    return null;
  }

  return null;
}

function getWorldSettingsPath(worldName: string) {
  return path.join(WORLDS_DIR, worldName, "dashboard.settings.json");
}

function getFallbackPackSettingsPath(folderPath: string) {
  return path.join(folderPath, "dashboard.settings.json");
}

async function findNativePackSettingsFile(type: PackType, folderPath: string) {
  return await findPackSettingsFile(type, folderPath);
}

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

function parseIntegerInRange(value: string | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

async function buildDefaultWorldSettings() {
  const serverSettings = await readServerSettings();
  return {
    difficulty: serverSettings.difficulty || "normal",
    gameMode: serverSettings.gamemode || "survival",
    maxPlayers: parseIntegerInRange(serverSettings["max-players"], 10, 1, 200),
    allowCheats: parseBooleanFlag(serverSettings["allow-cheats"], false),
    pvp: true,
    keepInventory: false,
    enableNether: true,
    friendlyFire: true,
    seed: serverSettings["level-seed"] || "",
    motd: serverSettings["server-name"] || "",
    spawnProtection: 0,
    autosaveIntervalSeconds: 300,
  };
}

function buildDefaultPackSettings(type: PackType): JsonRecord {
  if (type === "behavior") {
    return {
      enabled: true,
      scriptsEnabled: false,
      experimental: false,
      config: {},
    };
  }

  return {
    enabled: true,
    forcedClients: false,
    textureQuality: "high",
    config: {},
  };
}

async function readJsonFileOrDefault(filePath: string, fallback: unknown) {
  if (!(await exists(filePath))) {
    return fallback;
  }

  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listDirectories(dirPath: string) {
  if (!(await exists(dirPath))) {
    return [] as string[];
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function findManifestFolders(rootPath: string, depth = 0): Promise<string[]> {
  if (depth > 4) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const hasManifest = entries.some((entry) => entry.isFile() && entry.name === "manifest.json");
  if (hasManifest) {
    return [rootPath];
  }

  const result: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith("__MACOSX")) {
      continue;
    }
    const child = path.join(rootPath, entry.name);
    const children = await findManifestFolders(child, depth + 1);
    result.push(...children);
  }

  return result;
}

async function collectExistingUuids() {
  const existing = new Set<string>();

  for (const base of [RESOURCE_PACKS_DIR, BEHAVIOR_PACKS_DIR]) {
    const folders = await listDirectories(base);
    for (const folder of folders) {
      const folderPath = path.join(base, folder);
      try {
        const info = await readManifestFromFolder(folderPath);
        existing.add(info.uuid);
      } catch {
        continue;
      }
    }
  }

  return existing;
}

async function moveDirectory(source: string, destination: string) {
  try {
    await fs.rename(source, destination);
  } catch {
    await fs.cp(source, destination, { recursive: true });
    await fs.rm(source, { recursive: true, force: true });
  }
}

async function getActiveWorldName() {
  const settings = await readServerSettings();
  return settings["level-name"];
}

async function getWorldPackFilePath(type: PackType) {
  const activeWorldName = await getActiveWorldName();
  const worldPath = path.join(WORLDS_DIR, activeWorldName);
  const fileName = type === "behavior" ? "world_behavior_packs.json" : "world_resource_packs.json";
  return path.join(worldPath, fileName);
}

async function readWorldPackRefs(type: PackType) {
  const filePath = await getWorldPackFilePath(type);
  if (!(await exists(filePath))) {
    return [] as Array<{ pack_id: string; version: [number, number, number] }>;
  }

  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item) => item?.pack_id && Array.isArray(item?.version));
}

async function writeWorldPackRefs(type: PackType, refs: Array<{ pack_id: string; version: [number, number, number] }>) {
  const filePath = await getWorldPackFilePath(type);
  await fs.writeFile(filePath, `${JSON.stringify(refs, null, 2)}\n`, "utf-8");
}

function parseVersion(value: string): [number, number, number] {
  const parts = value.split(".").map((part) => Number(part));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export async function listWorlds(): Promise<WorldSummary[]> {
  await ensureDir(WORLDS_DIR);
  const activeWorld = await getActiveWorldName();
  const folders = await listDirectories(WORLDS_DIR);

  return folders.map((name) => ({
    name,
    active: name === activeWorld,
  }));
}

export async function activateWorld(worldName: string) {
  await ensureDir(WORLDS_DIR);
  const target = path.join(WORLDS_DIR, worldName);
  if (!(await exists(target))) {
    throw new Error("World tidak ditemukan.");
  }

  await updateServerSettings({ "level-name": worldName });
  return listWorlds();
}

export async function deleteWorld(worldName: string) {
  const activeWorld = await getActiveWorldName();
  if (worldName === activeWorld) {
    throw new Error("World aktif tidak bisa dihapus. Pilih world lain sebagai aktif terlebih dahulu.");
  }

  const target = path.join(WORLDS_DIR, worldName);
  if (!(await exists(target))) {
    throw new Error("World tidak ditemukan.");
  }

  await fs.rm(target, { recursive: true, force: true });
  return listWorlds();
}

export async function uploadWorld(file: File) {
  if (!file.name.toLowerCase().endsWith(".mcworld")) {
    throw new Error("File world harus berformat .mcworld");
  }

  await ensureDir(WORLDS_DIR);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mbd-world-"));
  const zipPath = path.join(tempDir, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(zipPath, bytes);

  const extractDir = path.join(tempDir, "extract");
  await ensureDir(extractDir);

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    const manifestFolders = await findManifestFolders(extractDir);
    const worldFolder = manifestFolders.length > 0 ? path.dirname(manifestFolders[0]) : extractDir;

    const candidates = await findLevelDatCandidates(worldFolder);
    if (candidates.length === 0) {
      throw new Error("Isi .mcworld tidak valid.");
    }

    const selectedWorld = candidates[0];
    const baseName = sanitizeName(path.parse(file.name).name) || `world-${Date.now()}`;
    const destination = path.join(WORLDS_DIR, baseName);

    if (await exists(destination)) {
      throw new Error("Nama world bentrok, upload ditolak.");
    }

    await moveDirectory(selectedWorld, destination);

    return {
      world: baseName,
      worlds: await listWorlds(),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function findLevelDatCandidates(rootPath: string, depth = 0): Promise<string[]> {
  if (depth > 4) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const hasLevelDat = entries.some((entry) => entry.isFile() && entry.name === "level.dat");
  if (hasLevelDat) {
    return [rootPath];
  }

  const result: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = path.join(rootPath, entry.name);
    const childResult = await findLevelDatCandidates(child, depth + 1);
    result.push(...childResult);
  }

  return result;
}

async function listPackByType(type: PackType): Promise<PackSummary[]> {
  const dir = type === "behavior" ? BEHAVIOR_PACKS_DIR : RESOURCE_PACKS_DIR;
  await ensureDir(dir);

  const enabledRefs = await readWorldPackRefs(type);
  const enabledMap = new Set(enabledRefs.map((ref) => ref.pack_id));

  const folders = await listDirectories(dir);
  const packs: PackSummary[] = [];

  for (const folder of folders) {
    const folderPath = path.join(dir, folder);
    try {
      const info = await readManifestFromFolder(folderPath);
      const hasNativeSettings = Boolean(await findNativePackSettingsFile(type, folderPath));
      packs.push({
        id: info.uuid,
        name: info.name,
        version: info.version,
        type,
        folder,
        enabled: enabledMap.has(info.uuid),
        hasSettings: hasNativeSettings,
      });
    } catch {
      continue;
    }
  }

  packs.sort((a, b) => a.name.localeCompare(b.name));
  return packs;
}

export async function listPacks() {
  const [resource, behavior] = await Promise.all([listPackByType("resource"), listPackByType("behavior")]);

  return { resource, behavior };
}

export async function setPackEnabled(type: PackType, packId: string, version: string, enabled: boolean) {
  const refs = await readWorldPackRefs(type);
  const existingIndex = refs.findIndex((item) => item.pack_id === packId);

  if (enabled && existingIndex === -1) {
    refs.push({
      pack_id: packId,
      version: parseVersion(version),
    });
  }

  if (!enabled && existingIndex >= 0) {
    refs.splice(existingIndex, 1);
  }

  await writeWorldPackRefs(type, refs);
  return listPacks();
}

async function findPackFolderById(type: PackType, packId: string) {
  const dir = type === "behavior" ? BEHAVIOR_PACKS_DIR : RESOURCE_PACKS_DIR;
  const folders = await listDirectories(dir);

  for (const folder of folders) {
    const folderPath = path.join(dir, folder);
    try {
      const info = await readManifestFromFolder(folderPath);
      if (info.uuid === packId) {
        return { folder, folderPath, info };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function deletePack(type: PackType, packId: string) {
  const found = await findPackFolderById(type, packId);
  if (!found) {
    throw new Error("Addon tidak ditemukan.");
  }

  const refs = await readWorldPackRefs(type);
  const filtered = refs.filter((item) => item.pack_id !== packId);
  await writeWorldPackRefs(type, filtered);

  await fs.rm(found.folderPath, { recursive: true, force: true });
  return listPacks();
}

export async function readBehaviorPackSettings(packId: string) {
  return await readPackSettings("behavior", packId);
}

export async function updateBehaviorPackSettings(packId: string, settings: unknown) {
  return await updatePackSettings("behavior", packId, settings);
}

export async function readPackSettings(type: PackType, packId: string) {
  const found = await findPackFolderById(type, packId);
  if (!found) {
    throw new Error("Addon tidak ditemukan.");
  }

  const nativeSettingsPath = await findNativePackSettingsFile(type, found.folderPath);
  const settingsPath = nativeSettingsPath ?? getFallbackPackSettingsPath(found.folderPath);
  const settingsExists = await exists(settingsPath);
  const settingsRaw = await readJsonFileOrDefault(settingsPath, null);
  const defaults = buildDefaultPackSettings(type);
  const settings = isPlainObject(settingsRaw) ? { ...defaults, ...settingsRaw } : { ...defaults };

  if (!nativeSettingsPath && (!settingsExists || !isPlainObject(settingsRaw) || JSON.stringify(settingsRaw) !== JSON.stringify(settings))) {
    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  }

  return {
    type,
    packId,
    packName: found.info.name,
    settingsPath,
    hasNativeSettings: Boolean(nativeSettingsPath),
    settings,
  };
}

export async function updatePackSettings(type: PackType, packId: string, settings: unknown) {
  const found = await findPackFolderById(type, packId);
  if (!found) {
    throw new Error("Addon tidak ditemukan.");
  }

  const nativeSettingsPath = await findNativePackSettingsFile(type, found.folderPath);
  const settingsPath = nativeSettingsPath ?? getFallbackPackSettingsPath(found.folderPath);

  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  return await readPackSettings(type, packId);
}

export async function readWorldSettings(worldName: string) {
  const worldPath = path.join(WORLDS_DIR, worldName);
  if (!(await exists(worldPath))) {
    throw new Error("World tidak ditemukan.");
  }

  const settingsPath = getWorldSettingsPath(worldName);
  const settingsExists = await exists(settingsPath);
  const settingsRaw = await readJsonFileOrDefault(settingsPath, null);
  const defaults = await buildDefaultWorldSettings();
  const settings = isPlainObject(settingsRaw) ? { ...defaults, ...settingsRaw } : defaults;

  if (!settingsExists || !isPlainObject(settingsRaw) || JSON.stringify(settingsRaw) !== JSON.stringify(settings)) {
    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  }

  return {
    worldName,
    settingsPath,
    settings,
  };
}

export async function updateWorldSettings(worldName: string, settings: unknown) {
  const worldPath = path.join(WORLDS_DIR, worldName);
  if (!(await exists(worldPath))) {
    throw new Error("World tidak ditemukan.");
  }

  const settingsPath = getWorldSettingsPath(worldName);
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");

  return await readWorldSettings(worldName);
}

export async function uploadPack(file: File) {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".mcpack") && !lower.endsWith(".mcaddon")) {
    throw new Error("File addon harus .mcpack atau .mcaddon");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mbd-pack-"));
  const zipPath = path.join(tempDir, file.name);
  await fs.writeFile(zipPath, Buffer.from(await file.arrayBuffer()));

  const extractDir = path.join(tempDir, "extract");
  await ensureDir(extractDir);

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    let candidateFolders = await findManifestFolders(extractDir);
    if (candidateFolders.length === 0) {
      throw new Error("Manifest addon tidak ditemukan.");
    }

    candidateFolders = [...new Set(candidateFolders)];

    const existingUuids = await collectExistingUuids();
    const seenUploadUuids = new Set<string>();
    const moved: Array<{ type: PackType; folder: string }> = [];

    for (const manifestFolder of candidateFolders) {
      const raw = await fs.readFile(path.join(manifestFolder, "manifest.json"), "utf-8");
      const info = readManifestInfo(raw);

      if (existingUuids.has(info.uuid) || seenUploadUuids.has(info.uuid)) {
        throw new Error(`UUID bentrok (${info.uuid}), upload ditolak.`);
      }
      seenUploadUuids.add(info.uuid);

      const baseDir = info.type === "behavior" ? BEHAVIOR_PACKS_DIR : RESOURCE_PACKS_DIR;
      await ensureDir(baseDir);

      const folderName = `${sanitizeName(info.name) || "pack"}-${info.uuid.slice(0, 8)}`;
      const destination = path.join(baseDir, folderName);

      if (await exists(destination)) {
        throw new Error(`Nama folder bentrok (${folderName}), upload ditolak.`);
      }

      await moveDirectory(manifestFolder, destination);
      moved.push({ type: info.type, folder: folderName });
    }

    return {
      uploaded: moved,
      packs: await listPacks(),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
