import { SYMBOLS, specification, normalizeNumber, calculate } from './calculator.js';

const form = document.querySelector('#calculator');
const symbol = document.querySelector('#symbol');
const entry = document.querySelector('#entry');
const stop = document.querySelector('#stop');
const risk = document.querySelector('#risk');
const result = document.querySelector('#result');
const error = document.querySelector('#error');
const submit = document.querySelector('#submit');
const currencyNames = { AUD: '豪ドル', CAD: 'カナダドル', CHF: 'スイスフラン', EUR: 'ユーロ', GBP: 'ポンド', NZD: 'NZドル', USD: '米ドル', JPY: '円', XAU: 'ゴールド', XAG: 'シルバー' };
const money = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
let inputRevision = 0;
let busy = false;

for (const name of ['XAUUSD', 'XAGUSD', ...SYMBOLS.filter(s => !s.startsWith('XA'))]) {
  symbol.add(new Option(name, name));
}
try { symbol.value = SYMBOLS.includes(localStorage.getItem('lot-symbol')) ? localStorage.getItem('lot-symbol') : 'XAUUSD'; } catch { /* Storage is optional. */ }

function updateSymbol() {
  const name = symbol.value;
  document.querySelector('#symbol-help').textContent = `${currencyNames[name.slice(0, 3)]} / ${currencyNames[name.slice(3)]}`;
  const examples = name.startsWith('XA') ? (name === 'XAUUSD' ? ['2750.00', '2740.00'] : ['32.500', '32.000']) : name.endsWith('JPY') ? ['150.000', '149.500'] : ['1.10000', '1.09500'];
  entry.placeholder = `例：${examples[0]}`;
  stop.placeholder = `例：${examples[1]}`;
}
updateSymbol();

form.addEventListener('input', () => {
  inputRevision++;
  result.hidden = true;
  error.hidden = true;
});
symbol.addEventListener('change', () => {
  inputRevision++;
  entry.value = '';
  stop.value = '';
  result.hidden = true;
  error.hidden = true;
  updateSymbol();
  try { localStorage.setItem('lot-symbol', symbol.value); } catch { /* Storage is optional. */ }
});

async function fetchConversion(quote) {
  if (quote === 'JPY') return { numerator: '1', denominator: '1', fetchedAt: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD', {
      signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('rate-http');
    const body = await response.json();
    if (body?.data?.currency !== 'USD') throw new Error('rate-base');
    const rates = body.data.rates;
    const numerator = rates?.JPY;
    const denominator = quote === 'USD' ? '1' : rates?.[quote];
    if (!Number.isFinite(Number(numerator)) || Number(numerator) <= 0 || !Number.isFinite(Number(denominator)) || Number(denominator) <= 0) throw new Error('rate-value');
    return { numerator, denominator, fetchedAt: new Date() };
  } catch {
    throw new Error('換算レートを取得できませんでした。通信状態を確認して、もう一度計算してください。');
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const revision = inputRevision;
  const inputs = { symbol: symbol.value, entry: entry.value, stop: stop.value, riskJPY: risk.value };
  result.hidden = true;
  error.hidden = true;
  try {
    // Validate input before making a request. This provisional result is never rendered.
    for (const field of ['entry', 'stop', 'riskJPY']) inputs[field] = normalizeNumber(inputs[field]);
    calculate(inputs);
    busy = true;
    submit.disabled = true;
    submit.textContent = '計算中…';
    const quote = specification(inputs.symbol).quote;
    const conversion = await fetchConversion(quote);
    if (revision !== inputRevision) return;
    const answer = calculate({ ...inputs, rateNumerator: conversion.numerator, rateDenominator: conversion.denominator });
    if (answer.belowMinimum) throw new Error('計算結果は0.01ロット未満です。この損失額では最小ロットを下回ります。');
    document.querySelector('#lots').value = answer.lots;
    document.querySelector('#trade-summary').textContent = `${inputs.symbol} · ${answer.direction}`;
    document.querySelector('#estimated-loss').textContent = `${money.format(answer.estimatedLossJPY)} 円`;
    document.querySelector('#rounding').textContent = answer.capped ? `銘柄の最大ロット（${specification(inputs.symbol).maxLots}）を適用` : '0.01ロット単位で切り捨て';
    document.querySelector('#rate-info').textContent = conversion.fetchedAt
      ? `1 ${quote} ≈ ${answer.rate.toLocaleString('ja-JP', { maximumFractionDigits: 5 })} 円\nCoinbase参考レート · ${conversion.fetchedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}取得`
      : '損益通貨はJPYのため、為替換算なし';
    result.hidden = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    result.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  } catch (failure) {
    if (revision === inputRevision) {
      error.textContent = failure.message;
      error.hidden = false;
    }
  } finally {
    busy = false;
    submit.disabled = false;
    submit.innerHTML = 'ロットを計算 <span aria-hidden="true">↗</span>';
  }
});

// A cached result must not reappear after switching away to MT5 and returning.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    inputRevision++;
    result.hidden = true;
  }
});
