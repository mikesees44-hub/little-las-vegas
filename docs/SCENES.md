# Writing scenes for Little Las Vegas

A **scene** is one moment the boss lives through: a short piece of prose, the people in it, and two to four choices. You write scenes as plain JSON files in the `scenes/` folder at the top of the project. The game picks them up on the next build. You don't write any code.

Every scene is checked when the game loads. If something is wrong, the checker says what and where, in plain words:

```
scenes/crew.json › capo_bad_night › choices[1] › effects[0]: unknown effect "moneys" (did you mean "money"?)
```

A scene with a mistake is left out and the rest still load. `npx vitest run tests/scenes-authored.test.ts` lists every mistake in every file.

---

## The shape of a scene

```json
{
  "id": "crew_hothead_bar_fight",
  "title": "A fight at the Bucket of Blood",
  "theme": "crew",
  "when": { "season": "summer", "cooldown": 20, "chance": 0.7 },
  "who": {
    "hot":   { "pool": "crew", "traits": ["Hot-headed"], "rank": ["soldier", "associate"] },
    "other": { "pool": "crew", "rank": ["soldier", "associate"] }
  },
  "text": "Two in the morning... {hot.call} broke a chair over {other.call}'s back...",
  "choices": [
    { "label": "Pay for the mirror, and sit them both down", "effects": [ { "money": -300 } ] },
    { "label": "Let the sergeant keep {hot.first} overnight", "effects": [ { "jail": { "role": "hot", "weeks": 1 } } ] }
  ]
}
```

A file can hold one scene, a list of scenes, or `{ "scenes": [ ... ] }`. Any field whose name starts with `_` is a note to yourself, and the game ignores it (`"_about": "..."`).

| Field | What it is |
|---|---|
| `id` | A unique name: lowercase letters, digits and `_`. |
| `title` | The popup's title. Placeholders work here too. |
| `theme` | `crew`, `family`, `romance`, `rivals`, `law`, `town`, `business` or `world`. The story director keeps the mix of themes balanced. |
| `followup` | `true` if the scene only comes up as a later part of a chain (see **Chains**). |
| `when` | The conditions under which it can come up. |
| `who` | The roles, cast from real people in the game. |
| `text` | What the boss reads. |
| `choices` | Two to four answers. |

---

## `when`: when it can happen

Every condition you write has to hold. Leave out the ones you don't need.

| Condition | Example | Meaning |
|---|---|---|
| `years` | `[1960, 1964]` | The calendar year, inclusive (the era). |
| `season` | `"summer"` | `summer` runs from Memorial Day to Labor Day (the Season). Everything else is `offseason`. |
| `months` | `[11, 12, 1]` | Calendar months. |
| `week` | `{ "min": 10 }` | Game weeks since the start (week 1 is Memorial Day 1960). |
| `flags` / `notFlags` | `["promised_sunday"]` | Story flags that must be set, or must not be. Earlier scenes set them. |
| `money`, `respect` | `">=45"` | The Family's money, the boss's respect. |
| `heat` | `{ "local": ">=25" }` | `local`, `family` (Philadelphia), `federal`. |
| `boss` | `{ "traits": ["Charming"] }` | The boss's own traits (`traits` and/or `notTraits`). |
| `location` | `"boardwalk"` | The boss holds a stake (20+ influence) in this district: `boardwalk`, `pacific`, `piers`, `downtown`, `docks`, `crest`, `north`, `causeway`. |
| `chance` | `0.4` | Once everything else holds, the chance it comes up in a given week. |
| `weight` | `10` | How likely it is to be picked over other scenes that fit. The default is 10. |
| `cooldown` | `26` | Weeks before it can come up again. The default is 26. |
| `once` | `true` | It only ever happens once. |

Comparisons are written as text: `"<0"`, `"<=10"`, `">40"`, `">=40"`, `"=3"`, `"!=0"`. A bare number such as `45` means "at least 45".

---

## `who`: the roles

Each role is a name you choose (`capo`, `wife`, `rivalMan`), followed by where to look for that person and what has to be true about them. Every role is a different person, and the boss is always available as `boss`, so you don't declare him.

| Field | Example | Meaning |
|---|---|---|
| `pool` | `"capo"` | Where to look. `crew` is your men. `capo` is your capos. `family` is your house. `wife` is the boss's wife. `kin` is the extended family. `rival` is a rival family's man (not their boss). `rivalBoss` is a rival family's boss. `official` is a cop, judge or clerk. `anyone` is anyone 16 or older. |
| `rank` | `["soldier", "associate"]` | One rank, or a list of ranks. |
| `traits` / `notTraits` | `["Greedy"]` | Traits the person must have, or must not have. |
| `gender` | `"F"` | `"M"` or `"F"`. |
| `age` | `[18, 40]` | Inclusive. |
| `mood` | `"angry"` | Needs a full mind. One of `content`, `proud`, `restless`, `angry`, `afraid`, `greedy`, `grieving`, `scheming`, `loyal`. |
| `opinionOfBoss` | `">=20"` | What they think of the boss. |
| `opinionOf` | `{ "a": "<0" }` | What they think of another role. |
| `tie` | `{ "other": "feud" }` | A standing tie with another role: `friend`, `ally`, `rival`, `feud` or `lovers`. |
| `sameSideAs` | `"rboss"` | They belong to the same family as another role (for example, a rival boss's own man). |

If nobody fits a role, the scene doesn't come up that week.

The traits are `Greedy`, `Hot-headed`, `Patient`, `Ambitious`, `Loyal-to-a-fault`, `Paranoid`, `Pious`, `Womanizer`, `Gambler`, `Honest`, `Cruel`, `Cowardly`, `Charming`, `Vengeful` and `Drinker`.

### Placeholders

In `title`, `text`, `label`, `hint`, `result` and `failText`, you can write:

* `{role.first}`, `{role.last}`, `{role.name}` (the full name), `{role.nick}` (the nickname, or the first name if there isn't one), and `{role.call}` (the first name plus the quoted nickname, such as Vito "the Clam").
* `{role.he}`, `{role.his}`, `{role.him}`, `{role.He}` and `{role.His}`, which follow the person's gender.
* `{boss.first}` and the rest work the same way for the boss.
* `{district}` is the boss's strongest district, and `{house}` is his family name.

---

## `choices`

| Field | Meaning |
|---|---|
| `label` | The button text. |
| `hint` | One line under the button. |
| `requires` | The choice stays visible but is greyed out unless the boss meets it: `money`, `respect`, `favors`, a `flag`, or a `trait` or `notTrait` of the boss (shown CK-style as `[Charming] only`). |
| `effects` | What happens, always. When the choice has odds, these effects happen up front, before the roll. |
| `odds` | Turns the choice into a gamble (see below). |
| `success` / `failure` | What happens after the roll (only with `odds`). |
| `result` / `failText` | The line the chronicle records. |
| `next` | What follows, and when (see **Chains**). |

### Odds

Odds can be a plain number with bonuses:

```json
"odds": { "base": 55, "plus": [
  { "if": { "bossTrait": "Charming" }, "add": 15, "why": "you can talk a dog off a meat truck" },
  { "if": { "role": "hot", "trait": "Vengeful" }, "add": -15, "why": "he keeps score" }
] }
```

Or the odds can come from one of the game's **interactions**, so every reason behind them counts: opinion, fear, rank, traits, his needs, his grudges, ties, hooks and favors owed.

```json
"odds": { "deed": "discipline", "actor": "boss", "target": "capo" }
```

The player sees the percentage under the button, with the three biggest reasons. A `plus` condition can test `role` together with `trait` or `opinionOfBoss`, or it can test `bossTrait` or `flag`.

### Effects

Each effect is an object with exactly one key:

| Effect | Example |
|---|---|
| `money` | `{ "money": -300 }` (Family money) |
| `respect` | `{ "respect": 2 }` |
| `heat` | `{ "heat": { "local": 3, "federal": 1 } }` |
| `opinion` | `{ "opinion": { "of": "capo", "toward": "boss", "by": 10, "why": "Stood by me" } }` |
| `fear` / `trust` / `grievance` | `{ "fear": { "of": "capo", "toward": "boss", "by": 10 } }` |
| `crew` | `{ "crew": { "by": 1, "why": "The boss remembers the old hands" } }` (the whole crew's opinion) |
| `family` | `{ "family": { "by": 2, "why": "..." } }` (the house's opinion) |
| `flag` / `unflag` | `{ "flag": "watching_short_capo" }` |
| `tie` | `{ "tie": { "a": "hot", "b": "other", "kind": "rival", "why": "A chair over the back" } }` (`"kind": "none"` breaks a tie) |
| `memory` | `{ "memory": { "who": "wife", "about": "boss", "text": "he sat with her over a cold supper", "weight": 8 } }` (what his mind remembers, from −50 to 50) |
| `wealth` | `{ "wealth": { "role": "capo", "by": -600 } }` (a person's own money) |
| `hook` | `{ "hook": { "on": "capo", "strong": true, "why": "His second book" } }` |
| `owes` | `{ "owes": { "who": "capo", "to": "boss" } }` (a favor owed, which "Call in a favor" can spend later) |
| `deed` | `{ "deed": { "id": "insult", "actor": "capo", "target": "rboss" } }` (one person does an interaction to another, rolled with all its odds) |
| `evidence` | `{ "evidence": { "role": "man", "by": 6 } }` (what the law has on him) |
| `jail` | `{ "jail": { "role": "hot", "weeks": 1 } }` (never the boss) |

The deeds you can name in `deed` and in `odds.deed` are `befriend`, `flatter`, `feast`, `sway`, `askFavor`, `callFavor`, `alliance`, `demandRespect`, `insult`, `threaten`, `findSecrets`, `fabricateHook`, `blackmail`, `envelope`, `plantRumor`, `turn`, `court`, `frame`, `offerPiece`, `buyOut`, `partner`, `askLoan`, `lend`, `legitimize`, `disown`, `educate`, `recognize` and `discipline`.

---

## Chains

A choice's `next` schedules another scene with the **same people**:

```json
"next": { "scene": "crew_short_envelope_report", "after": [3, 5] }
```

* `after` is the number of weeks later, either a fixed number or a range. The default is `[1, 3]`.
* `on` sets when the next scene follows: `"always"` (the default), only on `"success"`, or only on `"failure"` (the last two need `odds`).
* The next scene usually has `"followup": true`, so it only ever comes up as part of the chain.
* The roles in the next scene keep the same people **by name**. If `capo` was Sal in part one, `capo` is Sal in part two. If he has died, the chain waits a few weeks for the role to be filled and then ends.
* A list of `next` entries can branch the story: `[ { "scene": "a", "on": "success" }, { "scene": "b", "on": "failure" } ]`.

---

## How scenes reach the boss

Scenes join the same stream of popups as everything else in the game. At most one scene comes up in a week. A follow-up that has come due goes first. Otherwise, now and then, the game picks a fresh scene whose `when` holds, weighted by `weight` and by how recently it was seen. The story director's rules apply on top of that: no template is repeated within its cooldown, and the themes stay balanced so the week doesn't fill up with one kind of story. If the boss doesn't answer, the last choice is taken, so make the last choice the "do nothing" answer.

## House style

* The setting is 1960s Wildwood, New Jersey: the boardwalk, Pacific Avenue, the piers, St. Ann's, the Shamrock and the Riptide. Use period words: the Season, the numbers, the book, the envelope, a sit-down.
* Keep the text to two or three sentences, and keep a label to a line. Let the people talk.
* Everyone in the scenes is fictional. Violence is implied and never shown. Romance happens only between consenting adults and stays off the page.
* Each choice should cost something and give something. The player should be able to argue for any of them.
