// Тонкая обёртка над fetch: JWT в localStorage и тихое обновление
// access-токена по refresh при 401 (участник входит по SMS один раз).
const ACCESS_KEY = "koko_access";
const REFRESH_KEY = "koko_refresh";

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function hasToken() {
  return !!localStorage.getItem(ACCESS_KEY);
}

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Single-flight: параллельные 401 ждут один запрос обновления.
let refreshing: Promise<string | null> | null = null;

function refreshAccess(): Promise<string | null> {
  if (refreshing) return refreshing;
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return Promise.resolve(null);
  refreshing = fetch("/api/auth/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (res) => {
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const body = await res.json();
      setTokens(body.access);
      return body.access as string;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Ошибка DRF бывает {"detail": "..."} или {"поле": ["..."]} — показываем первое понятное.
function errorMessage(body: Record<string, unknown>, status: number): string {
  if (typeof body.detail === "string") return body.detail;
  for (const value of Object.values(body)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
  }
  return status >= 500 ? "Сервер не отвечает, попробуйте позже" : "Что-то пошло не так";
}

async function request<T>(path: string, options: RequestInit, retry = true): Promise<T> {
  const token = localStorage.getItem(ACCESS_KEY);
  const isForm = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const fresh = await refreshAccess();
    if (fresh) return request<T>(path, options, false);
    // токен протух насовсем — дальше как гость (портал открыт всем)
    clearTokens();
    if (token) return request<T>(path, options, false);
  }
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status), body);
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data instanceof FormData ? data : JSON.stringify(data ?? {}),
    }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
