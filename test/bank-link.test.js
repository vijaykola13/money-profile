const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeVault, fileStore, encrypt, decrypt, keyFrom } = require('../netlify/lib/vault');
const { makeGuard } = require('../netlify/lib/clerk');
const { makeHandler } = require('../netlify/functions/plaid-link');

const KEY = crypto.randomBytes(32);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vault-')), 'v.json');
const PUBLIC = 'public-sandbox-0123456789abcdef-0123-4567';

test('vault: encrypts at rest and round-trips', async () => {
  const file = tmp();
  const vault = makeVault(KEY, fileStore(file));
  await vault.put('user_1', 'plaid', { access_token: 'access-sandbox-secret' });
  assert.equal(fs.readFileSync(file, 'utf8').includes('access-sandbox-secret'), false, 'the token is not stored in the clear');
  assert.deepEqual(await vault.get('user_1', 'plaid'), { access_token: 'access-sandbox-secret' });
  await vault.remove('user_1', 'plaid');
  assert.equal(await vault.get('user_1', 'plaid'), null);
});

test('vault: a record cannot be read as another user, with another key, or after tampering', async () => {
  const blob = encrypt('{"a":1}', KEY, 'plaid/user_1');
  assert.equal(decrypt(blob, KEY, 'plaid/user_1'), '{"a":1}');
  assert.throws(() => decrypt(blob, KEY, 'plaid/user_2'));
  assert.throws(() => decrypt(blob, crypto.randomBytes(32), 'plaid/user_1'));
  const parts = blob.split('.');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(parts.join('.'), KEY, 'plaid/user_1'));

  const store = fileStore(tmp());
  const vault = makeVault(KEY, store);
  await vault.put('user_1', 'plaid', { t: 1 });
  await store.set('plaid/user_2', await store.get('plaid/user_1')); // copied to another user
  assert.equal(await vault.get('user_2', 'plaid'), null);
});

test('vault: needs a 32-byte key, and refuses odd names', async () => {
  assert.equal(keyFrom({}), null);
  assert.equal(keyFrom({ VAULT_KEY: 'short' }), null);
  assert.ok(keyFrom({ VAULT_KEY: KEY.toString('base64') }));
  const none = makeVault(null, fileStore(tmp()));
  assert.equal(none.available, false);
  await assert.rejects(() => none.put('user_1', 'plaid', {}));
  await assert.rejects(() => makeVault(KEY, fileStore(tmp())).put('../evil', 'plaid', {}));
});

const env = { PLAID_CLIENT_ID: 'cid', PLAID_SECRET: 'sec', PLAID_ENV: 'sandbox' };
function setup(withKey = true) {
  const vault = makeVault(withKey ? KEY : null, fileStore(tmp()));
  return { vault, handler: makeHandler({ vaultOf: () => vault, env }) };
}
const call = (handler, userId, body) =>
  handler({ userId, httpMethod: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });

async function withFetch(fn, impl) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    const reqBody = JSON.parse(init.body);
    calls.push({ url: String(url), body: reqBody });
    const out = impl(String(url), reqBody);
    return { ok: true, status: 200, json: async () => out };
  };
  try { return await fn(calls); } finally { global.fetch = real; }
}

test('link: the link token is made for this user, and linking needs the vault', async () => {
  const { handler } = setup();
  await withFetch(async calls => {
    const r = await call(handler, 'user_1', { action: 'link-token' });
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).link_token, 'link-sandbox-1');
    assert.equal(calls[0].body.user.client_user_id, 'user_1');
  }, () => ({ link_token: 'link-sandbox-1' }));

  const off = setup(false);
  assert.equal((await call(off.handler, 'user_1', { action: 'link-token' })).statusCode, 503);
  assert.equal(JSON.parse((await call(off.handler, 'user_1')).body).vault, false);
});

test('link: exchange stores the token encrypted and never sends it back', async () => {
  const { handler, vault } = setup();
  await withFetch(async () => {
    const r = await call(handler, 'user_1', { action: 'exchange', public_token: PUBLIC, institution: 'First Platypus Bank' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.includes('access-sandbox-abc'), false);
    assert.equal((await vault.get('user_1', 'plaid')).access_token, 'access-sandbox-abc');
    const status = JSON.parse((await call(handler, 'user_1')).body);
    assert.deepEqual([status.linked, status.institution], [true, 'First Platypus Bank']);
    assert.equal(JSON.parse((await call(handler, 'user_2')).body).linked, false, 'another user is not linked');
  }, () => ({ access_token: 'access-sandbox-abc', item_id: 'item_1' }));
});

test('link: rejects a bad public token, an unknown action, and a call with no user', async () => {
  const { handler } = setup();
  assert.equal((await call(handler, 'user_1', { action: 'exchange', public_token: 'nope' })).statusCode, 400);
  assert.equal((await call(handler, 'user_1', { action: 'delete-everything' })).statusCode, 400);
  assert.equal((await call(handler, null, { action: 'link-token' })).statusCode, 401);
});

test('link: unlink removes the record and tells Plaid', async () => {
  const { handler, vault } = setup();
  await vault.put('user_1', 'plaid', { access_token: 'access-sandbox-abc', env: 'sandbox' });
  await withFetch(async calls => {
    assert.equal(JSON.parse((await call(handler, 'user_1', { action: 'unlink' })).body).linked, false);
    assert.ok(calls.some(c => c.url.endsWith('/item/remove') && c.body.access_token === 'access-sandbox-abc'));
    assert.equal(await vault.get('user_1', 'plaid'), null);
  }, () => ({}));
});

test('the guard puts the verified user on the request, and callers cannot choose it', async () => {
  const seen = [];
  const guard = makeGuard({ CLERK_SECRET_KEY: 'sk_test_x' }, async () => ({ sub: 'user_real' }))(async e => { seen.push(e.userId); return { statusCode: 200 }; });
  await guard({ headers: { authorization: 'Bearer t' }, userId: 'user_spoofed' });
  assert.deepEqual(seen, ['user_real']);
});

test('bank data: "own" reads the user\'s linked bank, "test" stays a sandbox bank', async () => {
  const file = tmp();
  Object.assign(process.env, { PLAID_CLIENT_ID: 'cid', PLAID_SECRET: 'sec', PLAID_ENV: 'sandbox', VAULT_KEY: KEY.toString('base64'), VAULT_FILE: file });
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
  const { handler } = require('../netlify/functions/plaid');
  const vault = makeVault(KEY, fileStore(file));
  const page = { transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE', added: [], accounts: [{ name: 'Checking', type: 'depository', subtype: 'checking', balances: { current: 5 } }], next_cursor: 'c', has_more: false };

  // Not linked yet.
  const none = JSON.parse((await handler({ userId: 'user_1', queryStringParameters: { source: 'own' } })).body);
  assert.equal(none.linked, false);
  assert.match(none.error, /linked/i);

  await vault.put('user_1', 'plaid', { access_token: 'access-mine', env: 'sandbox' });
  await withFetch(async calls => {
    const own = JSON.parse((await handler({ userId: 'user_1', queryStringParameters: { source: 'own' } })).body);
    assert.equal(own.source, 'own');
    assert.equal(own.linked, true);
    assert.equal(calls.every(c => c.body.access_token === 'access-mine'), true, 'only the user\'s own token is used');
    assert.equal(calls.some(c => c.url.includes('sandbox/public_token/create')), false, 'no test bank is minted');
  }, () => page);

  await withFetch(async calls => {
    const other = JSON.parse((await handler({ userId: 'user_2', queryStringParameters: { source: 'own' } })).body);
    assert.equal(other.linked, false);
    assert.equal(calls.length, 0, 'another user never reaches Plaid with user_1\'s token');
  }, () => page);

  await withFetch(async calls => {
    const test = JSON.parse((await handler({ userId: 'user_2', queryStringParameters: {} })).body);
    assert.equal(test.source, 'test');
    assert.ok(calls.some(c => c.url.includes('sandbox/public_token/create')), 'test data mints a sandbox bank');
  }, url => (url.includes('public_token/create') ? { public_token: 'public-sandbox-x' } : url.includes('public_token/exchange') ? { access_token: 'access-test' } : page));

  // The test bank was kept for that user, so the next load reuses it instead of building another.
  assert.equal((await vault.get('user_2', 'plaid-test')).access_token, 'access-test');
  await withFetch(async calls => {
    const again = JSON.parse((await handler({ userId: 'user_2', queryStringParameters: {} })).body);
    assert.equal(again.source, 'test');
    assert.equal(calls.some(c => c.url.includes('public_token')), false, 'no new test bank');
    assert.equal(calls.every(c => c.body.access_token === 'access-test'), true);
  }, () => page);

  // If Plaid no longer knows the kept bank, a new one is made and kept.
  let first = true;
  await withFetch(async calls => {
    const healed = JSON.parse((await handler({ userId: 'user_2', queryStringParameters: {} })).body);
    assert.equal(healed.source, 'test');
    assert.ok(calls.some(c => c.url.includes('public_token/create')));
  }, url => {
    if (url.includes('transactions/sync') && first) { first = false; throw new Error('ITEM_NOT_FOUND'); }
    return url.includes('public_token/create') ? { public_token: 'public-sandbox-y' } : url.includes('public_token/exchange') ? { access_token: 'access-test-2' } : page;
  });
  assert.equal((await vault.get('user_2', 'plaid-test')).access_token, 'access-test-2');

  for (const k of ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'VAULT_KEY', 'VAULT_FILE']) delete process.env[k];
});
