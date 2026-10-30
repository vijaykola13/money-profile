const test = require('node:test');
const assert = require('node:assert/strict');

const { checkClaims } = require('../netlify/lib/google');
const fn = require('../netlify/functions/auth-google');

const NOW = 1_800_000_000_000;
const good = { aud: 'app.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: String(NOW / 1000 + 600), email_verified: 'true', sub: '1234', email: 'a@b.com', name: 'A B', picture: 'p' };

test('claims: a valid token gives a user', () => {
  const r = checkClaims(good, 'app.apps.googleusercontent.com', NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.user, { sub: '1234', email: 'a@b.com', name: 'A B', picture: 'p', exp: NOW / 1000 + 600 });
});

test('claims: every way a token can be wrong is rejected', () => {
  const id = 'app.apps.googleusercontent.com';
  assert.equal(checkClaims({ ...good, aud: 'other' }, id, NOW).ok, false, 'wrong app');
  assert.equal(checkClaims({ ...good, iss: 'https://evil.example' }, id, NOW).ok, false, 'wrong issuer');
  assert.equal(checkClaims({ ...good, exp: String(NOW / 1000 - 1) }, id, NOW).ok, false, 'expired');
  assert.equal(checkClaims({ ...good, exp: 'soon' }, id, NOW).ok, false, 'bad expiry');
  assert.equal(checkClaims({ ...good, email_verified: 'false' }, id, NOW).ok, false, 'unverified email');
  assert.equal(checkClaims({ ...good, sub: '' }, id, NOW).ok, false, 'no subject');
  assert.equal(checkClaims(null, id, NOW).ok, false);
  assert.equal(checkClaims(good, '', NOW).ok, false, 'not configured');
  assert.equal(checkClaims({ ...good, email_verified: true }, id, NOW).ok, true, 'boolean true is fine');
});

const realFetch = global.fetch;
const reset = () => { global.fetch = realFetch; delete process.env.GOOGLE_CLIENT_ID; };
const jwt = 'aaa.bbb.ccc';
const post = body => fn.handler({ httpMethod: 'POST', body: JSON.stringify(body) });

test('function: reports configuration and never calls Google when unconfigured', async () => {
  reset();
  let called = false;
  global.fetch = async () => { called = true; };
  assert.equal(JSON.parse((await fn.handler({ httpMethod: 'GET' })).body).configured, false);
  assert.equal(JSON.parse((await post({ credential: jwt })).body).configured, false);
  assert.equal(called, false);
  process.env.GOOGLE_CLIENT_ID = 'app';
  assert.equal(JSON.parse((await fn.handler({ httpMethod: 'GET' })).body).configured, true);
  reset();
});

test('function: accepts a good token and refuses a token for another app', async () => {
  process.env.GOOGLE_CLIENT_ID = 'app.apps.googleusercontent.com';
  const urls = [];
  const future = String(Math.floor(Date.now() / 1000) + 600);
  global.fetch = async url => { urls.push(url); return { ok: true, json: async () => ({ ...good, exp: future }) }; };
  const ok = await post({ credential: jwt });
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).user.email, 'a@b.com');
  assert.match(urls[0], /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?id_token=aaa\.bbb\.ccc$/);

  global.fetch = async () => ({ ok: true, json: async () => ({ ...good, exp: future, aud: 'someone-else' }) });
  assert.equal((await post({ credential: jwt })).statusCode, 401);

  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_token' }) });
  assert.equal((await post({ credential: jwt })).statusCode, 401);

  global.fetch = async () => { throw new Error('offline'); };
  assert.equal((await post({ credential: jwt })).statusCode, 502);
  reset();
});

test('function: rejects malformed requests', async () => {
  process.env.GOOGLE_CLIENT_ID = 'app';
  global.fetch = async () => { throw new Error('should not be called'); };
  assert.equal((await post({})).statusCode, 400);
  assert.equal((await post({ credential: 'not-a-jwt' })).statusCode, 400);
  assert.equal((await post({ credential: 'a.b.c'.padEnd(5000, 'x') })).statusCode, 400);
  assert.equal((await fn.handler({ httpMethod: 'POST', body: 'nope' })).statusCode, 400);
  assert.equal((await fn.handler({ httpMethod: 'DELETE' })).statusCode, 405);
  reset();
});
