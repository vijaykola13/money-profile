const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGuard, bearer } = require('../netlify/lib/clerk');

const ok = async () => ({ statusCode: 200, body: 'ran' });
const good = async () => ({ sub: 'user_1' });

test('bearer reads the token from either header casing and rejects other schemes', () => {
  assert.equal(bearer({ authorization: 'Bearer abc.def' }), 'abc.def');
  assert.equal(bearer({ Authorization: 'bearer abc' }), 'abc');
  assert.equal(bearer({ authorization: 'Basic abc' }), null);
  assert.equal(bearer({}), null);
  assert.equal(bearer(undefined), null);
});

test('with no Clerk settings nothing is guarded', async () => {
  const out = await makeGuard({}, good)(ok)({ headers: {} });
  assert.equal(out.statusCode, 200);
});

test('a page key without a server secret refuses calls instead of leaving them open', async () => {
  const out = await makeGuard({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x' }, good)(ok)({ headers: { authorization: 'Bearer t' } });
  assert.equal(out.statusCode, 503);
});

test('a call with no token is refused', async () => {
  const out = await makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, good)(ok)({ headers: {} });
  assert.equal(out.statusCode, 401);
});

test('a token Clerk rejects is refused, and the reason code is passed on', async () => {
  const guard = (verify) => makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, verify)(ok);
  const event = { headers: { authorization: 'Bearer t' } };
  assert.equal((await guard(async () => ({}))(event)).statusCode, 401);
  const out = await guard(async () => { throw Object.assign(new Error('bad'), { reason: 'token-expired' }); })(event);
  assert.equal(out.statusCode, 401);
  assert.match(JSON.parse(out.body).error, /token-expired/);
});

test('the real Clerk library accepts a correctly signed token and refuses a tampered one', async () => {
  const crypto = require('node:crypto');
  const { verifyToken } = require('@clerk/backend');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' })}.${part({ sub: 'user_1', sid: 's', iss: 'https://x.clerk.accounts.dev', iat: now, nbf: now - 5, exp: now + 60 })}`;
  const token = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const guard = makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, (t, o) => verifyToken(t, { ...o, jwtKey: pem }))(ok);

  assert.equal((await guard({ headers: { authorization: `Bearer ${token}` } })).statusCode, 200);
  const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal((await guard({ headers: { authorization: `Bearer ${tampered}` } })).statusCode, 401);
});

test('a valid token runs the function, and the secret is passed to Clerk', async () => {
  let seen;
  const verify = async (token, opts) => { seen = { token, opts }; return { sub: 'user_1' }; };
  const out = await makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, verify)(ok)({ headers: { authorization: 'Bearer tok' } });
  assert.equal(out.statusCode, 200);
  assert.deepEqual(seen, { token: 'tok', opts: { secretKey: 'sk_test_x' } });
});
