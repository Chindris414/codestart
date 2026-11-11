export type User = { id: number; email: string; name: string };

export type ApiData = {
  user?: User | null;
  error?: string;
  errors?: Record<string, string[]>;
  detail?: string;
};

export type ApiResult = { ok: boolean; status: number; data: ApiData };

// Where to go after logging in or signing up. Only a same-site path is
// allowed, so a crafted ?next= link cannot send the learner to another site
// ("//evil.com" and "/\evil.com" are protocol-relative URLs, not paths).
export function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return raw;
  }
  return "/";
}

// Read a cookie value in the browser (the csrftoken cookie is readable; sessionid is not)
function getCookie(name: string): string | null {
  const row = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : null;
}

// Make sure Django has given us a CSRF cookie before the first POST
async function ensureCsrfCookie() {
  if (!getCookie("csrftoken")) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
  }
}

// POST JSON to our API, with the CSRF token in the X-CSRFToken header
export async function postJson(path: string, body: unknown = {}): Promise<ApiResult> {
  await ensureCsrfCookie();
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken") ?? "",
    },
    body: JSON.stringify(body),
  });
  const data: ApiData = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}