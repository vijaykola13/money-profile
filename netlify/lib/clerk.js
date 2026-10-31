// Guards a Netlify function so only signed-in Clerk users can call it.
//
// Sign-in is on when VITE_CLERK_PUBLISHABLE_KEY (the page's key) or CLERK_SECRET_KEY is set. Then every call needs
// "Authorization: Bearer <Clerk session token>", and the token is verified with CLERK_SECRET_KEY. If the page key is
// set but the secret is missing, calls are refused rather than left open. With neither set, calls are only open on a
// developer's machine; on a hosted server they are refused unless ALLOW_UNAUTHENTICATED=true is set on purpose.
const { verifyToken } = require('@clerk/backend');

const reply = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

// A short reason code (such as "token-expired") helps tell a bad key from a bad session. It reveals no secret.
function denied(err) {
  const reason = err && (err.reason || err.code || err.name);
  return reply(401, { error: 'your session could not be verified, sign in again' + (reason ? ` (${String(reason).slice(0, 60)})` : '') });
}

function bearer(headers) {
  const h = headers || {};
  const value = h.authorization || h.Authorization;
  const m = typeof value === 'string' ? /^Bearer\s+(\S+)$/i.exec(value) : null;
  return m ? m[1] : null;
}

// Netlify functions run on AWS Lambda, which sets these. A local dev server or the Netlify CLI does not.
const hosted = env => !!(env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT || env.NETLIFY === 'true') && env.NETLIFY_DEV !== 'true';

/** `env` and `verify` are parameters so tests can run without Clerk. */
function makeGuard(env = process.env, verify = verifyToken) {
  return function withAuth(handler) {
    return async (event, context) => {
      const secretKey = (env.CLERK_SECRET_KEY || '').trim();
      if (!secretKey && !env.VITE_CLERK_PUBLISHABLE_KEY) {
        if (hosted(env) && env.ALLOW_UNAUTHENTICATED !== 'true') return reply(503, { error: 'sign-in is not configured on this server, so requests are refused' });
        return handler(event, context);
      }
      if (!secretKey) return reply(503, { error: 'sign-in is on but CLERK_SECRET_KEY is not set on the server' });

      const token = bearer(event && event.headers);
      if (!token) return reply(401, { error: 'sign in to use this' });
      try {
        // @clerk/backend returns the token's claims when it is valid and throws when it is not.
        const claims = await verify(token, { secretKey });
        if (!claims || !claims.sub) return denied();
      } catch (e) {
        return denied(e);
      }
      return handler(event, context);
    };
  };
}

module.exports = { withAuth: makeGuard(), makeGuard, bearer, hosted };
