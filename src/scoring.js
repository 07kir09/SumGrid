import { DEFAULT_PLAYER_NAME } from "./constants.js";
import { clamp } from "./utils.js";

const DIFFICULTY_SCORE_MULTIPLIERS = {
  easy: 0.82,
  classic: 1,
  hard: 1.34,
  expert: 1.72,
};

const DIFFICULTY_TIME_MULTIPLIERS = {
  easy: 0.86,
  classic: 1,
  hard: 1.18,
  expert: 1.36,
};

const BOARD_SCORE_MULTIPLIERS = {
  4: 0.88,
  5: 1,
  6: 1.24,
  7: 1.52,
};

const EXPECTED_TIME_SECONDS = {
  4: 110,
  5: 180,
  6: 290,
  7: 420,
};

const EXPECTED_MOVES = {
  4: 18,
  5: 28,
  6: 41,
  7: 58,
};

const SCORE_BASELINE = 1000;
const SCORE_FLOOR = 60;
const SCORE_CAP = 9999;
const LEADERBOARD_LIMIT = 200;

export function normalizePlayerName(value) {
  const normalized =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 24) : "";

  return normalized || DEFAULT_PLAYER_NAME;
}

export function calculateRoundScore({
  size,
  difficultyId,
  elapsedMs,
  moves,
  checks,
  hintsUsed,
  solutionRevealCount,
}) {
  const safeSize = Number.isFinite(size) ? size : 5;
  const safeDifficulty = DIFFICULTY_SCORE_MULTIPLIERS[difficultyId]
    ? difficultyId
    : "classic";
  const safeElapsedSeconds = Math.max(30, Math.round((elapsedMs ?? 0) / 1000));
  const safeMoves = Math.max(0, Number.isFinite(moves) ? moves : 0);
  const safeChecks = Math.max(0, Number.isFinite(checks) ? checks : 0);
  const safeHints = Math.max(0, Number.isFinite(hintsUsed) ? hintsUsed : 0);
  const safeSolutionReveals = Math.max(
    0,
    Number.isFinite(solutionRevealCount) ? solutionRevealCount : 0
  );

  const difficultyMultiplier = DIFFICULTY_SCORE_MULTIPLIERS[safeDifficulty] ?? 1;
  const boardMultiplier = BOARD_SCORE_MULTIPLIERS[safeSize] ?? 1;
  const baseScore = Math.round(
    SCORE_BASELINE * difficultyMultiplier * boardMultiplier
  );

  const expectedSeconds = Math.round(
    (EXPECTED_TIME_SECONDS[safeSize] ?? EXPECTED_TIME_SECONDS[5]) *
      (DIFFICULTY_TIME_MULTIPLIERS[safeDifficulty] ?? 1)
  );
  const timeFactor = clamp(expectedSeconds / safeElapsedSeconds, 0.42, 1.4);
  const timeAdjustment = Math.round(baseScore * (timeFactor - 1));

  const expectedMoves = Math.round(
    (EXPECTED_MOVES[safeSize] ?? EXPECTED_MOVES[5]) *
      (0.9 + difficultyMultiplier * 0.34)
  );
  const extraMoves = Math.max(0, safeMoves - expectedMoves);
  const movePenalty = extraMoves * 9;
  const checkPenalty = safeChecks * 18;
  const hintPenalty = safeHints * Math.round(baseScore * 0.12);
  const solutionPenalty =
    safeSolutionReveals * Math.round(baseScore * 0.32);

  const rawScore =
    baseScore +
    timeAdjustment -
    movePenalty -
    checkPenalty -
    hintPenalty -
    solutionPenalty;

  return {
    score: clamp(Math.round(rawScore), SCORE_FLOOR, SCORE_CAP),
    breakdown: {
      baseScore,
      expectedSeconds,
      timeAdjustment,
      expectedMoves,
      movePenalty,
      checkPenalty,
      hintPenalty,
      solutionPenalty,
    },
  };
}

export function appendLeaderboardEntry(entries, entry) {
  const normalizedEntries = normalizeLeaderboardEntries(entries);
  const normalizedEntry = normalizeLeaderboardEntry(entry);

  if (!normalizedEntry) {
    return normalizedEntries;
  }

  return [normalizedEntry, ...normalizedEntries].slice(0, LEADERBOARD_LIMIT);
}

export function normalizeLeaderboardEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeLeaderboardEntry(entry))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, LEADERBOARD_LIMIT);
}

export function buildLeaderboard(entries) {
  const grouped = new Map();

  normalizeLeaderboardEntries(entries).forEach((entry) => {
    const key = entry.playerName.toLocaleLowerCase("ru-RU");
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        key,
        playerName: entry.playerName,
        totalScore: entry.score,
        wins: 1,
        bestScore: entry.score,
        lastPlayedAt: entry.createdAt,
      });
      return;
    }

    current.playerName = entry.playerName;
    current.totalScore += entry.score;
    current.wins += 1;
    current.bestScore = Math.max(current.bestScore, entry.score);

    if (Date.parse(entry.createdAt) > Date.parse(current.lastPlayedAt)) {
      current.lastPlayedAt = entry.createdAt;
    }
  });

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      averageScore: Math.round(entry.totalScore / entry.wins),
    }))
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }

      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      if (right.bestScore !== left.bestScore) {
        return right.bestScore - left.bestScore;
      }

      const timeDelta =
        Date.parse(right.lastPlayedAt) - Date.parse(left.lastPlayedAt);

      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.playerName.localeCompare(right.playerName, "ru-RU");
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export function getPlayerStats(entries, playerName) {
  const normalizedName = normalizePlayerName(playerName);
  const leaderboard =
    Array.isArray(entries) && entries.every((entry) => entry && "totalScore" in entry)
      ? entries
      : buildLeaderboard(entries);
  const stats = leaderboard.find(
    (entry) => entry.playerName.toLocaleLowerCase("ru-RU") === normalizedName.toLocaleLowerCase("ru-RU")
  );

  if (stats) {
    return stats;
  }

  return {
    playerName: normalizedName,
    totalScore: 0,
    wins: 0,
    bestScore: 0,
    averageScore: 0,
    rank: null,
    lastPlayedAt: null,
  };
}

function normalizeLeaderboardEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const score = Math.max(0, Number.isFinite(entry.score) ? entry.score : 0);
  const wins = Math.max(0, Number.isFinite(entry.wins) ? entry.wins : 1);
  const size = Number.isFinite(entry.size) ? entry.size : 5;
  const moves = Math.max(0, Number.isFinite(entry.moves) ? entry.moves : 0);
  const checks = Math.max(0, Number.isFinite(entry.checks) ? entry.checks : 0);
  const hintsUsed = Math.max(0, Number.isFinite(entry.hintsUsed) ? entry.hintsUsed : 0);
  const solutionRevealCount = Math.max(
    0,
    Number.isFinite(entry.solutionRevealCount) ? entry.solutionRevealCount : 0
  );
  const elapsedMs = Math.max(0, Number.isFinite(entry.elapsedMs) ? entry.elapsedMs : 0);
  const createdAt = normalizeTimestamp(entry.createdAt);

  return {
    playerName: normalizePlayerName(entry.playerName),
    score,
    wins,
    size,
    difficultyId:
      typeof entry.difficultyId === "string" ? entry.difficultyId : "classic",
    moves,
    checks,
    hintsUsed,
    solutionRevealCount,
    elapsedMs,
    boardId: typeof entry.boardId === "string" ? entry.boardId : "unknown",
    createdAt,
  };
}

function normalizeTimestamp(value) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}
