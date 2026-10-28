// Contract sizes: https://funded7.com/faq/contract-specifications/
export const SYMBOLS = Object.freeze([
  'AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDUSD', 'CADJPY', 'CHFJPY',
  'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD',
  'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD', 'GBPJPY', 'GBPUSD',
  'NZDJPY', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'XAUUSD', 'XAGUSD',
]);

export function specification(symbol) {
  if (!SYMBOLS.includes(symbol)) throw new Error('銘柄を選択してください。');
  return {
    quote: symbol.slice(3),
    contract: symbol === 'XAUUSD' ? 100 : symbol === 'XAGUSD' ? 5000 : 100000,
    maxLots: symbol.startsWith('XA') ? 20 : 100,
  };
}

export function normalizeNumber(value) {
  const text = String(value).normalize('NFKC').trim();
  if (text.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(text)) {
    throw new Error('桁区切りは「3,000」の形式で入力してください。');
  }
  return text.replaceAll(',', '');
}

// Rational arithmetic keeps a floating-point rounding error from adding 0.01 lot.
function fraction(value, label) {
  const text = normalizeNumber(value);
  if (!/^(?:\d{1,18}(?:\.\d{0,24})?|\.\d{1,24})$/.test(text)) {
    throw new Error(`${label}を正しい数値で入力してください。`);
  }
  const [whole, decimals = ''] = text.split('.');
  const result = { n: BigInt((whole || '0') + decimals), d: 10n ** BigInt(decimals.length) };
  if (result.n <= 0n) throw new Error(`${label}は0より大きい値を入力してください。`);
  return result;
}

export function calculate({ symbol, entry, stop, riskJPY, rateNumerator = '1', rateDenominator = '1' }) {
  const spec = specification(symbol);
  const e = fraction(entry, 'エントリー価格');
  const s = fraction(stop, '損切り価格');
  const risk = fraction(riskJPY, '損失額');
  const delta = e.n * s.d - s.n * e.d;
  if (delta === 0n) throw new Error('エントリー価格と損切り価格を変えてください。');
  const gap = { n: delta < 0n ? -delta : delta, d: e.d * s.d };
  const rn = spec.quote === 'JPY' ? { n: 1n, d: 1n } : fraction(rateNumerator, '換算レート');
  const rd = spec.quote === 'JPY' ? { n: 1n, d: 1n } : fraction(rateDenominator, '換算レート');
  const lossN = gap.n * BigInt(spec.contract) * rn.n * rd.d;
  const lossD = gap.d * rn.d * rd.n;
  const rawUnits = risk.n * lossD * 100n / (risk.d * lossN);
  const maxUnits = BigInt(spec.maxLots * 100);
  const units = rawUnits > maxUnits ? maxUnits : rawUnits;
  const numberOfLots = Number(units) / 100;
  return {
    lots: numberOfLots.toFixed(2),
    belowMinimum: units < 1n,
    capped: rawUnits > maxUnits,
    estimatedLossJPY: Number(lossN * units) / Number(lossD * 100n),
    lossPerLotJPY: Number(lossN) / Number(lossD),
    gap: Number(gap.n) / Number(gap.d),
    direction: delta > 0n ? '買い' : '売り',
    rate: Number(rn.n * rd.d) / Number(rn.d * rd.n),
    quote: spec.quote,
  };
}
