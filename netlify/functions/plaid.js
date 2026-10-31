// Bank data via Plaid. Two sources, chosen per request with ?source=:
//   test (default): a Plaid sandbox test bank, the same fake data for every user, so a new account has something to show at once.
//   own: the bank this user linked themselves (see plaid-link), read with their own encrypted token.
// PLAID_ENV defaults to sandbox; set production (and production keys) to let people link real banks. Secrets stay server-side.
const { withAuth } = require('../lib/clerk');
const { refuseSharedReal } = require('../lib/shared');
const { mapPlaidTransactions } = require('../lib/mappers');
const { HOSTS, plaid } = require('../lib/plaidapi');
const { vaultFor } = require('../lib/vault');

const json = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

exports.handler = withAuth(async (event) => {
  const { PLAID_CLIENT_ID, PLAID_SECRET } = process.env;
  const env = process.env.PLAID_ENV || 'sandbox';
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) return json(200, { configured: false, provider: 'plaid' });

  const source = ((event && event.queryStringParameters) || {}).source === 'own' ? 'own' : 'test';
  let host, secret, accessToken;

  try {
    if (source === 'own') {
      host = HOSTS[env];
      if (!host) return json(500, { configured: true, error: `unknown PLAID_ENV "${env}"` });
      secret = PLAID_SECRET;
      if (!event.userId) return json(401, { error: 'sign in to use your own bank' });
      const vault = vaultFor(event);
      if (!vault.available) return json(200, { configured: true, provider: 'plaid', source, linked: false, error: 'Linking your own bank is not set up on this server (VAULT_KEY).' });
      const rec = await vault.get(event.userId, 'plaid');
      if (!rec) return json(200, { configured: true, provider: 'plaid', source, linked: false, error: 'No bank is linked yet. Use "Connect my bank".' });
      if (rec.env !== env) return json(200, { configured: true, provider: 'plaid', source, linked: false, error: 'That link was made in another environment. Disconnect it and connect again.' });
      accessToken = rec.access_token;
    } else {
      // Test data is always a sandbox bank. In production, a separate sandbox secret keeps it available.
      secret = env === 'sandbox' ? PLAID_SECRET : process.env.PLAID_SANDBOX_SECRET;
      if (!secret) {
        const refused = refuseSharedReal(true, 'plaid');
        if (refused) return refused;
        return json(200, { configured: false, provider: 'plaid', source, reason: 'test data needs PLAID_SANDBOX_SECRET' });
      }
      host = HOSTS.sandbox;
    }
    const auth = { client_id: PLAID_CLIENT_ID, secret };

    // Test data: each user gets their own sandbox bank the first time, kept (encrypted) so later loads are quick.
    let vault = null, cachedTest = false;
    if (!accessToken && source === 'test' && event && event.userId) {
      try { vault = vaultFor(event); } catch { vault = null; }
      if (vault && !vault.available) vault = null;
      const rec = vault && await vault.get(event.userId, 'plaid-test');
      if (rec && rec.access_token) { accessToken = rec.access_token; cachedTest = true; }
    }
    if (!accessToken && source === 'test' && env === 'sandbox') accessToken = process.env.PLAID_ACCESS_TOKEN;

    // Mint a test item without the Link screen. Plaid's richer test user has paychecks and recurring bills.
    const mintTestBank = async () => {
      const pt = await plaid(host, '/sandbox/public_token/create', {
        ...auth, institution_id: 'ins_109508', initial_products: ['transactions'],
        options: { override_username: process.env.PLAID_SANDBOX_USER || 'user_transactions_dynamic', override_password: 'pass_good' }
      });
      const token = (await plaid(host, '/item/public_token/exchange', { ...auth, public_token: pt.public_token })).access_token;
      if (vault) await vault.put(event.userId, 'plaid-test', { access_token: token, env: 'sandbox' });
      return token;
    };

    // A new item returns empty pages (NOT_READY, then INITIAL_UPDATE_COMPLETE) before history arrives.
    const syncAll = async token => {
      let added = [], accounts = [], cursor, hasMore = true, tries = 0;
      while (hasMore) {
        const page = await plaid(host, '/transactions/sync', { ...auth, access_token: token, cursor, count: 500 });
        if (page.transactions_update_status !== 'HISTORICAL_UPDATE_COMPLETE' && !page.added.length && tries++ < 10) {
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }
        added = added.concat(page.added);
        accounts = page.accounts || accounts;
        cursor = page.next_cursor; hasMore = page.has_more;
      }
      return { added, accounts };
    };

    let result;
    if (!accessToken) {
      result = await syncAll(await mintTestBank());
    } else {
      try {
        result = await syncAll(accessToken);
      } catch (e) {
        // A kept test bank that Plaid no longer knows is replaced; anything else is a real error.
        if (!cachedTest) throw e;
        await vault.remove(event.userId, 'plaid-test');
        result = await syncAll(await mintTestBank());
      }
    }
    const { added, accounts } = result;
    return json(200, {
      configured: true, provider: 'plaid', source, env: source === 'own' ? env : 'sandbox', linked: source === 'own' ? true : undefined,
      transactions: mapPlaidTransactions(added),
      accounts: accounts.map(a => ({ name: a.name, type: a.type, subtype: a.subtype, balance: a.balances && a.balances.current }))
    });
  } catch (e) {
    return json(502, { configured: true, provider: 'plaid', source, error: e.message });
  }
});
