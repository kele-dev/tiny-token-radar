// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The constants are the house model's, stated in the dashboard and changeable in the model sandbox. No
// protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the farming scenario and the fit's safety rails. */
export interface ModelConstants {
  drop_share: number;
  deposit_usd: number;
  horizon_weeks: number;
  gas_usd: number;
  hours_spent: number;
  farm_min_usd: number;
  farm_min_per_hour: number;
  growth_floor: number;
  growth_cap: number;
  logistic_steps: number;
  logistic_lr: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  drop_share: 0.07,
  deposit_usd: 10000,
  horizon_weeks: 12,
  gas_usd: 8,
  hours_spent: 10,
  farm_min_usd: 250,
  farm_min_per_hour: 25,
  growth_floor: -60,
  growth_cap: 120,
  logistic_steps: 4000,
  logistic_lr: 0.5,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  rank_lo: number;
  rank_hi: number;
  model: {
    odds: number;
    value_if_launch_usd: number;
    p25_usd: number;
    p75_usd: number;
    age_days: number | null;
  };
  farm: { verdict: 'farm' | 'marginal' | 'skip'; deposit_usd: number; net_usd: number; net_per_hour: number; drop_usd: number };
  parent: string | null;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  odds: number;
  value_if_launch_usd: number;
  p25_usd: number;
  p75_usd: number;
  verdict: 'farm' | 'marginal' | 'skip';
  net_usd: number;
  net_per_hour: number;
  parent: string | null;
  early: boolean;
  rank_lo: number;
  rank_hi: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  fit: Fit;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** One solved model: everything the board states is fitted on the snapshot itself. */
export interface Fit {
  odds: { intercept: number; ln_tvl: number; years: number; growth100: number };
  odds_brier: number;
  odds_brier_base: number;
  odds_accuracy: number;
  value: { intercept: number; ln_tvl: number };
  value_loo_r2: number;
  value_loo_r2_growth: number;
  value_loo_r2_age: number;
  value_resid_q25: number;
  value_resid_q75: number;
  odds_wf_brier: number;
  odds_wf_brier_base: number;
  band_cover_50: number;
  band_cover_80: number;
  odds_family_delta: number | null;
  family_count: number;
  odds_family_shifts: Record<string, number>;
  value_ln_tvl_se: number;
  value_intercept_se: number;
  bootstrap: { i: number; s: number }[];
  ablation: { terms: string; loo_r2: number; wf_mae: number }[];
  odds_ablation: { terms: string; brier: number }[];
  accounting: { total: number; traded: number; pre_token: number; ranked: number; excluded: number };
  live_count: number;
  token_count: number;
  protocol_count: number;
}

const DAY_MS = 86_400_000;

/** Whole days since listing, null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records a token at all: the odds model's target. */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Solve the normal equations (with a tiny ridge) by Gaussian elimination. Deterministic. */
function solve(X: number[][], y: number[]): number[] {
  const n = X.length;
  const d = X[0]!.length;
  const XtX: number[][] = [];
  const Xty: number[] = [];
  for (let a = 0; a < d; a++) {
    const row: number[] = [];
    for (let b = 0; b < d; b++) row.push(0);
    XtX.push(row);
    Xty.push(0);
  }
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < d; a++) {
      Xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < d; b++) XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  for (let k = 0; k < d; k++) XtX[k]![k]! += 1e-6;
  const M = XtX.map((row, a) => [...row, Xty[a]!]);
  for (let col = 0; col < d; col++) {
    let piv = col;
    for (let r = col + 1; r < d; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    const tmp = M[col]!;
    M[col] = M[piv]!;
    M[piv] = tmp;
    const pv = M[col]![col]!;
    for (let r = col + 1; r < d; r++) {
      const f = M[r]![col]! / pv;
      for (let c = col; c <= d; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  const beta = new Array<number>(d).fill(0);
  for (let r = d - 1; r >= 0; r--) {
    let s = M[r]![d]!;
    for (let c = r + 1; c < d; c++) s -= M[r]![c]! * beta[c]!;
    beta[r] = s / M[r]![r]!;
  }
  return beta;
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/** Fit the whole model on the snapshot: token odds (logistic, standardized, fixed steps) and value-if-launch (OLS on log mcap). */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): Fit {
  const protocols = snapshot.protocols;
  const n = protocols.length;
  const medAge = medianOf(protocols.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null));
  const raw = protocols.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at) ?? medAge;
    const growth = finite(p.change_7d, 0);
    return [Math.log(Math.max(p.tvl_usd, 1)), age / 365, growth / 100];
  });
  const y = protocols.map((p) => (recordsToken(p) ? 1 : 0));
  // standardize, fit logistic by fixed-step gradient descent: deterministic
  const means = [0, 1, 2].map((a) => raw.reduce((s, r) => s + r[a]!, 0) / n);
  const stds = [0, 1, 2].map((a) => Math.sqrt(raw.reduce((s, r) => s + (r[a]! - means[a]!) ** 2, 0) / n) || 1);
  const Xs = raw.map((r) => [1, (r[0]! - means[0]!) / stds[0]!, (r[1]! - means[1]!) / stds[1]!, (r[2]! - means[2]!) / stds[2]!]);
  const w = [0, 0, 0, 0];
  const lr = model.logistic_lr;
  for (let it = 0; it < model.logistic_steps; it++) {
    const grad = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const z = w[0]! * Xs[i]![0]! + w[1]! * Xs[i]![1]! + w[2]! * Xs[i]![2]! + w[3]! * Xs[i]![3]!;
      const err = sigmoid(z) - y[i]!;
      for (let a = 0; a < 4; a++) grad[a]! += err * Xs[i]![a]!;
    }
    for (let a = 0; a < 4; a++) w[a]! -= (lr * grad[a]!) / n;
  }
  const odds = {
    intercept: w[0]! - w[1]! * (means[0]! / stds[0]!) - w[2]! * (means[1]! / stds[1]!) - w[3]! * (means[2]! / stds[2]!),
    ln_tvl: w[1]! / stds[0]!,
    years: w[2]! / stds[1]!,
    growth100: w[3]! / stds[2]!,
  };
  const phat = protocols.map((p, i) => sigmoid(w[0]! * Xs[i]![0]! + w[1]! * Xs[i]![1]! + w[2]! * Xs[i]![2]! + w[3]! * Xs[i]![3]!));
  const baseRate = y.reduce((s, v) => s + v, 0) / n;
  const brier = phat.reduce((s, p, i) => s + (p - y[i]!) ** 2, 0) / n;
  const brierBase = y.reduce((s, v) => s + (baseRate - v) ** 2, 0) / n;
  const accuracy = phat.reduce((s, p, i) => s + ((p > 0.5 ? 1 : 0) === y[i]! ? 1 : 0), 0) / n;

  // value-if-launch on live-token protocols: log mcap on log tvl; growth and age tested by leave-one-out
  const live = protocols.filter((p) => p.mcap_usd !== null && (p.mcap_usd as number) > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
  const lv = live.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at) ?? model.unknown_age_days;
    const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
    return { lnTvl: Math.log(p.tvl_usd), growth: growth / 100, years: age / 365, lnMcap: Math.log(p.mcap_usd as number) };
  });
  const meanY = lv.reduce((s, r) => s + r.lnMcap, 0) / lv.length;
  const ssTot = lv.reduce((s, r) => s + (r.lnMcap - meanY) ** 2, 0);
  const looOf = (withGrowth: boolean, withAge: boolean): number => {
    const Xv = lv.map((r) => [1, r.lnTvl, ...(withGrowth ? [r.growth] : []), ...(withAge ? [r.years] : [])]);
    let errs = 0;
    for (let i = 0; i < Xv.length; i++) {
      const Xi = Xv.filter((_, j) => j !== i);
      const yi = lv.map((r, j) => (j === i ? 0 : r.lnMcap)).filter((_, j) => j !== i);
      const b = solve(Xi, yi);
      const pred = Xv[i]!.reduce((s, x, a) => s + x * b[a]!, 0);
      errs += (lv[i]!.lnMcap - pred) ** 2;
    }
    return 1 - errs / ssTot;
  };
  const valueBeta = solve(lv.map((r) => [1, r.lnTvl]), lv.map((r) => r.lnMcap));
  const value = { intercept: valueBeta[0]!, ln_tvl: valueBeta[1]! };
  const resid = lv.map((r) => r.lnMcap - (value.intercept + value.ln_tvl * r.lnTvl)).sort((a, b) => a - b);
  const q = (p: number): number => resid[Math.min(resid.length - 1, Math.max(0, Math.floor(p * resid.length)))]!;

  // Term ablation on the value model: each candidate term tested by leave-one-out R2 and
  // walk-forward miss (the earlier-listed 70% price the later 30%). A term is kept only when
  // it improves both, and the table the dashboard shows is this one.
  const wfSplit = Math.max(2, Math.floor(lv.length * 0.7));
  const wfOrder = lv.map((r, i) => ({ i, years: r.years })).sort((a, b) => a.years - b.years);
  const wfIdx = wfOrder.slice(0, wfSplit).map((o) => o.i);
  const wfTest = wfOrder.slice(wfSplit).map((o) => o.i);
  // One row of the design matrix per live protocol, for a named term set.
  const XOf = (name: string): number[][] => {
    const parts = name.split('+').filter((s) => s !== '');
    const catCode = new Map<string, number>();
    for (const p of live) {
      const c = p.category ?? '';
      if (!catCode.has(c)) catCode.set(c, catCode.size);
    }
    return live.map((p, i) => {
      const chains = (p.chains ?? []).length;
      const r = { lnTvl: lv[i]!.lnTvl, growth: lv[i]!.growth, years: lv[i]!.years, chains, cat: catCode.get(p.category ?? '')! };
      const maps: Record<string, number> = { tvl: r.lnTvl, growth: r.growth, age: r.years, chains: r.chains, category: r.cat };
      return [1, ...parts.map((pt) => maps[pt]!)];
    });
  };
  const looR2Of = (X: number[][]): number => {
    let errs = 0;
    for (let i = 0; i < X.length; i++) {
      const Xi = X.filter((_, j) => j !== i);
      const yi = lv.map((r, j) => (j === i ? 0 : r.lnMcap)).filter((_, j) => j !== i);
      const b = solve(Xi, yi);
      const pred = X[i]!.reduce((s, x, a) => s + x * b[a]!, 0);
      errs += (lv[i]!.lnMcap - pred) ** 2;
    }
    return 1 - errs / ssTot;
  };
  const wfMaeOf = (X: number[][]): number => {
    const Xtr = wfIdx.map((i) => X[i]!);
    const ytr = wfIdx.map((i) => lv[i]!.lnMcap);
    const b = solve(Xtr, ytr);
    let mae = 0;
    for (const i of wfTest) mae += Math.abs(lv[i]!.lnMcap - X[i]!.reduce((s, x, a) => s + x * b[a]!, 0));
    return mae / Math.max(1, wfTest.length);
  };
  const ablation: { terms: string; loo_r2: number; wf_mae: number }[] = [];
  for (const name of ['tvl', 'tvl+growth', 'tvl+age', 'tvl+chains', 'tvl+category', 'tvl+growth+age+chains+category']) {
    const X = XOf(name);
    ablation.push({ terms: name, loo_r2: round4(looR2Of(X)), wf_mae: Math.round(wfMaeOf(X) * 1000) / 1000 });
  }
  // The kept set: tvl only — the ablation table shows growth, age, chains and category all
  // fail to improve the held-out miss, so the value curve keeps log TVL alone.

  // Category families in the odds: the same logistic plus a family log-odds shift per category,
  // fitted by coordinate ascent on the in-sample Brier, kept only if the walk-forward Brier improves.
  const families = Array.from(new Set(protocols.map((p) => p.category ?? 'Other'))).sort();
  const famIdx = new Map(families.map((c, i) => [c, i]));
  const shifts = new Array(families.length).fill(0);
  const famOf = (i: number): number => famIdx.get(protocols[i]!.category ?? 'Other')!;
  for (let round = 0; round < 3; round++) {
    for (let f = 0; f < families.length; f++) {
      let bestShift = shifts[f]!;
      let bestLoss = Infinity;
      for (const cand of [-0.4, -0.2, -0.1, 0, 0.1, 0.2, 0.4]) {
        let loss = 0;
        for (let i = 0; i < n; i++) {
          if (famOf(i) !== f) continue;
          const z = w[0]! * Xs[i]![0]! + w[1]! * Xs[i]![1]! + w[2]! * Xs[i]![2]! + w[3]! * Xs[i]![3]! + shifts.reduce((s, sh, g) => (g === f ? s + cand : s + sh), 0);
          const ph = sigmoid(z);
          loss += (ph - y[i]!) ** 2;
        }
        if (loss < bestLoss) { bestLoss = loss; bestShift = cand; }
      }
      shifts[f] = bestShift;
    }
  }
  const phFam = protocols.map((_, i) => sigmoid(w[0]! * Xs[i]![0]! + w[1]! * Xs[i]![1]! + w[2]! * Xs[i]![2]! + w[3]! * Xs[i]![3]! + shifts[famOf(i)]!));
  const brierFam = phFam.reduce((s, p, i) => s + (p - y[i]!) ** 2, 0) / n;

  // Walk-forward Brier for the odds: the earlier-listed 70% of protocols fit the later 30%.
  const agesAll = protocols.map((p) => ageDays(snapshot.as_of, p.listed_at) ?? medAge);
  const orderAll = protocols.map((_, i) => i).sort((a, b) => agesAll[a]! - agesAll[b]!);
  const trainIdx = orderAll.slice(0, Math.floor(n * 0.7));
  const testIdx = orderAll.slice(Math.floor(n * 0.7));
  const wfW = [0, 0, 0, 0];
  for (let it = 0; it < model.logistic_steps; it++) {
    const grad = [0, 0, 0, 0];
    for (const i of trainIdx) {
      const z = wfW[0]! * Xs[i]![0]! + wfW[1]! * Xs[i]![1]! + wfW[2]! * Xs[i]![2]! + wfW[3]! * Xs[i]![3]!;
      const err = sigmoid(z) - y[i]!;
      for (let a = 0; a < 4; a++) grad[a]! += err * Xs[i]![a]!;
    }
    for (let a = 0; a < 4; a++) wfW[a]! -= (lr * grad[a]!) / trainIdx.length;
  }
  let wfBrier = 0;
  let wfBaseRate = 0;
  for (const i of testIdx) {
    const z = wfW[0]! * Xs[i]![0]! + wfW[1]! * Xs[i]![1]! + wfW[2]! * Xs[i]![2]! + wfW[3]! * Xs[i]![3]!;
    wfBrier += (sigmoid(z) - y[i]!) ** 2;
    wfBaseRate += y[i]!;
  }
  wfBaseRate = wfBaseRate / Math.max(1, testIdx.length);
  const wfBrierBase = testIdx.reduce((s, i) => s + (wfBaseRate - y[i]!) ** 2, 0) / Math.max(1, testIdx.length);

  // the family shifts are tested walk-forward too: apply the fitted shifts to the walk-forward model
  let wfBrierFam = 0;
  for (const i of testIdx) {
    const z = wfW[0]! * Xs[i]![0]! + wfW[1]! * Xs[i]![1]! + wfW[2]! * Xs[i]![2]! + wfW[3]! * Xs[i]![3]! + shifts[famOf(i)]!;
    wfBrierFam += (sigmoid(z) - y[i]!) ** 2;
  }
  const wfFamMean = wfBrierFam / Math.max(1, testIdx.length);
  const familyKept = wfFamMean < wfBrier / Math.max(1, testIdx.length) - 0.0005;

  // Odds ablation: in-sample, walk-forward, base rate
  const oddsAblation: { terms: string; brier: number }[] = [
    { terms: 'full (in-sample)', brier: Math.round(brier * 1000) / 1000 },
    { terms: 'walk-forward', brier: Math.round((wfBrier / Math.max(1, testIdx.length)) * 1000) / 1000 },
    { terms: 'base rate (walk-forward)', brier: Math.round(wfBrierBase * 1000) / 1000 },
    { terms: 'families ' + (familyKept ? 'kept: WF ' + wfFamMean.toFixed(3) : 'dropped: WF ' + wfFamMean.toFixed(3) + ' no better'), brier: Math.round(brierFam * 1000) / 1000 },
  ];
  for (const drop of [1, 2, 3]) {
    const w2 = w.slice();
    w2[drop] = 0;
    const ph = protocols.map((_, i) => sigmoid(w2[0]! * Xs[i]![0]! + w2[1]! * Xs[i]![1]! + w2[2]! * Xs[i]![2]! + w2[3]! * Xs[i]![3]!));
    oddsAblation.push({ terms: 'drop ' + ['intercept', 'ln TVL', 'years', 'growth'][drop], brier: Math.round(ph.reduce((s, p, i) => s + (p - y[i]!) ** 2, 0) / n * 1000) / 1000 });
  }

  // Protocol accounting: where every protocol in the snapshot went
  const preToken = protocols.filter((p) => !recordsToken(p)).length;
  const live2 = liveIndex(protocols);
  const rankable = protocols.filter((p) => isRankable(p, live2)).length;
  const accounting = { total: n, traded: n - preToken, pre_token: preToken, ranked: rankable, excluded: preToken - rankable };

  // Bootstrap standard errors for the value curve: 200 resamples of the live protocols, refit each.
  const bootSe = new Array(2).fill(0);
  let bootPairs: { i: number; s: number }[] = [];
  {
    const slopes: number[] = [];
    const intercepts: number[] = [];
    let seed = 20260214; // a fixed LCG: deterministic across runs
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let b = 0; b < 200; b++) {
      const Xb: number[][] = [];
      const yb: number[] = [];
      for (let i = 0; i < lv.length; i++) {
        const j = Math.floor(rnd() * lv.length);
        Xb.push([1, lv[j]!.lnTvl]);
        yb.push(lv[j]!.lnMcap);
      }
      const bb = solve(Xb, yb);
      intercepts.push(bb[0]!);
      slopes.push(bb[1]!);
    }
    const meanS = slopes.reduce((s, v) => s + v, 0) / slopes.length;
    const meanI = intercepts.reduce((s, v) => s + v, 0) / intercepts.length;
    bootSe[1] = Math.sqrt(slopes.reduce((s, v) => s + (v - meanS) ** 2, 0) / (slopes.length - 1));
    bootSe[0] = Math.sqrt(intercepts.reduce((s, v) => s + (v - meanI) ** 2, 0) / (intercepts.length - 1));
    bootPairs = intercepts.map((iv, b) => ({ i: iv, s: slopes[b]! }));
  }

  // Is the printed range honest? The share of live protocols whose actual market cap falls
  // inside the model's P25-P75 and P10-P90 bands, measured on the same fit.
  let cover50 = 0;
  let cover80 = 0;
  for (let i = 0; i < lv.length; i++) {
    const r = lv[i]!.lnMcap - (value.intercept + value.ln_tvl * lv[i]!.lnTvl);
    if (q(0.25) <= r && r <= q(0.75)) cover50++;
    if (q(0.10) <= r && r <= q(0.90)) cover80++;
  }

  return {
    odds,
    odds_brier: brier,
    odds_brier_base: brierBase,
    odds_accuracy: accuracy,
    value,
    value_loo_r2: ablation[0]!.loo_r2,
    value_loo_r2_growth: ablation[1]!.loo_r2,
    value_loo_r2_age: ablation[2]!.loo_r2,
    value_resid_q25: q(0.25),
    value_resid_q75: q(0.75),
    odds_wf_brier: wfBrier / Math.max(1, testIdx.length),
    odds_wf_brier_base: wfBrierBase,
    band_cover_50: cover50 / lv.length,
    band_cover_80: cover80 / lv.length,
    odds_family_delta: familyKept ? wfFamMean - wfBrier / Math.max(1, testIdx.length) : null,
    family_count: families.length,
    odds_family_shifts: familyKept ? Object.fromEntries(families.map((c, i) => [c, shifts[i]!])) : {},
    value_ln_tvl_se: bootSe[1]!,
    value_intercept_se: bootSe[0]!,
    bootstrap: bootPairs,
    ablation,
    odds_ablation: oddsAblation,
    accounting,
    live_count: live.length,
    token_count: y.reduce((s, v) => s + v, 0),
    protocol_count: n,
  };
}

const medianOf = (list: number[]): number => {
  const s = list.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 365;
};

/** The model's own odds that a protocol records a token, from the fitted logistic. */
export function tokenOdds(p: SnapshotProtocol, asOf: string, fit: Fit, model: ModelConstants): number {
  const medAge = model.unknown_age_days;
  const age = (ageDays(asOf, p.listed_at) ?? medAge) / 365;
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0))) / 100;
  const shift = (fit.odds_family_shifts ?? {})[p.category ?? 'Other'] ?? 0;
  return sigmoid(fit.odds.intercept + fit.odds.ln_tvl * Math.log(Math.max(p.tvl_usd, 1)) + fit.odds.years * age + fit.odds.growth100 * growth + shift);
}

/** What the token would be worth if it launches: the fitted value curve, alone. */
export function valueIfLaunch(p: SnapshotProtocol, fit: Fit): number {
  return Math.exp(fit.value.intercept + fit.value.ln_tvl * Math.log(Math.max(p.tvl_usd, 1)));
}

/** The row the board ranks: value if it launches times the odds it does. */
export function impliedValue(p: SnapshotProtocol, asOf: string, fit: Fit, model: ModelConstants, protocols: SnapshotProtocol[] = []): { implied: number; odds: number; valueIf: number; p25: number; p75: number; parent: string | null } {
  const odds = tokenOdds(p, asOf, fit, model);
  const valueIf = valueIfLaunch(p, fit);
  const parent = protocols.length ? parentOf(p, protocols) : null;
  const discount = parent === null ? 1 : PARENT_DISCOUNT;
  const implied = Math.max(1, Math.round(valueIf * odds * discount));
  const p25 = Math.max(1, Math.round(Math.exp(Math.log(valueIf) + fit.value_resid_q25) * odds * discount));
  const p75 = Math.max(1, Math.round(Math.exp(Math.log(valueIf) + fit.value_resid_q75) * odds * discount));
  return { implied, odds, valueIf, p25, p75, parent };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Wrapped, staked or otherwise derivative naming: the product of an asset that already trades. */
const DERIVATIVE = /^(wrapped|staked|restaked|liquid\s+staked|boosted|compounding|staking\s+|fraxtal\s+staked|blaze\s?staked|liquid\s)/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The market's live names and symbols, normalised for matching against a derivative's name. */
function liveIndex(protocols: SnapshotProtocol[]): Set<string> {
  const out = new Set<string>();
  for (const p of protocols) {
    if (isPreToken(p)) continue;
    if (p.name) out.add(p.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (p.symbol) out.add(p.symbol.toLowerCase().replace(/[^a-z0-9]/g, ''));
  }
  return out;
}

/** Whether `name` is a wrapped or staked form of an asset that already trades: `wTOKEN`, `stTOKEN`, `Staked NAME`. */
function derivativeOfTraded(name: string, live: Set<string>): boolean {
  if (DERIVATIVE.test(name)) return true;
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const prefix of ['st', 'w', 'we', 'ste', 'a', 'c']) {
    if (flat.startsWith(prefix) && live.has(flat.slice(prefix.length))) return true;
  }
  return false;
}

/** The traded protocol whose name this protocol's name carries, if any: the parent that holds the token. */
export function parentOf(p: SnapshotProtocol, protocols: SnapshotProtocol[]): string | null {
  const flat = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (flat.length < 6) return null;
  let best: string | null = null;
  for (const q of protocols) {
    if (q.slug === p.slug || !recordsToken(q)) continue;
    const other = q.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (other.length >= 5 && flat.includes(other) && flat !== other) {
      if (best === null || other.length > best.length) best = q.name;
    }
  }
  return best;
}

/** The parent haircut: a child of a token-holding parent gets half the implied value — the parent holds the claim, not the child. */
export const PARENT_DISCOUNT = 0.5;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped or staked product of one that trades. */
export function isRankable(p: SnapshotProtocol, live: Set<string> = new Set()): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !derivativeOfTraded(p.name, live);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const live = liveIndex(snapshot.protocols);
  const fit = fitModel(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p, live) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const { implied, odds, valueIf, p25, p75, parent } = impliedValue(p, snapshot.as_of, fit, model, snapshot.protocols);
    const farm = farmEconomics(p, implied, model);
    return { p, implied, odds, valueIf, p25, p75, age, farm, parent };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // The rank range under fit uncertainty: each bootstrap refit re-prices every row (odds fixed),
  // the row is re-ranked under it, and the P10-P90 of its ranks is the range shown.
  const boot = fit.bootstrap.length ? fit.bootstrap : [{ i: valueBeta0, s: valueBeta1 }];
  const rankSpread = scored.map(() => ({ p10: 0, p90: 0 }));
  for (const r of rankSpread) Object.assign(r, { p10: 0, p90: 0 });
  {
    const nBoot = Math.min(60, boot.length); // 60 refits suffice for a P10-P90 and keep the run fast
    const allRanks: number[][] = scored.map(() => []);
    for (let b = 0; b < nBoot; b++) {
      const priced = scored.map((s) => Math.exp(boot[b]!.i + boot[b]!.s * Math.log(Math.max(s.p.tvl_usd, 1))) * s.odds);
      const order = priced.map((v, i) => ({ v, i })).sort((a, c) => c.v - a.v || a.i - c.i);
      order.forEach((o, position) => { allRanks[o.i]!.push(position + 1); });
    }
    scored.forEach((_, i) => {
      const rs = allRanks[i]!.slice().sort((a, c) => a - c);
      rankSpread[i] = { p10: rs[Math.floor(nBoot * 0.1)]!, p90: rs[Math.min(nBoot - 1, Math.ceil(nBoot * 0.9))]! };
    });
  }
  const valueBeta0 = fit.value.intercept;
  const valueBeta1 = fit.value.ln_tvl;
  return scored.map((s, i) => ({
    rank: i + 1,
    rank_lo: rankSpread[i]!.p10,
    rank_hi: rankSpread[i]!.p90,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      odds: round4(s.odds),
      value_if_launch_usd: s.valueIf,
      p25_usd: s.p25,
      p75_usd: s.p75,
      age_days: s.age,
    },
    farm: s.farm,
    parent: s.parent,
    farm_steps: farmSteps(s.p, s.age, s.farm).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * The farming scenario's economics for one row: deposit size, expected drop, fees, net.
 */
export interface FarmEconomics {
  verdict: 'farm' | 'marginal' | 'skip';
  deposit_usd: number;
  net_usd: number;
  net_per_hour: number;
  drop_usd: number;
}

/** Expected drop value for a depositor: drop share of the implied value times the deposit's share of TVL. */
export function farmEconomics(p: SnapshotProtocol, implied: number, model: ModelConstants): FarmEconomics {
  const deposit = Math.min(50000, Math.max(500, Math.round(p.tvl_usd * 0.02)));
  const drop = model.drop_share * implied * (deposit / Math.max(p.tvl_usd, 1));
  const fees = model.gas_usd * 2 + deposit * 0.001 + deposit * 0.05 * (model.horizon_weeks / 52);
  const net = drop - fees;
  const netPerHour = net / model.hours_spent;
  const verdict = net >= model.farm_min_usd && netPerHour >= model.farm_min_per_hour ? 'farm' : net > 0 ? 'marginal' : 'skip';
  return { verdict, deposit_usd: deposit, net_usd: Math.round(net * 100) / 100, net_per_hour: Math.round(netPerHour * 100) / 100, drop_usd: Math.round(drop * 100) / 100 };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farm: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const capital = farm.deposit_usd;
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, early: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    odds: row.model.odds,
    value_if_launch_usd: row.model.value_if_launch_usd,
    p25_usd: row.model.p25_usd,
    p75_usd: row.model.p75_usd,
    verdict: row.farm.verdict,
    net_usd: row.farm.net_usd,
    net_per_hour: row.farm.net_per_hour,
    parent: row.parent,
    early,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const fit = fitModel(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    fit,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, !snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
