// Checks the claims of a Google ID token that Google's tokeninfo endpoint has already validated the signature of.
// Pure, so it can be unit tested. Returns { ok: true, user } or { ok: false, reason }.
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function checkClaims(claims, clientId, nowMs = Date.now()) {
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'no claims' };
  if (!clientId) return { ok: false, reason: 'not configured' };
  if (claims.aud !== clientId) return { ok: false, reason: 'token is for a different app' };
  if (!ISSUERS.includes(claims.iss)) return { ok: false, reason: 'unexpected issuer' };
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return { ok: false, reason: 'token expired' };
  if (claims.email_verified !== true && claims.email_verified !== 'true') return { ok: false, reason: 'email not verified' };
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string') return { ok: false, reason: 'missing identity' };
  return {
    ok: true,
    user: { sub: claims.sub, email: claims.email, name: claims.name || undefined, picture: claims.picture || undefined, exp }
  };
}

module.exports = { checkClaims };
