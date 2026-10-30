const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGuard, bearer } = require('../netlify/lib/clerk');

const ok = async () => ({ statusCode: 200, body: 'ran' });
const good = async () => ({ data: { sub: 'user_1' } });

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

test('a token Clerk rejects is refused, whether it returns errors or throws', async () => {
  const guard = (verify) => makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, verify)(ok);
  const event = { headers: { authorization: 'Bearer t' } };
  assert.equal((await guard(async () => ({ errors: [{}] }))(event)).statusCode, 401);
  assert.equal((await guard(async () => ({ data: {} }))(event)).statusCode, 401);
  assert.equal((await guard(async () => { throw new Error('bad'); })(event)).statusCode, 401);
});

test('a valid token runs the function, and the secret is passed to Clerk', async () => {
  let seen;
  const verify = async (token, opts) => { seen = { token, opts }; return { data: { sub: 'user_1' } }; };
  const out = await makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, verify)(ok)({ headers: { authorization: 'Bearer tok' } });
  assert.equal(out.statusCode, 200);
  assert.deepEqual(seen, { token: 'tok', opts: { secretKey: 'sk_test_x' } });
});
