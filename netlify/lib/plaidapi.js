// One place for calling Plaid, shared by the bank-data and bank-linking functions.
const HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' };

async function plaid(host, path, body) {
  const res = await fetch(host + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error_code || res.status} ${data.error_message || ''}`.trim());
  return data;
}

module.exports = { HOSTS, plaid };
