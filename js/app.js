(function () {
  const demo = window.DEMO;
  const personas = demo.personas.slice();
  const usd = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = n => (n * 100).toFixed(1) + '%';
  const $ = id => document.getElementById(id);

  function renderProfile(p) {
    const prof = Engine.profile(p.transactions);
    const cats = Object.entries(prof.byCategory).sort((a, b) => b[1] - a[1]);
    const max = cats.length ? cats[0][1] : 1;
    $('profile').innerHTML = `
      <h2>Spending profile <span class="badge ${prof.label}">${prof.label}</span></h2>
      <div class="grid">
        <div class="stat"><div class="v">${usd(prof.income)}</div><div class="k">Take-home income</div></div>
        <div class="stat"><div class="v">${usd(prof.spent)}</div><div class="k">Expenses</div></div>
        <div class="stat"><div class="v">${pct(prof.savingsRate)}</div><div class="k">Savings rate</div></div>
        <div class="stat"><div class="v">${pct(prof.fixedShare)}</div><div class="k">Fixed share of spending</div></div>
        <div class="stat"><div class="v">${pct(prof.incomeVolatility)}</div><div class="k">Income variability</div></div>
      </div>
      <div class="bars">${cats.map(([c, v]) => `
        <div class="bar"><span>${c}</span><i style="width:${(v / max * 100).toFixed(0)}%"></i><span>${usd(v)}</span></div>`).join('')}
      </div>
      <p class="note">Saver &ge; 20% savings rate, Balanced 5&ndash;20%, Stretched below 5%.</p>`;
  }

  function renderTax(p) {
    const t = Engine.estimateTax(p.tax, TAX2025);
    const known = p.tax.withholding != null;
    const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    $('tax').innerHTML = `
      <h2>2025 federal tax estimate <span class="note">(estimate)</span></h2>
      <table>
        ${row('Filing status', p.tax.filingStatus === 'mfj' ? 'Married filing jointly' : 'Single')}
        ${row('Wages', usd(p.tax.wages))}
        ${p.tax.selfEmployment ? row('Self-employment income', usd(p.tax.selfEmployment)) : ''}
        ${row('Adjusted gross income', usd(t.agi))}
        ${row('Standard deduction', usd(-t.standardDeduction))}
        ${row('Taxable income', usd(t.taxable))}
        ${row('Income tax', usd(t.incomeTax))}
        ${t.seTax ? row('Self-employment tax', usd(t.seTax)) : ''}
        ${row('Total tax', usd(t.total))}
        ${row('Effective rate', pct(t.effectiveRate))}
        ${known ? row('Tax already withheld', usd(p.tax.withholding)) : ''}
      </table>
      ${known
        ? `<p class="result">${t.balance >= 0 ? 'Estimated refund' : 'Estimated amount owed'}: ${usd(Math.abs(t.balance))}</p>`
        : `<p class="result">Estimated tax before withholding: ${usd(t.total)}</p>
           <p class="note">Add your withholding to see a refund or amount owed.</p>`}
      <p class="note">Federal income tax only; FICA on wages (${usd(t.ficaOnWages)}) is assumed already withheld.</p>`;
  }

  function chart(prices, trades, ticker) {
    const W = 720, H = 260, L = 44, R = 12, T = 12, B = 28;
    const lo = Math.min(...prices.map(x => x.close)) * 0.95;
    const hi = Math.max(...prices.map(x => x.close)) * 1.05;
    const x = i => L + i / Math.max(1, prices.length - 1) * (W - L - R);
    const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = prices.map((q, i) => `${x(i).toFixed(1)},${y(q.close).toFixed(1)}`).join(' ');
    const ticks = [lo, (lo + hi) / 2, hi].map(v =>
      `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".12"/>
       <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
    const labels = [0, 1, 2, 3, 4, 5].map(k => Math.round(k * (prices.length - 1) / 5)).map(i =>
      `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${prices[i].date.slice(0, 7)}</text>`).join('');
    const marks = trades.map(t => {
      const sell = t.side === 'sell';
      return `<circle cx="${x(t.day)}" cy="${y(prices[t.day].close)}" r="6" fill="${sell ? '#c0392b' : '#1a7f4b'}" stroke="#fff" stroke-width="1.5">
        <title>${t.side} ${t.shares} ${ticker} on ${prices[t.day].date} at $${prices[t.day].close}</title></circle>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${ticker} price with buys and sells">
      ${ticks}${labels}
      <polyline points="${line}" fill="none" stroke="#1f5fbf" stroke-width="2"/>${marks}</svg>`;
  }

  function renderPortfolio(p) {
    const el = $('portfolio');
    const prices = p.prices || demo.prices;
    const ticker = p.ticker || demo.ticker;
    if (!p.trades.length || prices.length < 2) {
      el.innerHTML = `<h2>Investments</h2><p class="note">No stock activity found for ${p.name}.</p>`;
      return;
    }
    const events = Engine.detectPanic(prices, p.trades);
    const flagged = events.filter(e => e.flagged);
    const last = prices.length - 1;
    const sig = Engine.signal(prices, last);
    const shares = p.trades.reduce((s, t) => s + (t.side === 'buy' ? t.shares : -t.shares), 0);

    const alerts = flagged.length
      ? flagged.map(e => `<div class="alert"><strong>Panic-sell pattern on ${e.date}.</strong>
          Sold ${pct(e.soldFraction)} of the position (${e.sold} shares) while ${ticker} was ${pct(e.drawdown)} below its recent peak.
          Holding those shares to the latest price would be worth ${usd(e.heldValue)} versus ${usd(e.proceeds)} received
          (<strong>${usd(e.regret)}</strong> difference).</div>`).join('')
      : `<div class="ok">No panic-sell pattern detected. ${p.name} did not sell into a drop.</div>`;

    el.innerHTML = `
      <h2>Investments &mdash; ${ticker}</h2>
      ${chart(prices, p.trades, ticker)}
      <p class="note">Green = buy, red = sell. Hover a marker for details.</p>
      ${alerts}
      <div class="grid">
        <div class="stat"><div class="v">${shares}</div><div class="k">Shares held</div></div>
        <div class="stat"><div class="v">${usd(shares * sig.price)}</div><div class="k">Value at $${sig.price}</div></div>
        <div class="stat"><div class="v">${sig.trend}</div><div class="k">vs 50-day average ($${sig.ma50.toFixed(2)})</div></div>
      </div>
      <p><strong>View:</strong> ${sig.view}.</p>`;
  }

  function show(id) {
    const p = personas.find(x => x.id === id);
    $('tagline').innerHTML = `${p.name}: ${p.tagline} ${p.source ? `<span class="source">${p.source}</span>` : ''}`;
    renderProfile(p); renderTax(p); renderPortfolio(p);
    document.querySelectorAll('#personas button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
  }

  function drawNav() {
    $('personas').innerHTML = personas.map(p => `<button data-id="${p.id}" aria-pressed="false">${p.name}</button>`).join('');
  }

  // Live accounts: bank data (Plaid) and brokerage/market data (Alpaca) via Netlify Functions.
  // Each source falls back to demo data when its function is missing or not configured.
  async function loadLive() {
    const call = path => fetch(path).then(r => r.json()).catch(() => ({ configured: false }));
    const [bank, market] = await Promise.all([
      call('/.netlify/functions/plaid'), call('/.netlify/functions/alpaca?symbol=SPY')
    ]);
    const bankOk = bank.configured && !bank.error && bank.transactions && bank.transactions.length;
    const marketOk = market.configured && !market.error && market.prices && market.prices.length;
    if (!bankOk && !marketOk) return;

    const base = demo.personas[0];
    const months = new Set((bank.transactions || []).map(t => t.month)).size || 12;
    const income = (bank.transactions || []).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    personas.unshift({
      id: 'live', name: 'Connected account', tagline: 'Your linked bank and brokerage.',
      source: [bankOk && `bank: ${bank.provider} ${bank.env}`, marketOk && `market: ${market.provider} ${market.env}`]
        .filter(Boolean).join(' · '),
      transactions: bankOk ? bank.transactions : base.transactions,
      tax: bankOk
        ? { filingStatus: 'single', wages: Math.round(income * 12 / months), withholding: null }
        : base.tax,
      prices: marketOk ? market.prices : undefined,
      ticker: marketOk ? market.symbol : undefined,
      trades: marketOk ? market.trades : []
    });
    drawNav(); show('live');
  }

  drawNav();
  $('personas').addEventListener('click', e => { if (e.target.dataset.id) show(e.target.dataset.id); });
  show(personas[0].id);
  loadLive();
})();
