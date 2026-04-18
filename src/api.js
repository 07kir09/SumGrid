const API_ROOT = resolveApiRoot();

export async function checkNicknameAvailability(nickname) {
  const params = new URLSearchParams();
  params.set("nickname", nickname);
  return requestJson(`${API_ROOT}/profile/availability?${params.toString()}`);
}

export async function registerNickname(nickname, { limit = 8 } = {}) {
  return requestJson(`${API_ROOT}/profile/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nickname,
      limit,
    }),
  });
}

export async function fetchLeaderboard({ playerName = "", limit = 8 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  if (playerName) {
    params.set("playerName", playerName);
  }

  return requestJson(`${API_ROOT}/leaderboard?${params.toString()}`);
}

export async function submitResult(
  result,
  { viewerName = result?.playerName ?? "", limit = 8 } = {}
) {
  return requestJson(`${API_ROOT}/results`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...result,
      viewerName,
      limit,
    }),
  });
}

async function requestJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(buildBackendUnavailableMessage());
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new Error(buildRequestError(response.status, payload));
  }

  return payload;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { error: text } : null;
}

function resolveApiRoot() {
  if (typeof window === "undefined") {
    return "/api";
  }

  const configuredRoot =
    readConfiguredApiRoot(window.__SUMGRID_API_ROOT__) ||
    readConfiguredApiRoot(
      document.querySelector('meta[name="sumgrid-api-root"]')?.getAttribute("content")
    );

  if (configuredRoot) {
    return configuredRoot;
  }

  const { protocol, hostname, port, origin } = window.location;
  const isLocalhost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

  if (protocol === "file:") {
    return "http://localhost:4173/api";
  }

  if (isLocalhost && port && port !== "4173") {
    return `${protocol}//${hostname}:4173/api`;
  }

  return `${origin}/api`;
}

function readConfiguredApiRoot(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().replace(/\/+$/, "");

  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

function buildRequestError(status, payload) {
  if (status === 404 || status === 405) {
    return `Backend рейтинга не найден по адресу ${API_ROOT}. Открой игру через npm start или укажи URL backend в meta[name="sumgrid-api-root"].`;
  }

  return payload?.error || `Request failed with status ${status}`;
}

function buildBackendUnavailableMessage() {
  return `Не удалось подключиться к backend рейтинга по адресу ${API_ROOT}. Проверь, что сервер запущен и доступен.`;
}
