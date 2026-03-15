import fs from "node:fs/promises";
import { SERVER_PROPERTIES_PATH } from "./paths";

const editableKeys = [
  "server-name",
  "gamemode",
  "difficulty",
  "allow-cheats",
  "max-players",
  "online-mode",
  "allow-list",
  "server-port",
  "server-portv6",
  "enable-lan-visibility",
  "view-distance",
  "tick-distance",
  "player-idle-timeout",
  "max-threads",
  "level-name",
  "level-seed",
  "default-player-permission-level",
  "texturepack-required",
] as const;

type EditableKey = (typeof editableKeys)[number];

type ParsedProperties = {
  lines: string[];
  values: Record<string, string>;
};

export type ServerSettings = Record<EditableKey, string>;

function parse(content: string): ParsedProperties {
  const lines = content.split(/\r?\n/);
  const values: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return { lines, values };
}

function validateSettings(input: Partial<ServerSettings>) {
  const errors: string[] = [];

  const integerInRange = (key: EditableKey, min: number, max: number) => {
    const raw = input[key];
    if (raw === undefined) {
      return;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${key} harus angka bulat rentang ${min}-${max}`);
    }
  };

  const oneOf = (key: EditableKey, options: string[]) => {
    const raw = input[key];
    if (raw === undefined) {
      return;
    }
    if (!options.includes(raw)) {
      errors.push(`${key} harus salah satu: ${options.join(", ")}`);
    }
  };

  const boolString = (key: EditableKey) => {
    oneOf(key, ["true", "false"]);
  };

  oneOf("gamemode", ["survival", "creative", "adventure"]);
  oneOf("difficulty", ["peaceful", "easy", "normal", "hard"]);
  oneOf("default-player-permission-level", ["visitor", "member", "operator"]);
  boolString("allow-cheats");
  boolString("online-mode");
  boolString("allow-list");
  boolString("enable-lan-visibility");
  boolString("texturepack-required");

  integerInRange("max-players", 1, 1000);
  integerInRange("server-port", 1, 65535);
  integerInRange("server-portv6", 1, 65535);
  integerInRange("view-distance", 5, 128);
  integerInRange("tick-distance", 4, 12);
  integerInRange("player-idle-timeout", 0, 100000);
  integerInRange("max-threads", 0, 1024);

  const serverName = input["server-name"];
  if (serverName !== undefined && serverName.includes(";")) {
    errors.push("server-name tidak boleh mengandung ';'");
  }

  const levelName = input["level-name"];
  if (levelName !== undefined && /[\\/:*?"<>|]/.test(levelName)) {
    errors.push("level-name mengandung karakter tidak valid");
  }

  return errors;
}

export async function readServerSettings() {
  const content = await fs.readFile(SERVER_PROPERTIES_PATH, "utf-8");
  const parsed = parse(content);

  const settings = {} as ServerSettings;
  for (const key of editableKeys) {
    settings[key] = parsed.values[key] ?? "";
  }

  return settings;
}

export async function updateServerSettings(patch: Partial<ServerSettings>) {
  const errors = validateSettings(patch);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  const content = await fs.readFile(SERVER_PROPERTIES_PATH, "utf-8");
  const parsed = parse(content);
  const lines = [...parsed.lines];
  const touched = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim() as EditableKey;
    const value = patch[key];
    if (value === undefined) {
      continue;
    }

    lines[i] = `${key}=${value}`;
    touched.add(key);
  }

  for (const key of editableKeys) {
    const value = patch[key];
    if (value === undefined || touched.has(key)) {
      continue;
    }
    lines.push(`${key}=${value}`);
  }

  await fs.writeFile(SERVER_PROPERTIES_PATH, `${lines.join("\n")}\n`, "utf-8");
  return readServerSettings();
}

export const settingKeys = editableKeys;
