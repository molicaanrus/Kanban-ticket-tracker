// Fetch wrapper: JSON in/out, throws ApiError(message, status, code) on failure
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => {
  onUnauthenticated = fn;
};

async function request(method, url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) onUnauthenticated();
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};

export const TYPES = ['bug', 'feature', 'fix'];
export const STATES = ['new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done'];
export const STATE_LABEL = {
  new: 'New',
  ready_for_implementation: 'Ready for implementation',
  in_progress: 'In progress',
  ready_for_acceptance: 'Ready for acceptance',
  done: 'Done',
};
export const TYPE_LABEL = { bug: 'Bug', feature: 'Feature', fix: 'Fix' };

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatUtc(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC';
}
