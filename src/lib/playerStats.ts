import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ROOT_DIR } from "./paths";

type PlayerRow = {
  player_id: string;
  player_name: string;
  total_play_ms: number;
  session_start_ms: number | null;
  last_seen_ms: number | null;
};

const dbPath = path.join(ROOT_DIR, "data", "dashboard.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    player_name TEXT NOT NULL,
    total_play_ms INTEGER NOT NULL DEFAULT 0,
    session_start_ms INTEGER,
    last_seen_ms INTEGER
  );
`);

const selectPlayerStmt = db.prepare("SELECT player_id, player_name, total_play_ms, session_start_ms, last_seen_ms FROM players WHERE player_id = ?");
const insertPlayerStmt = db.prepare(`
  INSERT INTO players (player_id, player_name, total_play_ms, session_start_ms, last_seen_ms)
  VALUES (?, ?, 0, NULL, NULL)
  ON CONFLICT(player_id) DO UPDATE SET player_name = excluded.player_name
`);
const updateJoinStmt = db.prepare(`
  UPDATE players
  SET player_name = ?, session_start_ms = COALESCE(session_start_ms, ?), last_seen_ms = ?
  WHERE player_id = ?
`);
const updateLeaveStmt = db.prepare(`
  UPDATE players
  SET player_name = ?, total_play_ms = ?, session_start_ms = NULL, last_seen_ms = ?
  WHERE player_id = ?
`);
const listPlayersStmt = db.prepare(`
  SELECT player_id, player_name, total_play_ms, session_start_ms, last_seen_ms
  FROM players
  ORDER BY total_play_ms DESC, player_name ASC
`);

type ParsedEvent = {
  timestampMs: number;
  type: "join" | "leave";
  playerId: string;
  playerName: string;
};

function normalizePlayerName(name: string) {
  return name.trim().toLowerCase();
}

function buildPlayerId(playerName: string) {
  return normalizePlayerName(playerName);
}

function parseTimestamp(line: string) {
  const match = line.match(/\[(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2}):(\d{3})/);
  if (!match) {
    return Date.now();
  }

  const [, yy, mm, dd, hh, min, ss, ms] = match;
  return new Date(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss), Number(ms)).getTime();
}

function parseEvent(line: string): ParsedEvent | null {
  const timestampMs = parseTimestamp(line);

  const joinXuid = line.match(/Player connected:\s*([^,]+?)(?:,\s*|\s+)xuid:\s*([^,\s]+)/i);
  if (joinXuid) {
    const playerName = joinXuid[1].trim();
    return {
      timestampMs,
      type: "join",
      playerName,
      playerId: buildPlayerId(playerName),
    };
  }

  const leaveXuid = line.match(/Player disconnected:\s*([^,]+?)(?:,\s*|\s+)xuid:\s*([^,\s]+)/i);
  if (leaveXuid) {
    const playerName = leaveXuid[1].trim();
    return {
      timestampMs,
      type: "leave",
      playerName,
      playerId: buildPlayerId(playerName),
    };
  }

  const joinName = line.match(/\[INFO\]\s+([^\[]+?)\s+joined the game/i);
  if (joinName) {
    const name = joinName[1].trim();
    return {
      timestampMs,
      type: "join",
      playerName: name,
      playerId: buildPlayerId(name),
    };
  }

  const leaveName = line.match(/\[INFO\]\s+([^\[]+?)\s+left the game/i);
  if (leaveName) {
    const name = leaveName[1].trim();
    return {
      timestampMs,
      type: "leave",
      playerName: name,
      playerId: buildPlayerId(name),
    };
  }

  return null;
}

function ensurePlayer(playerId: string, playerName: string) {
  insertPlayerStmt.run(playerId, playerName);
  const row = selectPlayerStmt.get(playerId) as PlayerRow | undefined;
  if (!row) {
    throw new Error("Gagal membuat data player.");
  }
  return row;
}

function applyEvent(event: ParsedEvent) {
  const current = ensurePlayer(event.playerId, event.playerName);

  if (event.type === "join") {
    updateJoinStmt.run(event.playerName, event.timestampMs, event.timestampMs, event.playerId);
    return;
  }

  const sessionStart = current.session_start_ms;
  const sessionDuration = sessionStart ? Math.max(0, event.timestampMs - sessionStart) : 0;
  const totalPlay = Math.max(0, (current.total_play_ms ?? 0) + sessionDuration);
  updateLeaveStmt.run(event.playerName, totalPlay, event.timestampMs, event.playerId);
}

export function ingestPlayerLogLine(line: string) {
  const event = parseEvent(line);
  if (!event) {
    return false;
  }

  applyEvent(event);
  return true;
}

export function listPlayersByDuration() {
  const rows = listPlayersStmt.all() as PlayerRow[];
  return rows.map((row) => {
    const liveDurationMs = row.session_start_ms ? Math.max(0, Date.now() - row.session_start_ms) : 0;
    const totalDurationMs = row.total_play_ms + liveDurationMs;

    return {
      id: row.player_id,
      name: row.player_name,
      totalDurationMs,
      totalDurationMinutes: Math.floor(totalDurationMs / 60000),
      totalDurationHours: Number((totalDurationMs / 3600000).toFixed(2)),
      online: Boolean(row.session_start_ms),
      lastSeenMs: row.last_seen_ms,
    };
  });
}
