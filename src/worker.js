import { parseWeight, validDay, publicEntry } from './domain.js';

const SESSION_AGE = 30 * 24 * 60 * 60;
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...SECURITY, ...headers } });
}
function json(body, status = 200, headers = {}) {
  return response(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
}
function redirect(path, headers = {}) {
  return response(null, 302, { Location: path, ...headers });
}
function randomToken(bytes = 32) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function cookieName(request, kind) {
  return `${new URL(request.url).protocol === 'https:' ? '__Host-' : ''}weight_${kind}`;
}
function cookie(request, kind, value, age) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}
function readCookie(request, kind) {
  const name = `${cookieName(request, kind)}=`;
  return (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(name))?.slice(name.length);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);
function configurationReady(env) {
  try {
    const url = new URL(env.APP_ORIGIN);
    return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && /^\d+$/.test(env.ALLOWED_GITHUB_ID)
      && env.APP_ORIGIN === url.origin && (url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)));
  } catch { return false; }
}
async function sessionFor(request, env) {
  const token = readCookie(request, 'session');
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  return env.DB.prepare('SELECT user_id, csrf_token FROM sessions WHERE token_hash = ? AND expires_at > ? AND user_id = ?')
    .bind(await hash(token), nowSeconds(), env.ALLOWED_GITHUB_ID).first();
}
async function asset(request, env, path, extraHeaders = {}) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  const result = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
  const headers = new Headers(result.headers);
  for (const [key, value] of Object.entries({ ...SECURITY, ...extraHeaders })) headers.set(key, value);
  return new Response(result.body, { status: result.status, headers });
}
async function authStart(request, env) {
  if (!configurationReady(env)) return redirect('/?auth=setup');
  const state = randomToken();
  const verifier = randomToken(48);
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO oauth_states(state_hash, verifier, expires_at) VALUES (?, ?, ?)')
      .bind(await hash(state), verifier, now + 600),
  ]);
  const target = new URL('https://github.com/login/oauth/authorize');
  target.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.APP_ORIGIN}/auth/callback`,
    state,
    code_challenge: await hash(verifier),
    code_challenge_method: 'S256',
    // No repository or email permissions are requested.
    scope: '',
    login: env.GITHUB_LOGIN || '',
  }).toString();
  return redirect(target.toString(), { 'Set-Cookie': cookie(request, 'oauth', state, 600) });
}
async function authCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const clearState = { 'Set-Cookie': cookie(request, 'oauth', '', 0) };
  if (!configurationReady(env) || !state || !/^[\w-]{43}$/.test(state)
    || state !== readCookie(request, 'oauth') || !code || code.length > 512) {
    return redirect('/?auth=failed', clearState);
  }
  const stored = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING verifier')
    .bind(await hash(state), nowSeconds()).first();
  if (!stored) return redirect('/?auth=failed', clearState);
  try {
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
        redirect_uri: `${env.APP_ORIGIN}/auth/callback`, code, code_verifier: stored.verifier }),
      signal: AbortSignal.timeout(15000),
    });
    if (!exchange.ok) throw new Error('OAuth exchange failed');
    const token = await exchange.json();
    if (!token.access_token) throw new Error('OAuth denied');
    const profileResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json',
        'User-Agent': 'Gewichtsverlauf', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15000),
    });
    if (!profileResponse.ok) throw new Error('Profile unavailable');
    const profile = await profileResponse.json();
    // The immutable numeric ID, never a changeable display name, authorizes access.
    if (String(profile.id) !== env.ALLOWED_GITHUB_ID) return redirect('/?auth=denied', clearState);
    const sessionToken = randomToken();
    await env.DB.prepare('INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await hash(sessionToken), String(profile.id), randomToken(), nowSeconds() + SESSION_AGE).run();
    // GitHub's access token is deliberately neither persisted nor sent to the browser.
    const result = redirect('/');
    result.headers.append('Set-Cookie', clearState['Set-Cookie']);
    result.headers.append('Set-Cookie', cookie(request, 'session', sessionToken, SESSION_AGE));
    return result;
  } catch {
    return redirect('/?auth=failed', clearState);
  }
}
async function api(request, env, path) {
  const session = await sessionFor(request, env);
  if (!session) return json({ error: 'Bitte melde dich erneut an.' }, 401);
  const isWrite = !['GET', 'HEAD'].includes(request.method);
  if (isWrite && (request.headers.get('Origin') !== env.APP_ORIGIN
    || request.headers.get('X-CSRF-Token') !== session.csrf_token)) {
    return json({ error: 'Diese Anfrage ist nicht erlaubt. Bitte lade die Seite neu.' }, 403);
  }
  if (path === '/api/session' && request.method === 'GET') {
    return json({ login: env.GITHUB_LOGIN, csrfToken: session.csrf_token });
  }
  if (path === '/api/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(readCookie(request, 'session'))).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, 'session', '', 0) });
  }
  if (path === '/api/entries' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT day, weight_tenths, updated_at FROM entries WHERE user_id = ? ORDER BY day ASC')
      .bind(session.user_id).all();
    return json({ entries: results.map(publicEntry) });
  }
  const match = path.match(/^\/api\/entries\/(\d{4}-\d{2}-\d{2})$/);
  if (match && ['PUT', 'DELETE'].includes(request.method)) {
    const day = match[1];
    if (!validDay(day)) return json({ error: 'Bitte wähle ein gültiges Datum.' }, 400);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM entries WHERE user_id = ? AND day = ?').bind(session.user_id, day).run();
      return json({ ok: true });
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON erwartet.' }, 415);
    if (Number(request.headers.get('Content-Length') || 0) > 1024) return json({ error: 'Anfrage zu groß.' }, 413);
    let weight;
    try {
      const body = await request.text();
      if (body.length > 1024) return json({ error: 'Anfrage zu groß.' }, 413);
      weight = parseWeight(JSON.parse(body).weight);
    } catch (error) {
      return json({ error: error instanceof SyntaxError ? 'Ungültige Eingabe.' : error.message }, 400);
    }
    const updatedAt = Date.now();
    await env.DB.prepare('INSERT INTO entries(user_id, day, weight_tenths, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET weight_tenths = excluded.weight_tenths, updated_at = excluded.updated_at')
      .bind(session.user_id, day, weight, updatedAt).run();
    return json({ entry: { day, weight: weight / 10, updatedAt } });
  }
  return json({ error: 'Nicht gefunden.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (env.APP_ORIGIN && url.origin !== env.APP_ORIGIN) return response('Unbekannte Adresse.', 421);
      if (path.startsWith('/api/')) return await api(request, env, path);
      if (path === '/auth/github' && request.method === 'GET') return await authStart(request, env);
      if (path === '/auth/callback' && request.method === 'GET') return await authCallback(request, env);
      if (!['GET', 'HEAD'].includes(request.method)) return response('Methode nicht erlaubt.', 405);
      if (path === '/index.html' || path === '/login.html') return redirect('/');
      if (path === '/') {
        const session = await sessionFor(request, env);
        return await asset(request, env, session ? '/index.html' : '/login.html');
      }
      if (/^\/(app\.js|chart\.js|styles\.css|login\.js|manifest\.webmanifest|sw\.js|offline\.html|icons\/(icon-192\.png|icon-512\.png|icon\.svg))$/.test(path)) {
        return await asset(request, env, path, path === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {});
      }
      return response('Nicht gefunden.', 404);
    } catch {
      return path.startsWith('/api/')
        ? json({ error: 'Der Dienst ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.' }, 503)
        : response('Der Dienst ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.', 503);
    }
  },
};
