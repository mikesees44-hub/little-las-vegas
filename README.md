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

## The dynasty layer (CK dynasty, family and activities)

`familyState.ts` holds `GameState.dyn` (optional, so old saves load): houses, alliances, renown and legacies, per-person
dynasty data, the hosted activity and decisions. It rolls on its own seeded stream (`dyn.rng`) so it does not reshuffle
the main simulation's dice.

| File | What it does |
|---|---|
| `family.ts` | Hub: setup (`initDynasty`), weekly/monthly ticks, dynasty orders (`{ kind: 'dynasty' }`), effect ops (`{ type: 'dyn' }`), stress from the boss's choices |
| `familyHouses.ts` | Twelve houses (rival crews, Philadelphia families, political and legitimate Wildwood families) with real members; alliances: no strikes from an allied crew, allies add war score, Table votes lean your way |
| `familyMarriage.ts` | Arranged marriages with acceptance odds and reasons, dowries, matrilineal matches |
| `familyTraits.ts` | Congenital traits inherited from both parents, childhood temperament, education by a guardian (priest, capo, Penn, the Army), coming of age at 16, life paths and goals |
| `familyLegacy.ts` | Renown from deeds and four Dynasty Legacy tracks (Blood, Name, Money, Church & City Hall), 4 perks each, kept through every succession |
| `familyStress.ts` | Stress 0-100 from four sources (IRS, paranoia, honor, home), breaking points at 33/66/100 with coping habits |
| `familyDrama.ts` | Family events driven by character state with cooldowns (affairs, the money in the cellar, a wife who could flip, a bastard's claim, sibling rivalry, the black sheep, a cousin in the Feds' sights, in-law feuds, an heir who wants out), match proposals, claims after a succession |
| `activities.ts` | Hosted activities: wedding, christening, wake, Sunday dinner, clambake, the 500 Club, a fishing trip off Cape May; 1-3 outcome events each |
| `decisions.ts` | CK Decisions with requirement progress (Boss of the Shore, City Hall, bank, Florida, legit, festival, monument, break from Philadelphia, casino) |

Family events reach the week through `registerEventSource` in `events.ts` (one candidate a week, still capped at 4 popups).

## The economy & property layer (wave 2)

`econState.ts` holds `GameState.econ` (optional, so old saves load): racket books, upgrade tiers, the lots of every district,
managers and club staff, the headquarters, gifts, season tickets and community projects. It rolls on its own seeded stream
(`econ.rng`). Orders are `{ kind: 'econ', op }`, effect ops `{ type: 'econ', op }`; one event candidate a week goes through the
shared popup pipeline (`registerEventSource`).

| File | What it does |
|---|---|
| `econ.ts` | Hub: hooks into the old economy (expected take, the week of a business, wash capacity), weekly/monthly ticks, orders, effect ops, the popup candidate, the random player's suggestions |
| `rackets.ts` | Racket books (bookmaking handle/hold/markers/raids, numbers runners/bank/hit number, cargo dock contacts, vending placements/competition) and 3–4 step upgrade trees |
| `property.ts` | ~80 property uses (item 12 catalog, 1960 dollars), 11 zones incl. Atlantic City and South Philly, seasonal demand by district, lots, construction stages (purchase → permits → site prep → foundation → framing → exterior → interior → open) |
| `managers.ts` | Managers (family, crew, pros): skill, loyalty, hidden honesty, salary, share, oversight; skims and audits; adult kids as assistants; club rosters whose people move on |
| `scores.ts` | Big scores with kick-up and credit disputes (uses the capo's contract), the monthly "short or skimming?" envelope |
| `hq.ts` | Headquarters (social club, back of a restaurant, car, walk-and-talks), federal bugs (technician/warrant/informant) that add to each talker's evidence, sweeps |
| `gifts.ts` | ~130 period gifts, tastes and the opinion math, season tickets (inheritable), community projects (appreciation vs trust), leverage gifts with acceptance odds |

## Variety: the story director and living storylines

| File | What it does |
|---|---|
| `storyDirector.ts` | One novelty layer over every source in the popup pipeline: a 60-week memory of templates and themes, a per-template global cooldown (10 weeks) and yearly cap (5), freshness-weighted picks for every source (unseen first), a weekly theme mix (crew / family / romance / rivals / law / town / business / chain / world), at most 2 seats per theme a week. Warnings about one man (courted, drifting, a grievance) come back sooner. The bagman comes in person every other month (or when Philadelphia is unhappy), with varied scenes; the other months the envelope goes through the drop (a tribute line in the ledger) |
| `crewVariants.ts` | 31 more crew decisions (pitches: a card game, a hijack tip, a crooked inspector, a jukebox war, a contractor in trouble, a horse that can't lose, a bookie skimming his own sheet, a rival soldier switching sides, a widow; scores, brawls, sponsors, disputes, life, kids, the law, wives, offers from out of town), resolved later through `cv_outcome`. `crew_score` comes in six shapes |
| `storyData2*.ts` | Content pack 2 (137 events, 34 chains: the women, kin, show business, the world), `costScale` 0.4 |
| `storyData3*.ts` | Content pack 3 (57 events, 12 short chains: a $14 sandwich, the waiter, the Coupe de Ville, Famous, the anniversary, the toast, forty years, the wrong wife, the marker, the world pack's show people, world beats 1960-74) |
| `livingStories.ts` / `livingStoryData.ts` | Eleven slow-burn storylines (months to years) bound to existing people; stages advance with the clock or the boss's answer; one beat a week through the pipeline; `GameState.arcs`; the Storylines tab under Chronicle shows active arcs, cast and history (never hidden truths) |

`npx tsx scripts/variety.ts --games 30 --weeks 52` reports distinct templates, the 8- and 26-week repeat rates, the most repeated templates, the theme mix and the money flows.

## UI

Single-page dashboard (`src/ui`): header with date, season countdown, treasury, respect and the three heat bars;
Advance Week / Advance Month; an event modal with choice buttons and effect chips; a weekly report modal showing
every line of "why it changed"; tabs for the island (districts, rivals, rackets), crew (traits, opinion breakdown),
family tree (with succession law and heir preview) and the chronicle. Saves automatically to `localStorage`.

## The story layer (content packs and romance)

| File | What it does |
|---|---|
| `storyData*.ts` | Content pack 1 copied verbatim (162 events, 21 chains) in its neutral schema (`storyDataSchema.ts`; the `then` helper is renamed `thenFx` because a module exporting `then` is a thenable) |
| `storyPacks.ts` | The registry: one entry per pack, merged into one table (colliding ids are namespaced `<pack>:<id>`, followups rewritten); each pack has a random-pool weight and a 52-week budget |
| `storyPack.ts` | The adapter: triggers, casting (crew, family, rival boss/men, officials, townies created and reused, world-pack people by `worldId` when the population is present), placeholders, rival-boss names swapped for successors, Fx to engine Effects, chain followups as `pack:<event>` consequences. One candidate a week through `registerEventSource`: a due chain part, else a dated history beat, else (sometimes) a random event; chain parts and mandatory beats outrank crew decisions, random ones rank below them |
| `romance.ts` | Orientation (fixed at birth), attraction, consent rolls with reasons, NPC courtships/lovers/affairs/marriages/endings, advances toward the boss, exposure and discovery, pregnancies with hidden paternity (`Character.bioFatherId`; portraits follow the real father), the boss's choice about his children, the truth coming out, separation and rare divorce |
| `storyOps.ts` | The `storyOp` effect (secrets, romance changes, paternity decisions) |
| `storyState.ts` | `GameState.story` and `GameState.romance` (optional; each on its own seeded stream) |

To add a content pack: copy its files into flat `src/engine/storyData<Name>*.ts` and add one entry to `STORY_PACKS`.
To cast world-pack people, the population layer calls `registerWorldMaterializer((s, worldId) => Character | undefined)`.
