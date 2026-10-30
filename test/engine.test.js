const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const E = require('../js/engine.js');
const TAX = require('../js/tax2025.js');

// data/demo.js assigns window.DEMO; load it in a sandbox.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo.js'), 'utf8'), sandbox);
const DEMO = sandbox.window.DEMO;
const persona = id => DEMO.personas.find(p => p.id === id);

test('tax: MFJ wages only matches hand calculation', () => {
  // 108,000 - 31,500 = 76,500 taxable -> 2,385 + (76,500 - 23,850) * 12% = 8,703
  const r = E.estimateTax({ filingStatus: 'mfj', wages: 108000, withholding: 12500 }, TAX);
  assert.equal(Math.round(r.taxable), 76500);
  assert.equal(Math.round(r.incomeTax), 8703);
  assert.equal(Math.round(r.balance), 12500 - 8703);
});

test('tax: self-employment adds SE tax and deducts half of it', () => {
  const r = E.estimateTax({ filingStatus: 'single', wages: 54000, selfEmployment: 6000, withholding: 4200 }, TAX);
  assert.equal(Math.round(r.seTax), 848);
  assert.equal(Math.round(r.agi), Math.round(60000 - r.seTax / 2));
  assert.ok(r.balance < 0, 'Blake should owe tax');
});

test('tax: income below the standard deduction owes nothing', () => {
  const r = E.estimateTax({ filingStatus: 'single', wages: 10000, withholding: 0 }, TAX);
  assert.equal(r.incomeTax, 0);
});

test('profile: personas get the intended labels', () => {
  assert.equal(E.profile(persona('avery').transactions).label, 'Saver');
  assert.equal(E.profile(persona('casey').transactions).label, 'Balanced');
  assert.equal(E.profile(persona('blake').transactions).label, 'Stretched');
});

test('panic: Casey is flagged, Avery is not', () => {
  const casey = E.detectPanic(DEMO.prices, persona('casey').trades);
  assert.equal(casey.length, 1);
  assert.equal(casey[0].flagged, true);
  assert.ok(casey[0].soldFraction >= 0.7);
  assert.ok(casey[0].regret > 0, 'holding would have beaten selling in this replay');

  const avery = E.detectPanic(DEMO.prices, persona('avery').trades);
  assert.equal(avery.length, 0);
});

test('panic: a small sell in a calm market is not flagged', () => {
  const trades = [{ day: 0, side: 'buy', shares: 100 }, { day: 20, side: 'sell', shares: 10 }];
  const r = E.detectPanic(DEMO.prices, trades);
  assert.equal(r[0].flagged, false);
});
