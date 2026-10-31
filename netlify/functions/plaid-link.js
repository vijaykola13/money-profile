// Lets a signed-in user link their own bank with Plaid Link, and unlink it again.
//   GET                      -> { configured, env, vault, linked, institution }
//   POST { action: 'link-token' }                         -> { link_token } for the Plaid Link screen
//   POST { action: 'exchange', public_token, institution } -> stores the user's encrypted access token
//   POST { action: 'unlink' }                              -> removes the link at Plaid and here
// The access token is encrypted in the vault and never sent to the browser. It needs VAULT_KEY on the server.
const { withAuth } = require('../lib/clerk');
const { HOSTS, plaid } = require('../lib/plaidapi');
const { vaultFor } = require('../lib/vault');

const json = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

const PUBLIC_TOKEN = /^public-(sandbox|development|production)-[0-9a-f-]{20,}$/i;

function makeHandler({ vaultOf = vaultFor, env = process.env } = {}) {
  return async (event) => {
    const { PLAID_CLIENT_ID, PLAID_SECRET } = env;
    const plaidEnv = env.PLAID_ENV || 'sandbox';
    if (!PLAID_CLIENT_ID || !PLAID_SECRET) return json(200, { configured: false, provider: 'plaid' });
    const host = HOSTS[plaidEnv];
    if (!host) return json(500, { configured: true, error: `unknown PLAID_ENV "${plaidEnv}"` });
    if (!event.userId) return json(401, { error: 'sign in to link a bank' });

    const vault = vaultOf(event, env);
    const auth = { client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET };
    const rec = vault.available ? await vault.get(event.userId, 'plaid') : null;

    let body = {};
    if (event.httpMethod === 'POST') {
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid request' }); }
    }
    const action = event.httpMethod === 'POST' ? body.action : 'status';

    try {
      if (action === 'status') {
        return json(200, { configured: true, env: plaidEnv, vault: vault.available, linked: !!rec && rec.env === plaidEnv, institution: rec && rec.institution });
      }
      if (!vault.available) return json(503, { error: 'Linking your own bank is not set up on this server yet (VAULT_KEY).' });

      if (action === 'link-token') {
        const out = await plaid(host, '/link/token/create', {
          ...auth, client_name: 'CashPilot', language: 'en', country_codes: ['US'], products: ['transactions'],
          user: { client_user_id: event.userId }
        });
        return json(200, { link_token: out.link_token });
      }

      if (action === 'exchange') {
        if (typeof body.public_token !== 'string' || !PUBLIC_TOKEN.test(body.public_token)) return json(400, { error: 'a Plaid public token is required' });
        const out = await plaid(host, '/item/public_token/exchange', { ...auth, public_token: body.public_token });
        const institution = String(body.institution || '').slice(0, 80);
        await vault.put(event.userId, 'plaid', { access_token: out.access_token, item_id: out.item_id, institution, env: plaidEnv, linkedAt: new Date().toISOString() });
        return json(200, { linked: true, institution });
      }

      if (action === 'unlink') {
        if (rec) {
          // Tell Plaid to drop the connection too; the local record goes either way.
          try { await plaid(host, '/item/remove', { ...auth, access_token: rec.access_token }); } catch { /* already gone */ }
          await vault.remove(event.userId, 'plaid');
        }
        return json(200, { linked: false });
      }
      return json(400, { error: 'unknown action' });
    } catch (e) {
      return json(502, { configured: true, error: e.message });
    }
  };
}

exports.handler = withAuth(makeHandler());
exports.makeHandler = makeHandler;
