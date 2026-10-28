import test from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, calculate } from '../calculator.js';

test('JPY pair: 50-pip stop and 3,000 JPY gives 0.06 lot', () => {
  const r = calculate({ symbol: 'USDJPY', entry: '150', stop: '149.5', riskJPY: '3000' });
  assert.equal(r.lots, '0.06'); assert.equal(r.estimatedLossJPY, 3000);
});
test('gold: $10 stop, USDJPY 150, risk 3,000 JPY gives 0.02', () => {
  const r = calculate({ symbol: 'XAUUSD', entry: '2750', stop: '2740', riskJPY: '3000', rateNumerator: '150' });
  assert.equal(r.lots, '0.02'); assert.equal(r.estimatedLossJPY, 3000);
});
test('silver uses 5,000 ounce contract, not the gold contract', () => {
  const r = calculate({ symbol: 'XAGUSD', entry: '32.5', stop: '32', riskJPY: '3000', rateNumerator: '150' });
  assert.equal(r.belowMinimum, true); assert.equal(r.lots, '0.00');
});
test('cross currency uses JPY-per-quote, calculated from common USD base', () => {
  const r = calculate({ symbol: 'EURGBP', entry: '0.85', stop: '0.845', riskJPY: '3750', rateNumerator: '150', rateDenominator: '0.8' });
  assert.equal(r.lots, '0.04'); assert.equal(r.estimatedLossJPY, 3750);
});
test('decimal arithmetic preserves exact lot boundaries and always floors', () => {
  assert.equal(calculate({ symbol: 'USDJPY', entry: '150.1', stop: '150', riskJPY: '3000' }).lots, '0.30');
  assert.equal(calculate({ symbol: 'USDJPY', entry: '150.1', stop: '150', riskJPY: '2999.99' }).lots, '0.29');
});
test('minimum, maximum and sell direction', () => {
  const below = calculate({ symbol: 'USDJPY', entry: '150', stop: '151', riskJPY: '999' });
  assert.equal(below.belowMinimum, true); assert.equal(below.direction, '売り');
  const max = calculate({ symbol: 'XAUUSD', entry: '2750', stop: '2749', riskJPY: '99999999', rateNumerator: '150' });
  assert.equal(max.lots, '20.00'); assert.equal(max.capped, true);
});
test('fullwidth and thousands separators', () => {
  assert.equal(calculate({ symbol: 'USDJPY', entry: '１５０', stop: '１４９．５', riskJPY: '３，０００' }).lots, '0.06');
});
test('rejects missing, equal, negative, infinite and invalid inputs', () => {
  const base = { symbol: 'USDJPY', entry: '150', stop: '149', riskJPY: '3000' };
  for (const bad of ['', '0', '-10', 'NaN', 'Infinity', '1e3', 'abc', '1,5', '1,,500']) assert.throws(() => calculate({ ...base, entry: bad }));
  assert.throws(() => calculate({ ...base, stop: '150' }));
  assert.throws(() => calculate({ ...base, symbol: 'FAKE' }));
  assert.throws(() => calculate({ ...base, symbol: 'XAUUSD', rateNumerator: '0' }));
});
test('all 26 supported symbols round down within amount and exchange risk consistently', () => {
  assert.equal(SYMBOLS.length, 26);
  for (const symbol of SYMBOLS) {
    for (const amount of ['3000', '12345', '10000.99']) {
      const r = calculate({ symbol, entry: '150', stop: '149.76543', riskJPY: amount, rateNumerator: '150.12345', rateDenominator: '0.78654321' });
      assert.ok(r.estimatedLossJPY <= Number(amount));
      assert.match(r.lots, /^\d+\.\d{2}$/);
      if (!r.capped) assert.ok(r.estimatedLossJPY + r.lossPerLotJPY * 0.01 > Number(amount));
    }
  }
});
