import path from "node:path";

export const ROOT_DIR = process.cwd();
export const BEDROCK_DIR = path.join(ROOT_DIR, "bedrock-server");
export const BEDROCK_BINARY = path.join(BEDROCK_DIR, "bedrock_server");
export const SERVER_PROPERTIES_PATH = path.join(BEDROCK_DIR, "server.properties");
export const WORLDS_DIR = path.join(BEDROCK_DIR, "worlds");
export const RESOURCE_PACKS_DIR = path.join(BEDROCK_DIR, "resource_packs");
export const BEHAVIOR_PACKS_DIR = path.join(BEDROCK_DIR, "behavior_packs");
