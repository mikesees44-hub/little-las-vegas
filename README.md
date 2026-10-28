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
| `construction.ts` | Permits (pluggable authority + per-lot verdicts from politics), inspections and stop-work orders, the supply chain's cut of others' builds, the town's own construction month by month, city bids |
| `deals.ts` | **The Deal**: every purchase is a contract with a named seller from the world pack (realtor/bank for property, fence/fixer/numbers banker for rackets). Haggling (odds with reasons, decided by seed + place + month so the window can show it), cash under the table (cheaper, spends dirty money, federal heat), who runs it, a name and a look. One order `{ type: 'deal' }`; `autoDeal` is the sim's version |
| `applicants.ts` | Who runs a place: family incl. in-laws (18+ only; teens can only help out summers), crew, hired locals; the people who *ask* (pitch, motive), each with time and energy — a busy or worn-out manager brings `effort` × his skill |
| `design.ts` | A place's name, style (Doo Wop, Deco, Tiki, Colonial, Mid-century, Victorian: tourist draw) and neon color, keyed like managers (`econ.designs`); hooks for key staff and, later, Building → Floor → Space |
| `goodlife.ts` | **The Good Life**: homes, cars, trucks, a boat, toys at period prices; respect, family opinion, stress relief, upkeep, resale; unexplained-wealth federal heat, rivals notice, RICO forfeiture from Oct 1970; the house owns it, so the heir inherits |

## The Empire Designer (wave 2)

Every motel, rooming house, hotel, restaurant, bar and nightclub the family (or a rival) runs is one reusable system.
A Deal that signs for one opens the Designer (Holdings → Empire Designer, the building on the map, or the Deal's
"Set it up" button). A new owner is done in under a minute: name, look (Doo Wop is Wildwood's own), Owner mode,
"Open for business". Every tab goes deeper, down to the toilet paper. `GameState.empire` (optional; old saves migrate
the first week: the scan builds records for the places you already own). Own seeded stream (`empire.rng`).

| File | What it does |
|---|---|
| `empireState.ts` | Module 16's records, linked by id: Property (lot, zoning, permitted uses, value, debts, history) → Building (style, neon, condition, stories, sprinklers/elevator/ramps, every look it has had) → Floor → Space (room blocks, dining room, lounge, club, pool…); Venue (the business unit: concept, policy, inventory, durables, departments, staff, reputation, monthly/yearly statements, proposals); Department; Employment; SupplierContract; Project; OperatingPolicy; OperatingPreset |
| `empireData.ts` | Concepts (budget motel, hourly-stay motel, rooming house, boutique hotel, luxury resort, restaurant, bar, nightclub), departments (the club's head is the **booking manager**), space types, guest segments (families, the young crowd, couples, business, high rollers, short stays, summer workers), suppliers |
| `empireCatalog.ts` | The data-driven purchasing catalog (~100 rows: mattresses to toilet paper to stage lighting): price, quality, life (weeks or washes), workload, power, years on the market (Module 13), expectations that rise with the years |
| `empireBuild.ts` | Layouts (rooms over floors, services on the ground floor), area and zoning checks, period codes (sprinklers and elevators above 3 stories, ramps from 1973), fit-out |
| `empireStaff.ts` | Workload by department, staffing targets, persistent workers (wage, skill, satisfaction, ambition), family/crew heads, promotion |
| `empireOps.ts` | The operating engine: the season curve, a logit market where every simulated venue (yours and rivals') and the rest of the island compete by price, quality, reputation, style, amenities and neighborhood; covers, drinks, club guests; inventory use, deliveries, reorders and shortages; linen wear by washing; durable wear and replacement; deterioration and breakdowns; the operating statement |
| `empireProjects.ts` | 28 projects: cosmetic, furniture, equipment, remodels, wings and floors, amenities, structural, energy, access, technology, fire safety, conversions (budget ↔ hourly, boutique, resort). Prerequisites, cost paid weekly, weeks, rooms out of service, real effects on the records |
| `empireAI.ts` | Delegation: Owner (default), Manager, Micromanage; presets (built-in and saved); the manager's week (prices toward the occupancy target, seasonal hiring and layoffs, purchasing at the tier, proposals, small jobs on his own), gripes and resignation |
| `empireActs.ts` | HOOK for the act-booking phase: the booking manager's skill sets the tier of act he can land; the month's act (world-pack entertainers: fee, draw) and his 10% cut |
| `empire.ts` | The hub: venue creation and migration, rivals (the town's motels and rooming houses; new ones as they open; spin-offs by your ambitious ex-heads), ledger posting, projects, staff months, rival bankruptcies, the map sync, commands (`EmpireCmd`), the random player's orders |

**Money.** Configuration commands never move money: `applyEmpireCmd(s, cmd)` (UI, immediate, a copy) and the order
`{ kind: 'econ', op: { type: 'empire', cmd } }` (sim) only change records. Each week a player venue posts by name:
its takings (the business line), payroll, supplies & linen, operating costs (utilities, upkeep, taxes, insurance,
licenses, office & commissions, ads, the act), replacements and projects as capital, the manager's share. A venue's
business has `upkeep` 0 (its statement covers it) and `expectedTake` returns its last operating income.
**Hooks:** `econBusiness` (economy) → `venueBusiness`; `expectedTake` → `venueTake`; `econWeek` → `empireWeek`;
`venue.policy.network` is the later Madam/Ears phase's abstract ledger line + vice heat; `venue.policy.act` the
booking phase's act record.

`npx tsx scripts/empireAcceptance.ts` runs Module 17 (adapted): a lot on Ocean Avenue bought in 1965 and developed as
a 20-room economy motel, a 40-room boutique hotel with a restaurant, and a 100-room resort, each five years on the
real engine (`tests/empire.test.ts` asserts it).

## Variety: the story director and living storylines

| File | What it does |
|---|---|
| `storyDirector.ts` | One novelty layer over every source in the popup pipeline: a 60-week memory of templates and themes, a per-template global cooldown (10 weeks) and yearly cap (5), freshness-weighted picks for every source (unseen first), a weekly theme mix (crew / family / romance / rivals / law / town / business / chain / world), at most 2 seats per theme a week. Warnings about one man (courted, drifting, a grievance) come back sooner. The bagman comes in person about once a season (or when Philadelphia is unhappy), never in the same scene twice; the other months the envelope goes through the drop (a tribute line in the ledger) |
| `crewVariants.ts` | 31 more crew decisions (pitches: a card game, a hijack tip, a crooked inspector, a jukebox war, a contractor in trouble, a horse that can't lose, a bookie skimming his own sheet, a rival soldier switching sides, a widow; scores, brawls, sponsors, disputes, life, kids, the law, wives, offers from out of town), resolved later through `cv_outcome`. `crew_score` comes in six shapes |
| `storyData2*.ts` | Content pack 2 (137 events, 34 chains: the women, kin, show business, the world), `costScale` 0.4 |
| `storyData3*.ts` | Content pack 3 (57 events, 12 short chains: a $14 sandwich, the waiter, the Coupe de Ville, Famous, the anniversary, the toast, forty years, the wrong wife, the marker, the world pack's show people, world beats 1960-74) |
| `livingStories.ts` / `livingStoryData.ts` | Eleven slow-burn storylines (months to years) bound to existing people; stages advance with the clock or the boss's answer; one beat a week through the pipeline; `GameState.arcs`; the Storylines tab under Chronicle shows active arcs, cast and history (never hidden truths) |

| `storyPace.ts` | Fewer, better popups: a weekly attention budget (1-3 seats, about 2 a week; mandatory beats always fit). Routine business (a score brought in the usual way, a sponsor's kid put on a collection, a capo's light envelope, a crew wedding or christening, a rival's deal you already answered) is settled quietly with its usual answer: a ledger line ("In motion: ...") and an "In motion" note in the week report and the Storylines tab. Something different this time (the first of its kind, a hit on the table, a dispute over credit) still gets a popup. Its dice are its own |
| `sceneVariants.ts` / `sceneFamilies*.ts` | Scene families: every recurring popup (the bagman, bones offers, the four rivals' deals, a rival courting a man, a man drifting, favors, a capo's light envelope, Sunday dinner, the crew's scores, funerals, the opening of a reign) is told as one of 8-16 scenes with its own place, speaker and stakes, reading the state (season, weather, a war, the heat, a recent death, his last answer). A game never repeats a scene until every scene that fits has been told. Every other crew decision gets one of ~36 settings. Choices keep their ids and chips |
| `storylets.ts` / `storyletData.ts` | Procedural storylets: 28 situations read from the living world (two named men feuding over a racket you own, the incumbent actually up for re-election, a real widow, a rival's newest business, your kid's age and school, the season's storm, a jailed man's family, a new cop, a hijacked truck, the union local, an associate who can never be made, old guard against young turks, the books, the 1963 hearings, RICO, witness protection, a long-term undercover man, a restaurant meeting, the forbidden prosecutor hit, the 1976 casino referendum, the gas-tax paperwork racket ...) x 40 settings x 24 complications (each adds a chip to one tone of answer). Many hooks come from the history of the American Mafia (backdrop only) |
| `openings.ts` | Fresh openings: each game deals one of 10 openings (which rival leans first, an old quarrel between two named men, three opening storylets in weeks 2-12) and the opening scene has 8 tellings |

`npx tsx scripts/variety.ts --games 10 --weeks 156` reports distinct templates, the 8- and 26-week repeat rates, the most repeated templates, the theme mix and the money flows, and the TEXT variety: distinct texts, distinct scenes (names and numbers blanked), the 26-week repeat rate of identical text and of the same scene, the most-seen scene per game, and how much of a game's first 12 weeks shows up in other games' openings. `npx tsx scripts/dumpPopups.ts --seed x --weeks 52 [--filter let_]` prints one game's popups and "In motion" notes.

## UI

Single-page dashboard (`src/ui`): header with date, season countdown, treasury, respect and the three heat bars;
Advance Week / Advance Month; an event modal with choice buttons and effect chips; a weekly report modal showing
every line of "why it changed"; tabs for the island (districts, rivals, rackets), crew (traits, opinion breakdown),
family tree (with succession law and heir preview) and the chronicle. Saves automatically to `localStorage`.

## The clarity layer (wave 2): why do this, why him

Every order, interaction, decision option and "pick a person" choice explains itself. Engine side is pure and
deterministic and reads the same previews the order cards show, so a tooltip cannot disagree with what gets applied
(tests check it against the ledger).

| File | What it does |
|---|---|
| `advice.ts` | `explainAction(s, action)`: purpose, gains/costs as named effects with ranges ("now", "if accepted", "per week", "if it works"), risks with odds and their source, what it sets up, "best when" conditions, a verdict ("Good idea now", "Risky", "Not yet: needs …"). `explainChoice` / `compareChoices` for decision options ("Best value", "Cheapest", "Safest"). `taskAdvice` for council tasks |
| `candidates.ts` | `rankCandidates(s, role, pool?)` for every pick (seat, capo, membership, voucher, manager, scheme agent / hit team, envoy, heir, marriage, Table lobbying): predicted outcome, top 3 pros and cons, opinion and capo loyalty, risk flags, opportunity cost, Recommended + Alternative ("Safest choice" / "Highest upside") |
| `advisors.ts` | The consigliere's and underboss's in-character pick, biased by their own interests (friends, kin, own men, themselves) and shown with their opinion of the man they back |
| `opportunities.ts` | "What should I do?": the 3–5 best opportunities and threats, each linked to its action or picker; the "This week" checklist tied to the early-goals ladder |
| `glossary.ts` | Plain-words help for heat, respect, opinion, the Table, schemes, kick-up, laundering, succession; tooltips quote the engine's constants |

| `advicePillars.ts` | The same for the newer pillars (power, politics, travel, bones, the books, the law, the underbelly, romance): purposes, what it sets up, best-when, value |

UI: `src/ui/clarity/*` (`WhyPanel`, `ChoiceWhy`, `CandidatePicker`, `PickerModal`, `AdvisorQuotes`, `Tip`, `WhatToDoPanel`,
`GlossaryOverlay`, `TaskAdvice`, and the ready-made `HeirCompare`, `OfficialPicker`, `KeeperPicker`, `BonesPicker`, `TripWhy`).
Import everything from `src/ui/clarity` (the index).

### Using the clarity layer (for new screens)

Engine (pure; never mutates; safe in render):

```ts
explainAction(s, action)        // → { title, purpose, gains, costs, changes, risks, unlocks, bestWhen, verdict, chance, value, summary }
explainChoice(s, choice)        // the same for one option of a weekly decision
compareChoices(s, ev.choices)   // → [{ id, ex, tags: ['Best value' | 'Cheapest' | 'Safest'] }]
rankCandidates(s, role, pool?)  // → { question, candidates (best first), recommendedId, alternativeId, alternativeWhy }
advisorAdvice(s, ranking)       // the consigliere's and underboss's (possibly partial) pick, in character
whatShouldIDo(s, n) / weekChecklist(s, { answered, ordersQueued })
glossaryEntry(id) / statHelp(stat) / effectHelp(effect)
```

`Role` is one of `seat`, `capo`, `make`, `voucher`, `manager`, `agent`, `envoy`, `heir` (`wide: true` adds senior men),
`marriage`, `lobby`, `official`, `keeper`, `bones` (`job: 'heist' | 'collection' | 'hit'`).

UI:

| Need | Use |
|---|---|
| An order card that explains itself | `<ActionCard s action />` already includes `<WhyPanel>`; for a custom card add `<WhyPanel s action compact? />` |
| A decision option | `<ChoiceWhy a={compareChoices(s, ev.choices)[i]} />` |
| "Who should it be?" inline | `<CandidatePicker s role pool? limit? onPick? selected? onToggle? hideAdvisors? />` (default: picking queues the candidate's order; `onPick` to do something else; `selected` + `onToggle` for a team) |
| The same as a modal, from anywhere | `useClarity().openPicker(role, { pool?, onPick? })` |
| Hover help | `<Tip term="heat.local">…</Tip>` or `<Tip text="…">…</Tip>` |
| Open the glossary / the advice panel / a tab | `useClarity().openHelp(term?)`, `.openAdvice()`, `.goTab(tab)` |
| The "What should I do?" list in a rail | `<WhatToDoPanel s compact? />` (buttons queue the order, open the picker, the trip planner or the tab) |

Rules: every number a why-panel shows comes from `previewAction` (the same preview the card shows and the resolver
applies); "per week" and "if it works" lines are labelled as such. `tests/clarity.test.ts` and
`tests/clarityPillars.test.ts` check the immediate lines against the ledger, and that a picker never offers an order
its card would refuse. To support a new action kind, add its purpose (and optionally unlocks, best-when, value) to
`advicePillars.ts`; to support a new pick, add a `Role` and a `xxxRole(s, pool): Raw[]` in `candidates.ts`.
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

## The Weekly Take: tribute, the underboss and the Don's envelope

Every week the crews' money comes UP: each man owes his contribution under his agreement (his hustle policy, standing
terms: a flat figure, an exemption, an extension), each capo reconciles his crew, keeps his end under his contract and
remits the rest (a slow payer holds some back in the winter, a greedy one skims), the underboss reconciles, takes his
authorized share and puts what is actually there in the Don's envelope. On Monday the Don splits it: his own money /
the family treasury / the reserve. Quiet weeks go by his standing split (an "In motion" note and the This Week card);
the underboss asks to see him (a popup through the one pipeline, within the attention budget) the first time, when a
crew is short, a capo disputes his number, a petition comes in, a crisis, or every week if the Don asked for that.

| File | What it does |
|---|---|
| `tributeState.ts` | `GameState.tribute` (optional; old saves pick it up on the next week). Accounts (`personal`, `reserve`, `envelope`, `clearing`, `crew:<capo>`; the treasury stays `s.money`), the week's transfer journal and 26 archived weeks, reports, the standing split, the underboss's standing, arrears and why, terms, disputes, investments, favors (patronage), rival books. Its own seeded stream |
| `tribute.ts` | `xfer` (one transfer: idempotent by key, never overdraws, posts the treasury side through the ledger), `reconcileAccounts` (start + in − out == end, no repeated keys; the engine throws like `reconcile`), `collectTake` (called by the economy in place of the old direct kick-ups; same main dice), shortfalls with the TRUTH, what he SAID and what the underboss BELIEVES, the underboss's cut, `allocate` (petitions off the top, then personal / treasury / reserve in one set of transfers; the family's end posts as the week's kick-up lines per crew), `recommendSplit`, obligations, the reserve covering a dry treasury, the household and the Good Life paid from the Don's own money first |
| `tributeTalk.ts` | The underboss's words: 150+ lines by temperament (loyal, ambitious, overwhelmed, acting), season and what happened, every figure from the records ("forty-three hundred", "thirty-seven grand"), no line again until the others that fit were used |
| `tributeFlow.ts` | The week: `tributeBegin` (the Don's split from the audience, his advice, his standing split), `tributeWeek` (disputes, repeat shortfalls, grievances, the underboss's standing and the succession storyline, the Don's greed or thrift read by the capos, the wife, the heir, allowances, widows), `tributeEnd` (a quiet envelope goes by the standing split) |
| `tributeEvents.ts` | The audience popup and the story beats: shortfall, dispute, a capo carrying a man, the wife, the heir, the underboss's base and the succession crisis (ignored, his earners form a faction that wants the Don to step aside), disagreement and resignation, a capo challenging another's books, a failed investment, greed / an aging Don, retirement talk, a widow's dispute, the underboss caught skimming, a grievance, an underboss too sick to count |
| `tributeOps.ts` | Orders (`{ kind: 'tribute' }`: standing split, move money, audits, terms, forgive, the underboss's share, allowances) and effect ops (`{ type: 'tribute' }`) |
| `crewPurse.ts` | The men's own money: every capo, soldier and associate keeps his end (his hustle via `member_keep` transfers; a capo pays the men who work his corners their end out of his, `capo_distribution`), lives on it (a modest household that scales with what he keeps, debts when he cannot cover it, a car, a down payment, the track for a gambler, a wedding envelope), all as journal transfers. A `PurseWeek` per man per week (earned, owed, kicked up, short, kept, spent, his money; 8 weeks) and lifetime totals; `earningsBoard`, flags (short, rising star, in debt, rich, lives above his envelope), `upToCollected` (kicked up − not passed up + late + investments + carry = what reached the underboss). Debt makes a man come up short more; a broke man petitions; a rich ambitious capo wants a bigger end; a rich underboss gathers standing faster |
| `tributeGrievance.ts` | Money grievances (held back over his end, an honest dispute denied, a bigger end refused) go onto the power layer's grievance ladder (grievances.ts) as persistent storylines; amends or a better contract settle them |
| `underboss.ts` | The underboss as a person: `ubProfile` (financial skill, judgment, loyalty, ambition, honesty, standing, wealth, career goal chosen once and kept, his patronage book `tribute.ub.helped` with what the Don never heard, whom he owes, who calls him first, authority, tenure) and `tribute.ubHist` (every man who carried the envelope and how it ended): the seam for the shadow court |
| `rivalBooks.ts` | Rival families on the same architecture: revenue less expenses, capos keep their end and may come up short (more with a grievance), the boss's cut, a reserve, `Rival.money` as the treasury; dry → insolvent (muscle bleeds), a sore capo walks with his corner (the family fragments) |

UI: `src/ui/tribute/` — `AudienceScene` (Monday morning, the Don's office: portrait, his words, the crew table with
drill-down into every man's account, his share, the envelope, last week, issues, petitions, obligations, his
recommended split), `EnvelopeSplit` (sliders or dollars; the treasury takes the remainder, so it always totals 100%
and every dollar), `WeeklyTake` (Borgata and Holdings drawers: Audience, Envelope, Crew Contributions, Obligations,
Accounts, Agreements, Investments, Disputes, Historical Ledger, Other Families), `TakeLine` (This Week, with each crew's
kick-up). The crew table's "Every man" opens every crew: per man earned / owed / kicked up / short / kept / vs last week.
`EarningsBoard` (Borgata → The Family's Earnings, also a Weekly Take tab): everyone in the family in one sortable table
(portrait, kicked up, earned, kept, his money, an 8-week sparkline, rank, crew, flags), top earners and kick-up-by-crew
bar charts in inline SVG, totals that reconcile with the envelope. `PurseSection` puts his money (and, for the
underboss, his profile) on the character sheet. The audience header shows the Don's office (`officeArt.ts`, embedded).

The simulator splits envelopes too (careful: sensible, often the underboss's advice; careless: greedy, half or more)
and measures money as HOUSE CASH = family treasury + the Don's own + the reserve (it prints the treasury alone too).
`npx tsx scripts/tributeReport.ts` plays the spec's 52-week family and prints the automated reconciliation report
(week by week; 7 reconciliation checks and the 14 demonstrations, from `checkRequired` in tests/tributeFamily.ts, the
same function the vitest test asserts). Saves: `upgradeSave` runs `ensureTribute`, which fills any field an older save
lacks. Books keep 26 weeks; past 8 weeks only the family's own accounts (the men's pockets are kept 8 weeks).

Hooks for a shadow court / succession war: the underboss is a full NPC (skill from finance/organization/judgment,
honesty, ambition, loyalty via opinion, wealth); `tribute.ub` holds his standing, who calls him first, his authority
level (`routine` … `shadow`) and the crisis stage; `tribute.favors` records every favor (who did it for whom, how much,
on whose authority, and a `Telling` of truth / said / believed-by / known-by) — the underboss already grants extensions
on his own routine authority and covers for his earners without telling the Don; `petitionsTo` counts who people bring
petitions to.

## The Ears: the Madam, the nightlife workers, the connection web

Nightlife workers are the best spies, and the Madam is the boss's friend, not his employee. Everything here is
off-screen and non-explicit (a set-up, then a report), every woman is an adult who decides for herself, and the player
never coerces, holds debts over, recruits by force or trades in people: the operators who do are enemies to fight.

| File | What it does |
|---|---|
| `earsState.ts` | `GameState.ears` (optional, its own seeded stream): the Madam (her house, public face, lieutenants, successor, money, network, the protection cut, intel pact, venture, ally, squeeze, favors), the Ears (work, venue, network, trust, nerve, discretion, charm, price, goal, her own lines), operators, links, jobs, held hints, story hooks |
| `ears.ts` | Setup per game (fictional names from the world pack's pools); the weekly/monthly tick; orders `{ kind: 'ears', op }` (ask her: "Can you get close to him?" / "Give him a dance", take care of her, protect her, the Madam's diplomacy, going after an operator) with odds and every reason; effect ops `{ type: 'ears', op }`; reports and intel that feed secrets, hooks (affairs and graft only), dirt on officials, plant-found events, rival plots uncovered, the boss's case; the popup source (the Madam, a woman asking for protection, web stories, hints) through the story director |
| `earsWeb.ts` | Who is attached to whom: likes, a regular, girlfriend, mistress, in love, an ex, owes; strength, hidden until an Ear reveals it; grows from visits, dates, romances, reports and on its own; jealousy, a man protecting her, pillow-talk leaks to a rival, breakups, a pregnancy, a wife finding out. Only between a man and a woman drawn to each other; same-sex romances stay private and are never leverage |
| `earsData.ts` | The words: hint settings, one-liners by subject, reports, her opinion of him by his nature, refusals, counter-offers, protection pleas, the Madam's scenes. Every pool is drawn without repeats per game |

UI: `src/ui/ears` — `NightPanel` (Town → The Night: the Madam, the Ears, operators, what came in), `AttachmentBoard`
(Town → Who's attached to whom; a club hub can drop it in as is), `EarsPicker` (the person menu's "The Ears" category),
`ConnectionsList` / `ConnectionsSection` (person menu and character sheet). Jobs and the Madam's squeeze show on the
In Motion strip. The sim's random player uses the Ears' orders (`--ears 0.06`).

## Wildwood up close: the neighborhoods, talks and the Mission Board (wave 2)

The third map level. Country and South Jersey stay the Leaflet maps; **Wildwood** now opens on an illustrated 1960
island (Five Mile Beach: the Crest, Wildwood, North Wildwood, the bay and the causeway), drawn in SVG as 2.5D
(isometric) or a flat plan. Avenues, cross streets, the Boardwalk and its piers (Hunt's, Marine, Sportland and Casino),
the tram car, beach umbrellas, the Giant Wheel. Every building on it is a record in `econ.lots` (or one of your
places with no lot), drawn in its style (Doo Wop / Googie with starbursts and boomerang roofs, Deco, Tiki, Colonial,
Mid-century, Victorian) with its neon sign; day, dusk and night (Auto follows the heat). Eight neighborhoods with
boundaries from the records; the chips zoom to one, and its dashboard opens in Town → Neighborhoods.

**Moving around.** Drag to pan on every level (Leaflet levels natively; the island with its own pointer code: inertia,
bounds that keep the island on screen, ⌂ Recenter), wheel and pinch zoom, a 6px click-vs-drag threshold so a drag
never selects a building. Gestures are a GPU-composited CSS transform over a drawing with a margin past the edges
(kept within ~16 megapixels at the screen's density); the SVG is redrawn once, when the gesture settles. Detail
comes in tiers by zoom (labels, windows, pennants, signs).

**A building** opens its street-view card: an original illustrated postcard of the storefront (by style, use, sign,
condition, era, time of day), who holds it, who runs it, the deed (ownership history), renovate and restyle, and
the property paperwork (LotPanel / BizPanel: buy through the Deal window, lease, managers). A place of yours that
the Empire Designer runs (motel, rooming house, hotel, restaurant, bar, club) has **Open the Empire Designer**; an
empty lot of yours, **Develop it in the Designer** (both through `useEmpire().open`).

**Overlays:** ownership, business type (the `propertyGroups.ts` groups and icons, as in Holdings), rival influence,
available buildings, construction, economy, reputation, police.

| File | What it does |
|---|---|
| `hoodData.ts` | The island's frame (u along the island, v inland), avenues and cross streets, the Boardwalk and piers, the eight neighborhoods (zones → hood), and the authored 1960 records (37 rows, 22 on the Boardwalk: motels, stands, rides and clubs with owners, tenants, build years, styles and signs) |
| `hoodGeo.ts` | Where every record stands: pure and deterministic from zone and index (nothing about geometry is saved); footprints; neighborhood bounds from the records |
| `hoodState.ts` | `GameState.hood` (optional; `ensureHood` adds the 1960 records to the market once, by id): per-neighborhood economy, reputation, police, infrastructure, population, municipal policy; NPC looks; the island's log; a snapshot a year |
| `hood.ts` | The monthly neighborhood sim: owners sell to owners, rivals buy out independents where they are strong and let go where weak, closures and openings, renovations in the decade's style, the era's economy (the early-sixties boom, the seventies slide, the casinos); the dashboard view (`hoodView`), ten-year change (`islandChange`), overlays, the restyle order `{ kind: 'hood', op: { type: 'restyle' } }` (on a Designer venue it restyles its building record) |
| `talks.ts` | Talks from the person menu (Talk): request a meeting, offer a job, discuss business, form a partnership, ask advice, hear a grievance, an evening out, negotiate, discuss the succession. Odds as a full breakdown; five answers: agree, refuse, delay (the answer comes weeks later), counteroffer (taken from the Mission Board), or a family boss acts on his own. Pacts (alliance, truce, partnership) the rivals' AI respects; the families' own diplomacy (alliances, disputes, settlements, splits) |
| `missions.ts` | The Mission Board: multi-stage cases with participants, objectives, disputed facts and who knows them, decisions you make or delegate, NPC counter-moves, and endings that stay in the records. One storyline: **the Tropicana** (old man Kovacs wants out of his Boardwalk motel; Feldstein and Manno want in) |

UI: `src/ui/hood/` (IslandView, Ground, Buildings, Facade, StreetCard, HoodDashboard, MissionBoard). Saves: `upgradeSave`
runs `ensureHood`, `ensureTalks`, `ensureMissions`. Tests: `tests/hood.test.ts` (the Phase A acceptance: 20+
selectable Boardwalk buildings, 5+ independents, 2+ organizations, a purchase, renovation and restyle, save/load and
old saves, ten years of visible and economic change) and `tests/talks.test.ts`.

### Street art and the business-location layer

- **Art manifest** (`src/ui/hood/art/assetUrls.ts`): the one place asset-store URLs live. Keys left `undefined` are exported to `imports/art/final/*.webp` and wait for upload (`final/README.md` lists them); until then `AssetImg` falls back to the SVG art. `SPRITE_OF` maps a painting to a ready-cut transparent sprite (`cutout_*`) the block map draws as-is; otherwise `cutout.ts` cuts the painting in the browser.
- **Names**: defunct places and public landmarks keep their real names (the Shamrock, the Red Garter, Hunt's Pier, Quo Vadis, the Rainbow Club, the Hurricane Club, the Riptide, the Satellite Motel, Schumann's, North Wildwood City Hall, the Hereford Inlet Light). Still-operating businesses get near-miss names, painted onto their signs (Old Mack's Pizza, Gateway 25 / Kohl Bros., Olympia Fascination, Ed's Fun Arcade, Casino Arcadia, the Nutty Hut, the Lollypop Motel, Pompei's, Sportsland, Lil' Nicky's, Uncle Vinny's, the Ebb Tyde, the Fudge Kitchenette). Club Avalon is a landmark establishment only: never owned, never in a crime story.
- **Location layer** (`src/engine/placesGeo.ts`): each property is a GeoJSON Feature with a permanent building id, name, address, operating years, rotation, footprint, image keys, and `located: 'verified' | 'approximate'` plus its source. Two points are verified: Hunt's Pier and the Hereford Inlet Light. The game draws the island longer than the real one, so the frame is pinned at both points and stretched between them. Batch 2 and 3 places stand block by block from Hunt's Pier. They are layer-only, with no lot, so nothing new is ownable.
- **Block map** (`src/ui/hood/PlanView.tsx`): has five areas: the Boardwalk around Hunt's Pier, the Pacific Ave clubs around Taylor Ave, the Boardwalk north to 23rd Ave, North Wildwood from City Hall to Hereford Inlet, and the Crest motels on Atlantic Ave. Ground (roads, sidewalks, the Boardwalk, piers) is drawn beneath the buildings, and only the occupants open in the game year are shown. Click a property for its card, with exterior, interior and the four-angle viewer. The editor moves, turns and resizes a property. You can peek at other years, save corrections in this browser, and use "Copy corrections" to put the GeoJSON on the clipboard (no download links).

### Imported blocks (beta): the city importer

Real geography for the island, imported at development time by `scripts/cityimport/` (OpenStreetMap streets and
building outlines, NJGIN parcels with MOD-IV attributes, the LOC Sanborn sheet index; see its README). The first pack
is a few Wildwood blocks (Lincoln Ave to 26th Ave, Park Blvd to Pacific Ave): `citydata/wildwood/packs/test-blocks/`.
In the game: Wildwood map → *View* → **Imported blocks (beta)** (`src/ui/hood/ImportedView.tsx`, data
`public/geo/imported-wildwood-test-blocks.json`, logic `src/engine/importedCity.ts`): island → area → block →
building → entrance in one frame with the same building ids; "Eligible for 1960" vs "All imported"; unknown history
shown as unresolved tasks; a map editor that exports `historical-overrides.json`. A fictional occupant set on an
imported building is saved with the game (`GameState.importedOccupants`, optional). Tests: `tests/cityimport.test.ts`.
