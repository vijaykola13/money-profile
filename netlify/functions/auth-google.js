// Verifies a Google sign-in. GET reports whether it is configured. POST { credential } returns { user } or an error.
// Needs GOOGLE_CLIENT_ID (the same OAuth client ID the page uses). Nothing is stored here.
const { checkClaims } = require('../lib/google');

const json = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (event.httpMethod === 'GET' || !event.httpMethod) return json(200, { configured: !!clientId });
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });
  if (!clientId) return json(200, { configured: false });

  let credential;
  try { credential = JSON.parse(event.body || '{}').credential; } catch { /* fall through */ }
  if (typeof credential !== 'string' || credential.length > 4000 || credential.split('.').length !== 3) {
    return json(400, { error: 'a Google credential is required' });
  }

  try {
    // Google checks the signature and returns the claims; we then check who the token is for.
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) return json(401, { configured: true, error: 'Google did not accept that sign-in' });
    const result = checkClaims(await res.json(), clientId);
    return result.ok ? json(200, { configured: true, user: result.user }) : json(401, { configured: true, error: result.reason });
  } catch {
    return json(502, { configured: true, error: 'Could not reach Google to check the sign-in' });
  }
};
