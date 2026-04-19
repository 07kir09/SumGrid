import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_SIZES, DIFFICULTIES } from "./src/constants.js";
import {
  appendLeaderboardEntry,
  buildLeaderboard,
  calculateRoundScore,
  getPlayerStats,
  isNicknameValid,
  normalizeLeaderboardEntries,
  sanitizeNickname,
} from "./src/scoring.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const RESULTS_FILE = path.join(DATA_DIR, "leaderboard.json");
const PLAYERS_FILE = path.join(DATA_DIR, "players.json");
const PUBLIC_ROOT = __dirname;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
const CORS_ALLOWED_ORIGINS = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  let url = null;

  try {
    url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (isApiPath(url.pathname)) {
      const corsOrigin = getCorsOrigin(request.headers.origin);

      if (request.headers.origin && !corsOrigin) {
        sendJson(response, 403, { error: "Origin is not allowed." });
        return;
      }
    }

    if (isApiPath(url.pathname) && request.method === "OPTIONS") {
      sendEmpty(response, 204, createApiHeaders(request.headers.origin));
      return;
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      sendApiJson(response, request, 200, {
        ok: true,
        service: "sum-grid-api",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/api/profile/availability" && request.method === "GET") {
      await handleGetNicknameAvailability(request, url, response);
      return;
    }

    if (url.pathname === "/api/profile/register" && request.method === "POST") {
      await handleRegisterProfile(request, response);
      return;
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      await handleGetLeaderboard(request, url, response);
      return;
    }

    if (url.pathname === "/api/results" && request.method === "POST") {
      await handlePostResult(request, response);
      return;
    }

    if (isApiPath(url.pathname)) {
      sendApiJson(response, request, 405, { error: "Method not allowed." });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    await serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    console.error(error);

    if (url && isApiPath(url.pathname)) {
      sendApiJson(response, request, 500, { error: "Internal server error." });
      return;
    }

    sendJson(response, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Sum Grid server is running at http://${HOST}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

async function handleGetNicknameAvailability(request, url, response) {
  const nickname = sanitizeNickname(url.searchParams.get("nickname") || "");

  if (!isNicknameValid(nickname)) {
    sendApiJson(response, request, 200, {
      nickname,
      available: false,
      valid: false,
      message: "Ник должен быть длиной от 3 символов и содержать только буквы, цифры, _ или -.",
    });
    return;
  }

  const players = await loadStoredPlayers();
  const available = !isNicknameTaken(players, nickname);

  sendApiJson(response, request, 200, {
    nickname,
    available,
    valid: true,
    message: available ? "Ник свободен." : "Такой ник уже занят.",
  });
}

async function handleRegisterProfile(request, response) {
  const body = await safelyReadBody(request, response);

  if (!body) {
    return;
  }

  const nickname = sanitizeNickname(body.nickname);
  const limit = parseLimit(body.limit);

  if (!isNicknameValid(nickname)) {
    sendApiJson(response, request, 400, {
      error: "Ник должен быть длиной от 3 символов и содержать только буквы, цифры, _ или -.",
    });
    return;
  }

  const players = await loadStoredPlayers();

  if (isNicknameTaken(players, nickname)) {
    sendApiJson(response, request, 409, { error: "Такой ник уже занят." });
    return;
  }

  const nextPlayers = [
    { nickname, createdAt: new Date().toISOString() },
    ...players,
  ];

  await saveStoredPlayers(nextPlayers);

  const entries = await loadStoredEntries();
  const leaderboard = buildLeaderboard(entries);

  sendApiJson(response, request, 201, {
    nickname,
    leaderboard: leaderboard.slice(0, limit),
    currentPlayer: getPlayerStats(leaderboard, nickname),
  });
}

async function handleGetLeaderboard(request, url, response) {
  const limit = parseLimit(url.searchParams.get("limit"));
  const playerName = sanitizeNickname(url.searchParams.get("playerName") || "");
  const entries = await loadStoredEntries();
  const leaderboard = buildLeaderboard(entries);
  const players = await loadStoredPlayers();

  sendApiJson(response, request, 200, {
    leaderboard: leaderboard.slice(0, limit),
    currentPlayer: getPlayerStats(leaderboard, playerName),
    isRegistered: playerName ? isNicknameTaken(players, playerName) : false,
    totalPlayers: leaderboard.length,
    totalResults: entries.length,
  });
}

async function handlePostResult(request, response) {
  const body = await safelyReadBody(request, response);

  if (!body) {
    return;
  }

  const payload = normalizeResultPayload(body);

  if (!payload) {
    sendApiJson(response, request, 400, { error: "Invalid result payload." });
    return;
  }

  const viewerName = sanitizeNickname(body?.viewerName || payload.playerName);
  const limit = parseLimit(body?.limit);
  const players = await loadStoredPlayers();

  if (!isNicknameTaken(players, payload.playerName)) {
    await saveStoredPlayers([
      { nickname: payload.playerName, createdAt: new Date().toISOString() },
      ...players,
    ]);
  }

  const score = calculateRoundScore(payload).score;
  const entry = {
    ...payload,
    wins: 1,
    score,
  };

  const entries = appendLeaderboardEntry(await loadStoredEntries(), entry);
  await saveStoredEntries(entries);

  const leaderboard = buildLeaderboard(entries);

  sendApiJson(response, request, 201, {
    entry,
    leaderboard: leaderboard.slice(0, limit),
    currentPlayer: getPlayerStats(leaderboard, viewerName || payload.playerName),
    totalPlayers: leaderboard.length,
    totalResults: entries.length,
  });
}

async function serveStatic(pathname, response, isHead) {
  const safePathname = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const normalizedPath = path.normalize(safePathname).replace(/^([.][.][/\\])+/, "");
  const resolvedPath = path.resolve(PUBLIC_ROOT, `.${normalizedPath}`);

  if (!resolvedPath.startsWith(PUBLIC_ROOT)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  let filePath = resolvedPath;

  try {
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  let fileBuffer;

  try {
    fileBuffer = await fs.readFile(filePath);
  } catch {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300",
  });

  if (!isHead) {
    response.end(fileBuffer);
    return;
  }

  response.end();
}

async function loadStoredEntries() {
  await ensureDataFiles();

  try {
    const raw = await fs.readFile(RESULTS_FILE, "utf8");
    return normalizeLeaderboardEntries(JSON.parse(raw));
  } catch (error) {
    console.warn("Unable to read leaderboard data.", error);
    return [];
  }
}

async function saveStoredEntries(entries) {
  await ensureDataFiles();
  await fs.writeFile(RESULTS_FILE, JSON.stringify(entries, null, 2), "utf8");
}

async function loadStoredPlayers() {
  await ensureDataFiles();

  try {
    const raw = await fs.readFile(PLAYERS_FILE, "utf8");
    return normalizeStoredPlayers(JSON.parse(raw));
  } catch (error) {
    console.warn("Unable to read player registry.", error);
    return [];
  }
}

async function saveStoredPlayers(players) {
  await ensureDataFiles();
  await fs.writeFile(PLAYERS_FILE, JSON.stringify(normalizeStoredPlayers(players), null, 2), "utf8");
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJsonFile(RESULTS_FILE);
  await ensureJsonFile(PLAYERS_FILE);
}

async function ensureJsonFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "[]\n", "utf8");
  }
}

function normalizeResultPayload(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const playerName = sanitizeNickname(body.playerName);
  const size = BOARD_SIZES.includes(body.size) ? body.size : null;
  const difficultyId = DIFFICULTIES[body.difficultyId] ? body.difficultyId : null;

  if (!playerName || !size || !difficultyId) {
    return null;
  }

  return {
    playerName,
    size,
    difficultyId,
    moves: Number.isFinite(body.moves) ? Math.max(0, body.moves) : 0,
    checks: Number.isFinite(body.checks) ? Math.max(0, body.checks) : 0,
    hintsUsed: Number.isFinite(body.hintsUsed) ? Math.max(0, body.hintsUsed) : 0,
    solutionRevealCount: Number.isFinite(body.solutionRevealCount)
      ? Math.max(0, body.solutionRevealCount)
      : 0,
    elapsedMs: Number.isFinite(body.elapsedMs) ? Math.max(0, body.elapsedMs) : 0,
    boardId: typeof body.boardId === "string" ? body.boardId : "unknown-board",
    createdAt:
      typeof body.createdAt === "string" && Number.isFinite(Date.parse(body.createdAt))
        ? new Date(body.createdAt).toISOString()
        : new Date().toISOString(),
  };
}

function normalizeStoredPlayers(players) {
  if (!Array.isArray(players)) {
    return [];
  }

  const seen = new Set();

  return players
    .map((entry) => normalizeStoredPlayer(entry))
    .filter((entry) => {
      if (!entry) {
        return false;
      }

      const key = entry.nickname.toLocaleLowerCase("ru-RU");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function normalizeStoredPlayer(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const nickname = sanitizeNickname(entry.nickname);

  if (!isNicknameValid(nickname)) {
    return null;
  }

  return {
    nickname,
    createdAt:
      typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt))
        ? new Date(entry.createdAt).toISOString()
        : new Date().toISOString(),
  };
}

function isNicknameTaken(players, nickname) {
  const normalizedNickname = sanitizeNickname(nickname).toLocaleLowerCase("ru-RU");

  return players.some(
    (entry) => entry.nickname.toLocaleLowerCase("ru-RU") === normalizedNickname
  );
}

async function safelyReadBody(request, response) {
  try {
    return await readJsonBody(request);
  } catch (error) {
    sendApiJson(response, request, 400, {
      error: error instanceof Error ? error.message : "Unable to parse request body.",
    });
    return null;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseLimit(value) {
  const limit = Number.parseInt(String(value || DEFAULT_LIMIT), 10);

  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function parseAllowedOrigins(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    return ["*"];
  }

  return origins;
}

function getCorsOrigin(origin) {
  if (!origin) {
    return "*";
  }

  if (!CORS_ALLOWED_ORIGINS || CORS_ALLOWED_ORIGINS.length === 0) {
    return origin;
  }

  if (CORS_ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }

  return CORS_ALLOWED_ORIGINS.includes(origin) ? origin : "";
}

function createApiHeaders(origin) {
  const allowOrigin = getCorsOrigin(origin);
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  if (!allowOrigin) {
    return headers;
  }

  return {
    ...headers,
    "Access-Control-Allow-Origin": allowOrigin,
  };
}

function sendApiJson(response, request, statusCode, payload) {
  sendJson(response, statusCode, payload, createApiHeaders(request.headers.origin));
}

function sendEmpty(response, statusCode, headers = {}) {
  response.writeHead(statusCode, headers);
  response.end();
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}
