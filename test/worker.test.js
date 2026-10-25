import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const origin = 'https://gewicht.example';
let sqlite, env;
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  env = {
    APP_ORIGIN: origin, GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-secret',
    ALLOWED_GITHUB_ID: '260273876', GITHUB_LOGIN: 'rainermu85-blip',
    DB: {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return {
          values: [], bind(...values) { this.values = values; return this; },
          async first() { return statement.get(...this.values) || null; },
          async all() { return { results: statement.all(...this.values) }; },
          async run() { return statement.run(...this.values); },
        };
      },
      async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
    },
    ASSETS: { async fetch(request) { return new Response(new URL(request.url).pathname, { headers: { 'Content-Type': 'text/html' } }); } },
  };
});
afterEach(() => { sqlite.close(); mock.restoreAll(); });

function request(path, { method = 'GET', cookie, csrf, body, requestOrigin = origin } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (csrf) headers.set('X-CSRF-Token', csrf);
  if (method !== 'GET') headers.set('Origin', requestOrigin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return worker.fetch(new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}
async function begin() {
  const result = await request('/auth/github');
  const url = new URL(result.headers.get('Location'));
  return { url, state: url.searchParams.get('state'), cookie: result.headers.get('Set-Cookie').split(';')[0] };
}
function githubProfile(id = 260273876) {
  return mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('/login/oauth/access_token')) {
      const body = JSON.parse(options.body);
      assert.ok(body.code_verifier && body.client_secret === 'test-secret');
      return Response.json({ access_token: 'never-store-this-token' });
    }
    assert.equal(String(url), 'https://api.github.com/user');
    assert.equal(options.headers.Authorization, 'Bearer never-store-this-token');
    return Response.json({ id, login: 'a-display-name-does-not-authorize' });
  });
}
async function login() {
  const flow = await begin(); githubProfile();
  const result = await request(`/auth/callback?state=${flow.state}&code=test-code`, { cookie: flow.cookie });
  const cookie = result.headers.getSetCookie().find(value => value.startsWith('__Host-weight_session=')).split(';')[0];
  const session = await (await request('/api/session', { cookie })).json();
  return { cookie, csrf: session.csrfToken };
}

test('Unangemeldete sehen nur Login; jeder private API-Zugriff wird verweigert', async () => {
  assert.equal(await (await request('/')).text(), '/login.html');
  assert.equal((await request('/index.html')).status, 302);
  assert.equal((await request('/api/entries')).status, 401);
  assert.equal((await request('/api/session')).status, 401);
  assert.equal((await request('/api/entries/2026-01-01', { method: 'PUT', body: { weight: '79,3' } })).status, 401);
  assert.equal((await request('/api/entries/2026-01-01', { method: 'DELETE' })).status, 401);
  assert.equal((await request('/migrations/0001_initial.sql')).status, 404);
});
test('OAuth nutzt Browserbindung, PKCE und keine Repository-Berechtigungen', async () => {
  const { url, state, cookie } = await begin();
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('scope'), '');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), `${origin}/auth/callback`);
  assert.ok(state.length === 43 && cookie.startsWith('__Host-weight_oauth='));
  assert.ok(sqlite.prepare('SELECT * FROM oauth_states').get().state_hash !== state);
});
test('OAuth ohne passenden Browser-Cookie oder mit abgelaufenem State ist gesperrt', async () => {
  const flow = await begin();
  assert.equal((await request(`/auth/callback?state=${flow.state}&code=x`)).headers.get('Location'), '/?auth=failed');
  sqlite.prepare('UPDATE oauth_states SET expires_at = 0').run();
  assert.equal((await request(`/auth/callback?state=${flow.state}&code=x`, { cookie: flow.cookie })).headers.get('Location'), '/?auth=failed');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});
test('Ein anderes GitHub-Konto bekommt keine Sitzung', async () => {
  const flow = await begin(); githubProfile(999);
  const result = await request(`/auth/callback?state=${flow.state}&code=x`, { cookie: flow.cookie });
  assert.equal(result.headers.get('Location'), '/?auth=denied');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});
test('Erlaubtes Konto: sichere Sitzung, keine OAuth-Tokens in Datenbank, State nur einmal gültig', async () => {
  const flow = await begin(); const provider = githubProfile();
  const callback = `/auth/callback?state=${flow.state}&code=x`;
  const result = await request(callback, { cookie: flow.cookie });
  const sessionCookie = result.headers.getSetCookie().find(value => value.startsWith('__Host-weight_session='));
  assert.match(sessionCookie, /Secure/); assert.match(sessionCookie, /HttpOnly/); assert.match(sessionCookie, /SameSite=Lax/);
  const stored = sqlite.prepare('SELECT * FROM sessions').get();
  assert.ok(!JSON.stringify(stored).includes('never-store-this-token'));
  assert.ok(!sessionCookie.includes(stored.token_hash));
  assert.equal(stored.user_id, '260273876');
  assert.equal((await request(callback, { cookie: flow.cookie })).headers.get('Location'), '/?auth=failed');
  assert.equal(provider.mock.callCount(), 2);
});
test('Speichern, Ersetzen, Sortieren, Exportdaten und Löschen mit echter SQL-Datenbank', async () => {
  const auth = await login();
  assert.equal(await (await request('/', auth)).text(), '/index.html');
  for (const [day, weight] of [['2026-01-06', '79,3'], ['2026-01-01', '79.7'], ['2026-01-06', '79,1']]) {
    assert.equal((await request(`/api/entries/${day}`, { ...auth, method: 'PUT', body: { weight } })).status, 200);
  }
  const result = await request('/api/entries', auth);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const { entries } = await result.json();
  assert.deepEqual(entries.map(({ day, weight }) => ({ day, weight })), [{ day: '2026-01-01', weight: 79.7 }, { day: '2026-01-06', weight: 79.1 }]);
  assert.equal(sqlite.prepare('SELECT weight_tenths FROM entries WHERE day = ?').get('2026-01-06').weight_tenths, 791);
  assert.equal((await request('/api/entries/2026-01-06', { ...auth, method: 'DELETE' })).status, 200);
  assert.equal((await (await request('/api/entries', auth)).json()).entries.length, 1);
});
test('Schreibzugriffe prüfen CSRF, Origin und Eingaben serverseitig', async () => {
  const auth = await login();
  const path = '/api/entries/2026-01-01';
  assert.equal((await request(path, { cookie: auth.cookie, method: 'PUT', body: { weight: '79,3' } })).status, 403);
  assert.equal((await request(path, { ...auth, requestOrigin: 'https://evil.example', method: 'PUT', body: { weight: '79,3' } })).status, 403);
  for (const weight of ['79,33', '-1', 'NaN', '1000', '<script>', null]) {
    assert.equal((await request(path, { ...auth, method: 'PUT', body: { weight } })).status, 400);
  }
  assert.equal((await request('/api/entries/2026-02-30', { ...auth, method: 'PUT', body: { weight: '79,3' } })).status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entries').get().n, 0);
});
test('Sitzungsablauf und Logout sperren Datenzugriff sofort', async () => {
  const auth = await login();
  assert.equal((await request('/api/logout', { ...auth, method: 'POST' })).status, 200);
  assert.equal((await request('/api/entries', auth)).status, 401);
  mock.restoreAll();
  const secondAuth = await login();
  sqlite.prepare('UPDATE sessions SET expires_at = 0').run();
  assert.equal((await request('/api/entries', secondAuth)).status, 401);
});
test('Kontowechsel in Konfiguration entzieht bestehenden Sitzungen Zugriff', async () => {
  const auth = await login(); env.ALLOWED_GITHUB_ID = '999';
  assert.equal((await request('/api/entries', auth)).status, 401);
});
test('Ohne Konfiguration kein unsicherer Fallback, fremder Host wird abgelehnt', async () => {
  env.GITHUB_CLIENT_SECRET = '';
  assert.equal((await request('/auth/github')).headers.get('Location'), '/?auth=setup');
  assert.equal((await worker.fetch(new Request('https://other.example/'), env)).status, 421);
});
