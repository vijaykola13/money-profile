// Market data and order history via Alpaca. Defaults to the paper-trading account;
// set ALPACA_ENV=live (and live keys) to go to production. Secrets stay server-side.
const { mapAlpacaBars, mapAlpacaOrders } = require('../lib/mappers');

const TRADING = { paper: 'https://paper-api.alpaca.markets', live: 'https://api.alpaca.markets' };
const DATA = 'https://data.alpaca.markets';
const json = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const { ALPACA_KEY_ID, ALPACA_SECRET } = process.env;
  const env = process.env.ALPACA_ENV || 'paper';
  if (!ALPACA_KEY_ID || !ALPACA_SECRET) return json(200, { configured: false, provider: 'alpaca' });
  if (!TRADING[env]) return json(500, { configured: true, error: `unknown ALPACA_ENV "${env}"` });

  const symbol = ((event.queryStringParameters || {}).symbol || 'SPY').toUpperCase();
  if (!/^[A-Z.]{1,6}$/.test(symbol)) return json(400, { error: 'invalid symbol' });
  const headers = { 'APCA-API-KEY-ID': ALPACA_KEY_ID, 'APCA-API-SECRET-KEY': ALPACA_SECRET };
  const get = async url => {
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`${new URL(url).pathname}: ${data.message || res.status}`);
    return data;
  };

  try {
    const end = new Date(Date.now() - 20 * 60 * 1000); // free IEX feed lags recent data
    const start = new Date(end); start.setUTCFullYear(end.getUTCFullYear() - 1);
    let bars = [], token;
    do {
      const q = new URLSearchParams({
        symbols: symbol, timeframe: '1Day', start: start.toISOString(), end: end.toISOString(),
        adjustment: 'split', feed: 'iex', limit: '1000', ...(token && { page_token: token })
      });
      const page = await get(`${DATA}/v2/stocks/bars?${q}`);
      bars = bars.concat(page.bars[symbol] || []);
      token = page.next_page_token;
    } while (token);

    const prices = mapAlpacaBars(bars);
    const orders = await get(`${TRADING[env]}/v2/orders?${new URLSearchParams({
      status: 'closed', symbols: symbol, limit: '500', direction: 'asc', after: start.toISOString()
    })}`);
    return json(200, {
      configured: true, provider: 'alpaca', env, symbol, prices, trades: mapAlpacaOrders(orders, prices)
    });
  } catch (e) {
    return json(502, { configured: true, provider: 'alpaca', error: e.message });
  }
};
