// The bank and brokerage keys are one set for the whole site, so every signed-in user would see the same account.
// That is acceptable for the Plaid sandbox and the Alpaca paper account (fake data). For a real bank or a live
// brokerage it is not, so those are refused until accounts are linked per user (Plaid Link plus token storage per
// Clerk user). Set ALLOW_SHARED_ACCOUNTS=true only for a private deployment that is meant to show one account.
const reply = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

/** Returns a refusal response when `isReal` and sharing is not explicitly allowed; otherwise null. */
function refuseSharedReal(isReal, provider, vars = process.env) {
  if (!isReal || vars.ALLOW_SHARED_ACCOUNTS === 'true') return null;
  return reply(403, {
    configured: true, provider,
    error: 'This site uses one shared connection, so real accounts are blocked until each user can link their own. Use the sandbox or paper environment.'
  });
}

module.exports = { refuseSharedReal };
