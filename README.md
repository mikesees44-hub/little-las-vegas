# Little Las Vegas

A Crusader Kings–style mob dynasty game set in Wildwood, New Jersey — "Little Las Vegas" — starting Memorial Day 1960.
You run a crew on the island and pay tribute to Philadelphia. Rivals push in from Atlantic City, New York money buys
into the boardwalk, North Wildwood stays independent, and the County Prosecutor wants a headline.

This is the **foundation pass**: a tested simulation engine, a headless balance simulator, and a minimal dashboard UI.

## Running it

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest unit tests (engine + architecture + UI smoke render)
npm run sim        # headless simulator: 200 games x 10 years
npm run build      # typecheck + production build
```

Simulator options:

```bash
npm run sim -- --games 50 --years 5 --seed mytest
npm run sim -- --stress 52             # force-kill the boss every 52 weeks to stress succession
npm run sim -- --json sim-report.json  # also write a JSON summary
```

The simulator exits non-zero if any target fails (crashes, unexplained deltas, year-1 bankruptcy >= 15%,
median year-3 treasury outside $50K–$500K, invalid successions, popup cap exceeded).

## Architecture

```
src/engine/   pure TypeScript simulation — no React, no DOM, no browser APIs
src/ui/       React + Tailwind dashboard — reads state, dispatches choices
scripts/      headless simulator (npm run sim)
tests/        Vitest suites
```

**Rules the engine follows**

- **State is a plain serializable object** (`GameState` in `src/engine/types.ts`). No classes, no Dates, no functions.
  It goes straight into `localStorage` and round-trips through JSON exactly (there is a test for that).
- **Seeded PRNG.** `state.seed` + `state.rng` (mulberry32 state). Every random roll goes through `src/engine/rng.ts`
  against the state, so a seed + the same choices always reproduces the same game.
- **`advanceWeek(state, playerChoices)` is pure**: it deep-clones the input, mutates only the clone, and returns
  `{ state, report, log }`. `advanceMonth` loops it until the month changes. `newGame(seed)` builds a fresh state.
- **One ledger.** Every change to money, respect or any heat bar goes through `ledger.post()` with a label and a
  category. The line records the amount *actually applied* after clamping. `advanceWeek` reconciles the report
  (sum of lines == real delta for money, respect and each heat bar) and throws if it ever doesn't match; the test
  suite and simulator check it independently.
- **One death function.** `killCharacter()` in `dynasty.ts` is used by natural death, rival hits, executions and
  stress tests. It records the death, queues a funeral event, writes dynasty history, spreads grief/grievance,
  refills vacated capo seats and — if the player died — applies the succession law and switches to the heir.

**Week order** (`engine.ts`): resolve the player's choices → fire due consequences → economy ledger → rival AI →
operational heat, 80+ heat consequences, heat decay → housekeeping (releases, reputation drift) → calendar →
monthly tick (aging/health/death, births, marriages, opinion decay, desertions, rival successions) →
generate next week's events (max 4 popups: the bagman, queued scenes, 1–2 decisions brought by the crew, sometimes a situational event). General orders (the old sit-down) are given from the Crew/Administration tabs, directly (fast, adds to the boss's evidence file) or through the underboss or a capo (a week later, insulated, may be changed or ignored).

**Modules**

| File | What it does |
|---|---|
| `calendar.ts` | Dates, Memorial Day (fixed May 30 before 1971) / Labor Day, the Season (x2.5) vs off-season (x0.4), countdowns |
| `characters.ts` | Character generation (Italian/Irish/Jewish name pools, unique crew nicknames), traits, attributes, health, death odds |
| `relations.ts` | Directed relations: opinion = clamped sum of named modifiers with monthly decay; fear/trust/grievance meters |
| `ledger.ts` | The single ledger, reconciliation, capped rival hits |
| `economy.ts` | Street take, businesses, capo kick-ups (trait-driven variance + skimming), wages/upkeep/payoffs, debts |
| `heat.ts` | Local/family/federal heat, decay (faster when quiet and when high), RAID / ARREST / SEIZED consequences at 80+ |
| `dynasty.ts` | Succession laws (blood / appointed / capos elect / underboss), the death function, births, marriages |
| `rivals.ts` | Rival AI: score (move, target) by goal x personality x memory x risk; weighted pick; visible named results |
| `events.ts` | Event defs (condition, weight, cooldown), bagman, sit-down (3 orders, no repeats), skimming, favor, recruit, Sunday dinner |
| `effects.ts` | Data-driven choice effects (displayed as chips before you choose) and how they apply |
| `consequences.ts` | Delayed consequences 1–8 weeks later, labelled "Because you … (wk N)" in the report and chronicle |
| `hierarchy.ts` | The family tree: regimes (capo → soldiers → associates → outside guys), two loyalties (to the capo, to the boss), bios (craft, goal, vices, wife and kids, personal chronicle), integrity check, chain-of-command odds |
| `regimes.ts` | Capos acting on their own each week (expand, skim, take the heat, start beefs, recruit, extra envelopes), plants leaking, courtships and shylock debts, Philadelphia's membership books, defections that take a capo's loyal men |
| `crewEvents.ts` | Crew-driven decisions (proposals, requests, disputes, problems, weddings, christenings, sons, retirements, the making ceremony) with per-event and per-man cooldowns — they replace the weekly sit-down |
| `crewConsequences.ts` | Their delayed outcomes: crew jobs, stand-up vs flip, delegated orders carried out, distorted or ignored, factions going to Philadelphia |
| `rivalcrew.ts` | Rivals moving on your people every 2–4 weeks: poaching, corners, buying your cops, offers to your capos, plants |
| `newGame.ts` | Seeded start: the house (spouse w/ maiden name, kids, parents, siblings), ~11 crew, districts, rivals, a starting problem |

**Rival caps.** Money a rival takes from you in a week is capped at 25% of that week's gross earnings in year 1
(35% afterwards); rival-caused heat is capped per bar per week (5 in year 1, 8 after). Capped hits still show as named lines.

**Bankruptcy** isn't a game-over; being in the red costs respect and crew loyalty. The simulator counts a game as
"bankrupt" when the treasury stays below $0 for 8+ consecutive weeks. The only game over is a house with no eligible heir.

## UI

Single-page dashboard (`src/ui`): header with date, season countdown, treasury, respect and the three heat bars;
Advance Week / Advance Month; an event modal with choice buttons and effect chips; a weekly report modal showing
every line of "why it changed"; tabs for the island (districts, rivals, rackets), crew (traits, opinion breakdown),
family tree (with succession law and heir preview) and the chronicle. Saves automatically to `localStorage`.
