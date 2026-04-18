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
  normalizeLeaderboardEntries,
  normalizePlayerName,
} from "./src/scoring.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const RESULTS_FILE = path.join(DATA_DIR, "leaderboard.json");
const PUBLIC_ROOT = __dirname;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      await handleGetLeaderboard(url, response);
      return;
    }

    if (url.pathname === "/api/results" && request.method === "POST") {
      await handlePostResult(request, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    await serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Sum Grid server is running at http://${HOST}:${PORT}`);
});

async function handleGetLeaderboard(url, response) {
  const limit = parseLimit(url.searchParams.get("limit"));
  const playerName = normalizePlayerName(url.searchParams.get("playerName") || "");
  const entries = await loadStoredEntries();
  const leaderboard = buildLeaderboard(entries);

  sendJson(response, 200, {
    leaderboard: leaderboard.slice(0, limit),
    currentPlayer: getPlayerStats(leaderboard, playerName),
    totalPlayers: leaderboard.length,
    totalResults: entries.length,
  });
}

async function handlePostResult(request, response) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, {
      error:
        error instanceof Error ? error.message : "Unable to parse request body.",
    });
    return;
  }

  const payload = normalizeResultPayload(body);

  if (!payload) {
    sendJson(response, 400, { error: "Invalid result payload." });
    return;
  }

  const viewerName = normalizePlayerName(body?.viewerName || payload.playerName);
  const limit = parseLimit(body?.limit);
  const score = calculateRoundScore(payload).score;
  const entry = {
    ...payload,
    wins: 1,
    score,
  };

  const entries = appendLeaderboardEntry(await loadStoredEntries(), entry);
  await saveStoredEntries(entries);

  const leaderboard = buildLeaderboard(entries);

  sendJson(response, 201, {
    entry,
    leaderboard: leaderboard.slice(0, limit),
    currentPlayer: getPlayerStats(leaderboard, viewerName),
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
  await ensureResultsFile();

  try {
    const raw = await fs.readFile(RESULTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeLeaderboardEntries(parsed);
  } catch (error) {
    console.warn("Unable to read leaderboard data.", error);
    return [];
  }
}

async function saveStoredEntries(entries) {
  await ensureResultsFile();
  await fs.writeFile(RESULTS_FILE, JSON.stringify(entries, null, 2), "utf8");
}

async function ensureResultsFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(RESULTS_FILE);
  } catch {
    await fs.writeFile(RESULTS_FILE, "[]\n", "utf8");
  }
}

function normalizeResultPayload(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const size = BOARD_SIZES.includes(body.size) ? body.size : null;
  const difficultyId = DIFFICULTIES[body.difficultyId] ? body.difficultyId : null;

  if (!size || !difficultyId) {
    return null;
  }

  return {
    playerName: normalizePlayerName(body.playerName),
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

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function parseLimit(value) {
  const limit = Number.parseInt(String(value || DEFAULT_LIMIT), 10);

  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}
