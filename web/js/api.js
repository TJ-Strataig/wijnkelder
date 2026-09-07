// Communicatie met de backend. Het sessietoken staat alleen in localStorage van deze app en wordt als Bearer-header meegestuurd.
import { API_BASE } from '../config.js';

const TOKEN_KEY = 'wijnkelder.session';
const USER_KEY = 'wijnkelder.user';

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  get user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } },
  set({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || null; }
}

export function photoUrl(path) {
  return path ? `${API_BASE}${path}` : null;
}

async function request(method, path, body, { raw = false, contentType } = {}) {
  const headers = {};
  if (session.token) headers['Authorization'] = `Bearer ${session.token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  } else if (contentType) {
    headers['Content-Type'] = contentType;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload, credentials: 'omit', mode: 'cors' });
  } catch {
    throw new ApiError(0, 'Geen verbinding met de server.');
  }
  if (res.status === 401) {
    session.clear();
    window.dispatchEvent(new CustomEvent('wk:logout'));
    throw new ApiError(401, 'Je bent uitgelogd. Log opnieuw in.');
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, 'Downloaden mislukt.');
    return res;
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Fout ${res.status}`, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (blob) => request('POST', '/api/photos', blob, { contentType: blob.type || 'image/jpeg' }),
  download: (p) => request('GET', p, undefined, { raw: true }),
};
