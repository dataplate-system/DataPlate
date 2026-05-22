const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const ACCESS_TOKEN_KEY = "dataplate:accessToken";
const REFRESH_TOKEN_KEY = "dataplate:refreshToken";

type RequestOptions = RequestInit & { retry?: boolean };

function getToken(key: string, legacyKey: string) {
  return localStorage.getItem(key) || localStorage.getItem(legacyKey);
}

export function saveAuthTokens(auth: { token?: string; refreshToken?: string } | null) {
  if (!auth) return;
  if (auth.token) localStorage.setItem(ACCESS_TOKEN_KEY, auth.token);
  if (auth.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
}

async function refreshAccessToken() {
  const refreshToken = getToken(REFRESH_TOKEN_KEY, "refreshToken");
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;

  const auth = await response.json();
  saveAuthTokens(auth);
  return auth.token as string | undefined;
}

export async function apiFetch(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  const token = getToken(ACCESS_TOKEN_KEY, "token");

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const shouldRetry = options.retry !== false && (response.status === 401 || response.status === 403);

  if (!shouldRetry) return response;

  const newToken = await refreshAccessToken();
  if (!newToken) return response;

  headers.set("Authorization", `Bearer ${newToken}`);
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers, retry: false } as RequestOptions);
}

export default apiFetch;
