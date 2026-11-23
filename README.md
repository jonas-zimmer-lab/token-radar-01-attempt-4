# COPY RADAR — Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Trade the flow, not the hype. COPY RADAR prices every pre-token protocol
the way the market already priced its leader: the biggest live-token
protocol in the same category. A protocol's implied value is its TVL
times its leader's market-cap-to-TVL multiple, adjusted for its own
7-day momentum, its persistence (how long it has run with no token) and
how many chains it runs on. No name is hardcoded — leaders are picked
from market cap, so the whole board reprices when a category's leader
changes.

## The model (`lib/copy-model.ts`, `copy-radar-1`)

- **Leader:** per category, the live-token protocol with the highest
  market cap; if a category has no live token, the biggest live token
  on one of the protocol's chains; else the global leader.
- **Implied value:** `TVL × (leader mcap / leader TVL, winsorised at
  10×) × momentum × persistence × breadth`, where momentum is `1 +
  clamp(change_7d in percent, −60, +120) × 0.005`, persistence rises with age without a token
  (0.70 at listing → 1.00 after 3 years, 0.85 when unlisted), and
  breadth is `1 + 0.03 × chains` (capped at 5 chains).
- **Signal tiers:** by score percentile across the board — top 15%
  STRONG COPY, next 35% COPY, next 35% WATCH, rest QUEUE; a protocol
  down more than 30% in 7 days is downgraded one tier.
- **Board:** 200 rows — all 40 watchlist protocols plus the 160
  highest-scoring other pre-token protocols by TVL. Every row carries
  a five-step farm plan that mirrors what a holder of its leader
  would do: same wallet, weekly deposits with real amounts, a
  governance/visibility step, and a written exit rule.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot,
writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/`
into the output directory, and writes `dossier.json` with the vendored
make.fun library (`vendor/makefun-board.ts`). Open
`out/dashboard/index.html` to use the board: search, filter by category,
chain or signal, sort, and click any row for its detail view and farm plan.

## Screenshots

- `1-board.png` — the full ranked board
- `2-detail.png` — one protocol's detail view with its farm plan
- `3-filtered.png` — the board filtered to STRONG COPY signals

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
