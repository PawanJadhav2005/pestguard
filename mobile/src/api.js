import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { io } from 'socket.io-client';

const DEFAULT_URL = Constants.expoConfig?.extra?.apiUrl || 'http://192.168.1.10:4000';
let baseUrl = DEFAULT_URL;
let token = null;
let onUnauthorized = () => {};

export const session = {
  async load() {
    baseUrl = (await SecureStore.getItemAsync('pg_server')) || DEFAULT_URL;
    token = await SecureStore.getItemAsync('pg_token');
    return { token, baseUrl };
  },
  async setServer(url) { baseUrl = url.replace(/\/+$/, ''); await SecureStore.setItemAsync('pg_server', baseUrl); },
  async setToken(t) { token = t; if (t) await SecureStore.setItemAsync('pg_token', t); else await SecureStore.deleteItemAsync('pg_token'); },
  get baseUrl() { return baseUrl; },
  get token() { return token; },
  onUnauthorized(fn) { onUnauthorized = fn; }
};

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error(`Cannot reach the server at ${baseUrl}. Check your internet and the server address.`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Upload a photo or signature file. Returns the server's file name.
export async function uploadFile(uri, mimeType = 'image/jpeg') {
  const form = new FormData();
  form.append('file', { uri, name: mimeType === 'image/png' ? 'photo.png' : 'photo.jpg', type: mimeType });
  let res;
  try {
    res = await fetch(`${baseUrl}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch { throw new Error('Upload failed. Check your internet connection.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.file;
}

// Live updates: one socket and a small event bus every screen can listen to
let socket = null;
const bus = new Map();
export function onLive(event, fn) { if (!bus.has(event)) bus.set(event, new Set()); bus.get(event).add(fn); return () => bus.get(event).delete(fn); }
export function connectLive() {
  socket?.disconnect();
  socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });
  socket.onAny((e, p) => bus.get(e)?.forEach(fn => fn(p)));
  return socket;
}
export function disconnectLive() { socket?.disconnect(); socket = null; }
