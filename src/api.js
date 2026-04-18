const API_ROOT = "/api";

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
  const response = await fetch(url, options);
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
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
