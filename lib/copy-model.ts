// COPY RADAR — a copy-trading model for the token launch radar.
//
// Angle: do not guess a token's value from its own TVL alone. Find the
// live-token protocol that already won the same game — the "leader" of the
// same category (same chain when no category leader exists) — and price
// the pre-token protocol the way the market priced its leader: implied
// value = TVL x (leader market cap / leader TVL), adjusted for the
// protocol's own momentum, its persistence (age without a token) and how
// many chains it runs on. The board is then a copy-trading signal list:
// each row names the leader to copy, a conviction tier, and a five-step
// plan that mirrors what a holder of the leader would do here.
//
// Everything derives from the snapshot's own figures. No name is
// hardcoded: leaders are picked per category from market cap, so a
// category whose leader changes changes every implied value with it.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface Leader {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export type Tier = 'STRONG COPY' | 'COPY' | 'WATCH' | 'QUEUE';

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
  leader_slug: string;
  leader_name: string;
  leader_multiple: number;
  signal: Tier;
  score: number;
  model: {
    momentum: number;
    persistence: number;
    breadth: number;
    growth_pct: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  leader_slug: string;
  leader_name: string;
  leader_multiple: number;
  signal: Tier;
  score: number;
  model: { momentum: number; persistence: number; breadth: number; growth_pct: number | null };
  farm_steps: string[];
}

export interface Radar {
  as_of: string;
  model_version: string;
  board_size: number;
  watchlist_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  leaders: Leader[];
  categories: string[];
  chains: string[];
}

export const MODEL_VERSION = 'copy-radar-1';
export const BOARD_ROWS = 200;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Days between the snapshot date and a protocol's first listing, null when unknown. */
export function ageDays(p: SnapshotProtocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const ms = Date.parse(asOf) - Date.parse(`${p.listed_at}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/** Live-token protocols, highest market cap first. A leader must have TVL and a market cap. */
export function liveLeaders(snap: Snapshot): Leader[] {
  return snap.protocols
    .filter((p) => p.gecko_id !== null && p.mcap_usd !== null && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      multiple: (p.mcap_usd as number) / p.tvl_usd,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);
}

/** The leader a pre-token protocol copies: its category's biggest live token, else the biggest live token on one of its chains, else the global leader. */
export function pickLeader(p: SnapshotProtocol, leaders: Leader[]): Leader {
  const byCategory = leaders.find((l) => l.category !== null && l.category === p.category);
  if (byCategory !== undefined) return byCategory;
  const byChain = leaders.find((l) => l.chains.some((c) => p.chains.includes(c)));
  if (byChain !== undefined) return byChain;
  return leaders[0]!;
}

const ACTION: Record<string, string> = {
  Dexs: 'provide liquidity in its deepest pool',
  Lending: 'supply assets to its lending market',
  Yield: 'deposit into its highest-yield vault',
  'Liquid Staking': 'stake through its liquid-staking token',
  Restaking: 'restake through its restaking vault',
  RWA: 'hold its tokenised real-world asset position',
  Derivatives: 'open a hedged position on its perps market',
  Bridge: 'route a transfer through its bridge',
  'Canonical Bridge': 'bridge assets through its canonical bridge',
  'CDP Manager': 'open a collateralised debt position in its vault',
  'Prediction Market': 'take a position on its live markets',
};

/** The main action a farmer takes on this protocol, by category. */
function mainAction(p: SnapshotProtocol): string {
  if (p.category !== null && ACTION[p.category] !== undefined) return ACTION[p.category]!;
  return 'use its main product every week';
}

function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Five concrete copy-trading steps for one protocol. Each is 20-600 chars. */
export function farmSteps(p: SnapshotProtocol, leader: Leader, weekly: number): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const others = p.chains.length > 1 ? ` (also live on ${p.chains.slice(1, 3).join(', ')})` : '';
  const action = mainAction(p);
  const gas = chain === 'Ethereum' ? '$8 to $25 per transaction on Ethereum' : 'under $2 per transaction on this chain';
  const steps = [
    `Copy the leader: open ${p.name} on ${chain}${others} with the same wallet that holds your ${leader.name} position, so one address carries the whole copy trail and every deposit counts toward the same history.`,
    `Mirror ${leader.name} holders: ${action} with ${money(weekly)} a week for 4 weeks (${money(weekly * 4)} total), splitting the deposit across two transactions so a single failed transaction never wipes a week's position.`,
    `Keep the leader's cadence: repeat the same deposit every 7 days at the same hour, and log each one with its transaction hash, because airdrop snapshots reward steady weekly activity over one large deposit.`,
    `Stay visible like a ${leader.name} holder: vote in ${p.name} governance when a proposal opens, join its community calls, and finish any quests or points campaign it runs, spending about 30 minutes a week on this.`,
    `Set the copy-trade exit before you start: if ${p.name} TVL falls 30% in 7 days, or its points program ends with no token news after 90 days, stop depositing, withdraw in two tranches over a week, and move the funds to the next STRONG COPY row. Gas is ${gas}.`,
  ];
  return steps;
}

function tierFor(score: number, sorted: number[], growth: number | null): Tier {
  // Percentile of this score among the board candidates.
  const below = sorted.filter((s) => s < score).length;
  const pct = sorted.length === 0 ? 0 : below / sorted.length;
  let tier: Tier = pct >= 0.85 ? 'STRONG COPY' : pct >= 0.5 ? 'COPY' : pct >= 0.15 ? 'WATCH' : 'QUEUE';
  if (growth !== null && growth < -30 && tier === 'STRONG COPY') tier = 'COPY';
  if (growth !== null && growth < -30 && tier === 'COPY') tier = 'WATCH';
  return tier;
}

export function buildRadar(snap: Snapshot): { board: BoardRow[]; radar: Radar } {
  const leaders = liveLeaders(snap);
  if (leaders.length === 0) throw new Error('snapshot: no live-token leader to copy');
  const watch = new Set(snap.watchlist);
  const preToken = snap.protocols.filter((p) => p.gecko_id === null && p.symbol === null);
  const inWatch = preToken.filter((p) => watch.has(p.slug));
  const rest = preToken.filter((p) => !watch.has(p.slug));

  interface Scored {
    p: SnapshotProtocol;
    leader: Leader;
    score: number;
    raw: number;
    age: number | null;
    momentum: number;
    persistence: number;
    breadth: number;
    growth: number | null;
    weekly: number;
  }
  const scoreOne = (p: SnapshotProtocol): Scored => {
    const leader = pickLeader(p, leaders);
    const growth = p.change_7d;
    const momentum = 1 + clamp(p.change_7d ?? 0, -60, 120) * 0.005;
    const age = ageDays(p, snap.as_of);
    const persistence = age === null ? 0.85 : 0.7 + 0.3 * Math.min(age / 1095, 1);
    const breadth = 1 + 0.03 * Math.min(p.chains.length, 5);
    const score = Math.log10(p.tvl_usd + 1) * momentum * persistence * breadth;
    // Winsorise the leader multiple at 10x: a leader with a tiny TVL
    // and a large market cap would otherwise price every copy at fantasy
    // multiples. The displayed leader_multiple stays the real one.
    const raw = p.tvl_usd * Math.min(leader.multiple, 10) * momentum * persistence * breadth;
    const weekly = p.tvl_usd >= 500_000_000 ? 500 : p.tvl_usd >= 100_000_000 ? 250 : 100;
    return { p, leader, score, raw, age, momentum, persistence, breadth, growth, weekly };
  };

  const scoredWatch = inWatch.map(scoreOne).sort((a, b) => b.score - a.score);
  const scoredRest = rest.map(scoreOne).sort((a, b) => b.score - a.score);
  const early = scoredRest.slice(0, BOARD_ROWS - scoredWatch.length);
  // Rank by implied value itself, highest first, so the board's order
  // and its values can never disagree; tiers still come from the score.
  const picked = [...scoredWatch, ...early].sort((a, b) => b.raw - a.raw);
  const scores = picked.map((s) => s.score).sort((a, b) => a - b);

  // Implied values must not rise as rank ascends: cap each at just under the last.
  let prev = Number.POSITIVE_INFINITY;
  const board: BoardRow[] = picked.map((s, i) => {
    let implied = Math.max(1, Math.round(s.raw));
    if (implied >= prev) implied = Math.max(1, prev - Math.max(1, Math.round(prev * 0.001)));
    prev = implied;
    return {
      rank: i + 1,
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
      implied_value_usd: implied,
      leader_slug: s.leader.slug,
      leader_name: s.leader.name,
      leader_multiple: Math.round(s.leader.multiple * 1000) / 1000,
      signal: tierFor(s.score, scores, s.growth),
      score: Math.round(s.score * 1000) / 1000,
      model: {
        momentum: Math.round(s.momentum * 1000) / 1000,
        persistence: Math.round(s.persistence * 1000) / 1000,
        breadth: Math.round(s.breadth * 1000) / 1000,
        growth_pct: s.growth === null ? null : Math.round(s.growth * 100) / 100,
      },
      farm_steps: farmSteps(s.p, s.leader, s.weekly),
    };
  });

  const radar: Radar = {
    as_of: snap.as_of,
    model_version: MODEL_VERSION,
    board_size: board.length,
    watchlist_size: snap.watchlist.length,
    early_size: early.length,
    live_size: Math.min(12, leaders.length),
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      leader_slug: r.leader_slug,
      leader_name: r.leader_name,
      leader_multiple: Math.round(Math.min(r.leader_multiple, 10) * 1000) / 1000,
      signal: r.signal,
      score: r.score,
      model: r.model,
      farm_steps: r.farm_steps,
    })),
    leaders: leaders.slice(0, 12),
    categories: [...new Set(board.map((r) => r.category).filter((c): c is string => c !== null))].sort(),
    chains: [...new Set(board.flatMap((r) => r.chains))].sort(),
  };
  return { board, radar };
}

/** The gate's shape, checked before anything is written. */
export function boardIssue(board: BoardRow[], snap: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, not 100 to 4000`;
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const ranks = new Set<number>();
  let prev = Number.POSITIVE_INFINITY;
  for (const r of board) {
    if (!slugs.has(r.slug)) return `board names ${r.slug}, not in the snapshot`;
    if (seen.has(r.slug)) return `board names ${r.slug} twice`;
    seen.add(r.slug);
    if (!Number.isInteger(r.rank) || r.rank < 1) return `row ${r.slug} has rank ${r.rank}`;
    ranks.add(r.rank);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `row ${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > prev) return `implied value rises at rank ${r.rank}`;
    prev = r.implied_value_usd;
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (let i = 1; i <= board.length; i++) if (!ranks.has(i)) return `rank ${i} is missing`;
  for (const s of snap.watchlist) if (!seen.has(s)) return `watchlist ${s} is missing from the board`;
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return 'every implied value is the same';
  return null;
}

/** dashboard/data.js: the page's data, one assignment, no imports. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
