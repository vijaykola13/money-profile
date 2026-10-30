// Bank data via Plaid. Defaults to the Sandbox environment; set PLAID_ENV=production
// (and production keys) when going live. Secrets stay server-side.
const { mapPlaidTransactions } = require('../lib/mappers');

const HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' };
const json = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

async function plaid(host, path, body) {
  const res = await fetch(host + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error_code || res.status} ${data.error_message || ''}`.trim());
  return data;
}

exports.handler = async () => {
  const { PLAID_CLIENT_ID, PLAID_SECRET } = process.env;
  const env = process.env.PLAID_ENV || 'sandbox';
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) return json(200, { configured: false, provider: 'plaid' });

  const host = HOSTS[env];
  if (!host) return json(500, { configured: true, error: `unknown PLAID_ENV "${env}"` });
  const auth = { client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET };

  try {
    let accessToken = process.env.PLAID_ACCESS_TOKEN;
    if (!accessToken) {
      // Sandbox only: mint a test item without the Link UI. Production needs Link + token storage.
      if (env !== 'sandbox') return json(200, { configured: false, provider: 'plaid', reason: 'no access token' });
      const pt = await plaid(host, '/sandbox/public_token/create', {
        ...auth, institution_id: 'ins_109508', initial_products: ['transactions'],
        // Plaid's richer test user: longer history with paychecks and recurring bills.
        options: { override_username: process.env.PLAID_SANDBOX_USER || 'user_transactions_dynamic', override_password: 'pass_good' }
      });
      accessToken = (await plaid(host, '/item/public_token/exchange', { ...auth, public_token: pt.public_token })).access_token;
    }

    // A new item returns empty pages (NOT_READY, then INITIAL_UPDATE_COMPLETE) before history arrives.
    let added = [], accounts = [], cursor, hasMore = true, tries = 0;
    while (hasMore) {
      const page = await plaid(host, '/transactions/sync', { ...auth, access_token: accessToken, cursor, count: 500 });
      if (page.transactions_update_status !== 'HISTORICAL_UPDATE_COMPLETE' && !page.added.length && tries++ < 10) {
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }
      added = added.concat(page.added);
      accounts = page.accounts || accounts;
      cursor = page.next_cursor; hasMore = page.has_more;
    }
    return json(200, {
      configured: true, provider: 'plaid', env, transactions: mapPlaidTransactions(added),
      accounts: accounts.map(a => ({ name: a.name, type: a.type, subtype: a.subtype, balance: a.balances && a.balances.current }))
    });
  } catch (e) {
    return json(502, { configured: true, provider: 'plaid', error: e.message });
  }
};
