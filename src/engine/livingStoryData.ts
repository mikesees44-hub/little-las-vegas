import { ageOn } from './calendar';
import { capos, crew, hasTrait, player } from './characters';
import { chooseHeir } from './dynasty';
import { calendar } from './polElections';
import { getPerson } from './polPeople';
import { mName } from './polState';
import { opinion } from './relations';
import { registerArcTemplates, type ArcTemplate, type ArcView } from './livingStories';
import type { Character, Effect, GameState } from './types';

/**
 * The eleven living storylines (the "Living Stories" pack, rewritten for
 * Wildwood 1960 and our engine). Every cast is found among people who
 * already exist; no template creates anybody. Violence stays off-stage and
 * abstract; adults decide for themselves; a hidden truth (is he really a
 * rat?) is never printed.
 *
 *  1. The Crown Nobody Wants to Give Up    the underboss vs. the boss's grown child
 *  2. Whispers of a Rat                    a rumor about one of your men
 *  3. The Empty Chair                      a relative who stopped coming to Sunday dinner
 *  4. Queen of the Velvet Room             a skilled manager passed over for family
 *  5. The Secret at the Restaurant         a busboy's story about two married people
 *  6. The Daughter Who Chose the Law       a daughter who wants to be a lawyer
 *  7. The Case That Wouldn't Die           a bookkeeper's question about trucking invoices
 *  8. The Shore Election                   an incumbent's campaign; the election engine decides
 *  9. The Rival on the Boardwalk           a former manager opens a club of her own (seeded by 4)
 * 10. A Crew Becomes a Family              young men with ambitions of their own
 * 11. The Boss's Judgment                  a capo accuses one of your men
 */

const age = (s: GameState, c: Character) => ageOn(c.birth, s.date);
const op = (s: GameState, a: string | undefined, b: string | undefined) => (a && b ? opinion(s, a, b) : 0);
const opn = (from: string, to: string, amount: number, reason: string, decay = 1): Effect => ({ type: 'opinion', from, to, amount, reason, decay });
const grudge = (from: string, to: string, amount: number): Effect => ({ type: 'meter', from, to, meter: 'grievance', amount });
const he = (c: Character | undefined) => (c?.gender === 'F' ? 'she' : 'he');
const R = (v: ArcView, role: string) => v.arc.roles[role];

function alive(s: GameState, ids: (string | undefined)[]): Character[] {
  return ids.map((id) => (id ? s.characters[id] : undefined)).filter((c): c is Character => !!c?.alive && c.id !== s.playerId);
}

function relatives(s: GameState): Character[] {
  const b = player(s);
  const sibs = b.fatherId ? Object.values(s.characters).filter((o) => o.alive && o.id !== b.id && o.fatherId === b.fatherId) : [];
  return [...alive(s, b.childrenIds), ...sibs, ...alive(s, [b.fatherId, b.motherId])];
}

/* ------------------------------------------------------------------ */
/* 1. The Crown Nobody Wants to Give Up                                */
/* ------------------------------------------------------------------ */

const crown: ArcTemplate = {
  id: 'crown',
  name: 'The Crown Nobody Wants to Give Up',
  theme: 'crew',
  synopsis: 'the underboss has always believed the chair would be his; the boss\'s grown child has started to believe it too.',
  roleLabels: { underboss: 'the underboss', heir: 'your heir' },
  minWeek: 14,
  weight: 10,
  bind: (s) => {
    const ub = crew(s).find((c) => c.rank === 'underboss' && c.alive && !c.dynasty);
    const h = chooseHeir(s, player(s)).heir;
    if (!ub || !h || h.id === ub.id || !h.alive || age(s, h) < 18) return undefined;
    return { boss: s.playerId, underboss: ub.id, heir: h.id };
  },
  stages: [
    {
      id: 'hint', title: 'A compliment at Sunday dinner', wait: [0, 1],
      auto: (v) => ({
        note: `At Sunday dinner you called ${v.f('heir')} "a natural." Everyone laughed. ${v.n('underboss')} laughed last.`,
        effects: [grudge(R(v, 'underboss'), v.s.playerId, 12), opn(R(v, 'underboss'), v.s.playerId, -5, 'The boss is grooming his own')],
        next: 'audience',
      }),
    },
    {
      id: 'audience', title: 'The underboss asks for a word', wait: [3, 5],
      text: (v) => `${v.n('underboss')} asks to see you alone, in the back of the bakery, before it opens. He has been your underboss for years and he has never asked for anything. "I was told once," he says, "that when the day came, the chair was mine. I'd like to know if that is still true, or if I should start thinking about ${v.f('heir')} as my boss."`,
      choices: [
        { id: 'confirm', label: '"Nothing has changed. When the day comes, it is yours."', because: 'promised the chair to the underboss', note: (v) => `You told ${v.f('underboss')} the chair is still his. ${v.f('heir')} heard about it.`, next: 'uncertainty',
          effects: (v) => [opn(R(v, 'underboss'), v.s.playerId, 12, 'Kept his word about the chair', 0), opn(R(v, 'heir'), v.s.playerId, -8, 'Promised my chair away'), grudge(R(v, 'heir'), v.s.playerId, 8)] },
        { id: 'heir', label: `Tell him the truth: it will be ${v_first('heir')}`, detail: 'Honest. Dangerous.', because: 'told the underboss the chair goes to family', note: (v) => `You told ${v.f('underboss')} the chair goes to ${v.f('heir')}. He thanked you for your honesty.`, next: 'uncertainty',
          effects: (v) => [opn(R(v, 'underboss'), v.s.playerId, -18, 'Passed over for the boss\'s child', 1), grudge(R(v, 'underboss'), v.s.playerId, 25), opn(R(v, 'heir'), v.s.playerId, 12, 'Named me')] },
        { id: 'council', label: 'Put it to the capos, someday, over dinner', detail: 'Nobody gets an answer. Everybody gets a meal.', because: 'left the succession to the capos', note: () => 'You said the capos would decide when the day comes. Nobody believed it, everybody ate.', next: 'uncertainty',
          effects: () => [{ type: 'money', amount: -400 }, { type: 'crewOpinion', amount: 1, reason: 'The boss asks the capos' }] },
      ],
    },
    {
      id: 'uncertainty', title: 'Two men keep count', wait: [12, 20],
      auto: (v) => {
        const ub = op(v.s, R(v, 'underboss'), v.s.playerId);
        if (ub >= 25 && v.arc.picks.audience !== 'heir') return { note: `${v.f('underboss')} and ${v.f('heir')} were seen laughing together at a christening. Whatever it was, it seems to have passed.`, finish: 'The question of the chair went back to sleep, for now.' };
        return { note: `${v.f('underboss')} has been having lunch with capos. ${v.f('heir')} has been having lunch with the same capos, on different days.`, effects: [{ type: 'crewOpinion', amount: -1, reason: 'Two camps at the club' }], next: 'claims' };
      },
    },
    {
      id: 'claims', title: 'Two claims, one chair', wait: [2, 4],
      text: (v) => `It has stopped being whispers. The capos are sorting themselves: some sit with ${v.n('underboss')} at the club, some with ${v.n('heir')}. Your consigliere says the family can live with a question for a long time, but not with two answers.`,
      choices: [
        { id: 'underboss', label: `Settle it: ${v_first('underboss')} is the successor`, because: 'named the underboss successor', note: (v) => `You named ${v.f('underboss')} your successor in front of the capos.`, finish: (v) => `${v.f('heir')} took it like a ${v.c.heir?.gender === 'F' ? 'woman' : 'man'} in public, and badly in private.`,
          effects: (v) => [opn(R(v, 'underboss'), v.s.playerId, 15, 'Named me successor', 0), opn(R(v, 'heir'), v.s.playerId, -15, 'Passed me over'), { type: 'familyOpinion', amount: -2, reason: 'The chair went outside the family' }] },
        { id: 'heir', label: `Settle it: ${v_first('heir')} is the successor; ${v_first('underboss')} retires with honor`, because: 'named the heir and retired the underboss', note: (v) => `You named ${v.f('heir')}. ${v.f('underboss')} was given a dinner, an envelope and a house in Florida.`, finish: (v) => `${v.f('underboss')} went to Florida. Some of his capos went quiet.`,
          disabled: (v) => (v.c.underboss?.dynasty ? 'He is family; he cannot be retired' : undefined),
          effects: (v) => [{ type: 'money', amount: -1500 }, { type: 'retire', charId: R(v, 'underboss') }, opn(R(v, 'heir'), v.s.playerId, 15, 'Named me'), { type: 'crewOpinion', amount: -2, reason: 'The underboss was put out to pasture' }] },
        { id: 'share', label: 'Divide the work: the street to one, the books to the other', detail: 'Both get something. Neither gets the chair.', because: 'divided the work between the two claimants', note: (v) => `${v.f('underboss')} kept the street, ${v.f('heir')} got the books. Neither got the chair.`, finish: () => 'An uneasy peace: the kind that lasts exactly as long as the boss does.',
          effects: (v) => [opn(R(v, 'underboss'), v.s.playerId, 3, 'Kept the street'), opn(R(v, 'heir'), v.s.playerId, 3, 'Got the books'), { type: 'respect', amount: 1 }] },
      ],
    },
  ],
};

/** Choice labels are static strings; these read the cast when the popup is built (see `label` functions below). */
function v_first(role: string): string {
  return `{${role}}`;
}

/* ------------------------------------------------------------------ */
/* 2. Whispers of a Rat                                                */
/* ------------------------------------------------------------------ */

const rat: ArcTemplate = {
  id: 'rat',
  name: 'Whispers of a Rat',
  theme: 'law',
  synopsis: 'someone close to the family is said to be talking to the law. It may be true, false, or half of each.',
  roleLabels: { suspect: 'the man they talk about', adviser: 'who brought it to you' },
  minWeek: 10,
  weight: 10,
  bind: (s, pick) => {
    const men = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'capo') && !c.dynasty && c.alive);
    // Rumors find men with something on them, guilty or not.
    const talkedAbout = men.filter((c) => (c.evidence ?? 0) >= 15 || !!c.informantFor || hasTrait(c, 'Cowardly'));
    const suspect = pick(talkedAbout.length ? talkedAbout : men);
    const adviser = crew(s).find((c) => c.rank === 'consigliere' && c.alive && c.id !== suspect?.id) ?? capos(s).find((c) => c.id !== suspect?.id && c.alive);
    if (!suspect || !adviser) return undefined;
    return { boss: s.playerId, suspect: suspect.id, adviser: adviser.id };
  },
  stages: [
    {
      id: 'rumor', title: 'Somebody is talking', wait: [0, 1],
      text: (v) => `${v.n('adviser')} closes the office door. A bartender in Rio Grande heard it from a cab driver who heard it from a county clerk: ${v.n('suspect')} has been seen at a diner in Cape May Court House with a man in a gray suit. Nobody can say what was said, or whether the man in the gray suit was a cop, a lawyer, or ${v.f('suspect')}'s brother-in-law.`,
      choices: [
        { id: 'speak', label: 'Talk to him yourself, man to man', because: 'asked the man about the rumor yourself', note: (v) => `You asked ${v.f('suspect')} about the diner. He looked you in the eye and said it was his wife's cousin.`, next: 'reply', effects: (v) => [opn(R(v, 'suspect'), v.s.playerId, -5, 'The boss asked me if I am a rat')] },
        { id: 'lawyer', label: 'Ask the family lawyer what the law can and cannot do ($400)', because: 'asked the lawyer about the rumor', note: () => 'The lawyer explained what a cooperating witness can and cannot give a grand jury. You changed nothing, and listened more.', next: 'reply', effects: (v) => [{ type: 'money', amount: -400 }, { type: 'evidence', charId: v.s.playerId, amount: -2 }] },
        { id: 'wait', label: 'Wait. A rumor is not proof.', because: 'waited on the rumor', note: (v) => `You told ${v.f('adviser')} you would wait for something better than a cab driver.`, next: 'reply', effects: (v) => [opn(R(v, 'adviser'), v.s.playerId, -4, 'The boss would not listen')] },
      ],
    },
    {
      id: 'reply', title: 'Contradictions', wait: [5, 7],
      auto: (v) => ({
        note: `Two stories now: ${v.f('suspect')}'s cousin says the lunch was about a christening; a waitress says there were papers on the table. Neither proves anything. ${v.f('suspect')} has noticed people watching him.`,
        effects: [grudge(R(v, 'suspect'), v.s.playerId, 10)],
        next: 'judgment',
      }),
    },
    {
      id: 'judgment', title: 'The cost of a suspicion', wait: [1, 2],
      text: (v) => `${v.n('adviser')} wants an answer. ${v.n('suspect')} wants his good name. The crew wants to know what you do with a man nobody can prove anything about. Whatever you decide, you are deciding without knowing.`,
      choices: [
        { id: 'keep', label: 'Keep him, and keep him close', because: 'kept the suspected man close', note: (v) => `You kept ${v.f('suspect')} on, and moved the important talk somewhere he is not.`, finish: (v) => `${v.f('suspect')} still works for the family. Whether he still works for anyone else, you may never know.`,
          effects: (v) => [opn(R(v, 'suspect'), v.s.playerId, 8, 'The boss stood by me'), { type: 'evidence', charId: v.s.playerId, amount: -1 }] },
        { id: 'check', label: 'Have him looked into, quietly ($400)', detail: 'Phone records, a cop who owes you. A real check, not a rumor.', because: 'had the suspected man looked into', note: (v) => `You had ${v.f('suspect')} looked into the way you look into a new man.`, finish: () => 'Whatever the check turns up, it will be evidence and not a cab driver\'s story.',
          effects: (v) => [{ type: 'money', amount: -400 }, { type: 'checkBackground', charId: R(v, 'suspect') }] },
        { id: 'sideline', label: 'Take him off the important work', detail: 'Safe, if he talks. Unforgivable, if he does not.', because: 'sidelined the suspected man', note: (v) => `You took ${v.f('suspect')} off the collections. He knows why.`, finish: (v) => `${v.f('suspect')} will remember being suspected longer than anyone remembers the rumor.`,
          effects: (v) => [grudge(R(v, 'suspect'), v.s.playerId, 30), opn(R(v, 'suspect'), v.s.playerId, -15, 'Treated like a rat on a cab driver\'s word'), { type: 'policy', charId: R(v, 'suspect'), policy: 'earn' }] },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 3. The Empty Chair                                                  */
/* ------------------------------------------------------------------ */

const emptyChair: ArcTemplate = {
  id: 'empty_chair',
  name: 'The Empty Chair',
  theme: 'family',
  synopsis: 'a grown relative has stopped coming to Sunday dinner, and everybody has a different story about why.',
  roleLabels: { spouse: 'your wife', missing: 'the empty chair' },
  minWeek: 8,
  weight: 9,
  bind: (s) => {
    const b = player(s);
    const spouse = b.spouseId ? s.characters[b.spouseId] : undefined;
    const cands = relatives(s).filter((c) => age(s, c) >= 18 && op(s, c.id, b.id) < 10).sort((a, x) => op(s, a.id, b.id) - op(s, x.id, b.id));
    if (!spouse?.alive || !cands.length) return undefined;
    return { boss: b.id, spouse: spouse.id, missing: cands[0].id };
  },
  stages: [
    {
      id: 'absence', title: 'Three Sundays', wait: [0, 1],
      auto: (v) => ({
        note: `For the third Sunday running, ${v.n('missing')}'s chair is empty. ${v.f('spouse')} keeps setting the place anyway, and asks you what happened. The cousins each have a story.`,
        effects: [opn(R(v, 'spouse'), v.s.playerId, -5, 'Will not say what happened')],
        next: 'breakpoint',
      }),
    },
    {
      id: 'breakpoint', title: 'Divided loyalties', wait: [3, 5],
      text: (v) => `${v.f('spouse')} has stopped asking. She has started visiting ${v.n('missing')} on her own, on Wednesday afternoons, and coming home quiet. "Whatever it is between you," she says, "it is in my kitchen now."`,
      choices: [
        { id: 'go', label: `Go see ${v_first('missing')} yourself`, because: 'went to see the relative who stopped coming', note: (v) => `You knocked on ${v.f('missing')}'s door with a box of pastry, like an old man.`, next: 'shadow',
          effects: (v) => [opn(R(v, 'missing'), v.s.playerId, 14, 'Came to my door'), opn(R(v, 'spouse'), v.s.playerId, 6, 'Swallowed his pride')] },
        { id: 'priest', label: 'Ask Father Callahan to bring everyone to the same table ($200)', detail: 'Anyone can refuse.', because: 'asked the priest to make peace in the family', note: () => 'Father Callahan came to dinner. Not everyone did.', next: 'shadow',
          effects: (v) => [{ type: 'money', amount: -200 }, opn(R(v, 'missing'), v.s.playerId, 6, 'The boss sent the priest')] },
        { id: 'dismiss', label: '"If they want to sulk, let them sulk."', because: 'dismissed the empty chair', note: (v) => `You told ${v.f('spouse')} to stop setting the place.`, next: 'shadow',
          effects: (v) => [grudge(R(v, 'spouse'), v.s.playerId, 18), opn(R(v, 'spouse'), v.s.playerId, -12, 'Dismissed my family'), opn(R(v, 'missing'), v.s.playerId, -6, 'Did not care')] },
      ],
    },
    {
      id: 'shadow', title: 'Seasons pass', wait: [16, 28],
      auto: (v) => (op(v.s, R(v, 'missing'), v.s.playerId) >= 10
        ? { note: `${v.f('missing')} came to the christening, then to a Sunday, then to every Sunday. Nobody mentions the months in between.`, effects: [{ type: 'familyOpinion', amount: 3, reason: 'The family is whole at the table' }], finish: 'The chair is full again.' }
        : { note: `The children have noticed the empty chair. ${v.f('spouse')} has stopped setting it.`, next: 'holiday' }),
    },
    {
      id: 'holiday', title: 'Christmas Eve', wait: [1, 6],
      text: (v) => `Christmas Eve: seven fishes, the good tablecloth, the whole house in the kitchen. ${v.f('spouse')} stands at the cupboard with one plate in her hand and looks at you. The chair is ${v.f('missing')}'s, the plate is ${his(v.c.missing)}, and it is your table.`,
      choices: [
        { id: 'set', label: 'Set the place, and send word that it is there', because: 'set a place for the absent relative', note: () => 'You set the place and sent word.', finish: (v) => (op(v.s, R(v, 'missing'), v.s.playerId) >= 0 ? `${v.f('missing')} came, late, after the fish, and stayed until midnight Mass.` : `${v.f('missing')} did not come. The place stayed set all night.`),
          effects: (v) => [opn(R(v, 'missing'), v.s.playerId, 8, 'Set a place for me'), { type: 'familyOpinion', amount: 2, reason: 'Kept a place for family' }] },
        { id: 'clear', label: 'Put the plate back', because: 'cleared the absent relative\'s place', note: () => 'You put the plate back in the cupboard.', finish: (v) => `Nobody asked about ${v.f('missing')} again. Everybody thought about it.`,
          effects: () => [{ type: 'familyOpinion', amount: -3, reason: 'An empty chair at Christmas' }] },
      ],
    },
  ],
};

function his(c: Character | undefined): string {
  return c?.gender === 'F' ? 'hers' : 'his';
}

/* ------------------------------------------------------------------ */
/* 4. Queen of the Velvet Room                                         */
/* ------------------------------------------------------------------ */

const NIGHT = new Set(['club', 'bar', 'restaurant']);

const velvet: ArcTemplate = {
  id: 'velvet',
  name: 'Queen of the Velvet Room',
  theme: 'business',
  synopsis: 'the person who really runs one of your places was passed over for a young man of the family.',
  roleLabels: { manager: 'the one who runs it', nephew: 'the young relative', biz: 'the place' },
  minWeek: 12,
  weight: 9,
  bind: (s, pick) => {
    const b = player(s);
    const places = s.businesses.filter((x) => x.owner === 'player' && NIGHT.has(x.kind));
    const place = pick(places);
    const young = [...alive(s, b.childrenIds), ...relatives(s).flatMap((r) => alive(s, r.childrenIds))].filter((c) => c.gender === 'M' && age(s, c) >= 18 && age(s, c) <= 30);
    const nephew = pick(young);
    const managers = Object.values(s.econ?.managers ?? {}).map((m) => (m.charId ? s.characters[m.charId] : undefined)).filter((c): c is Character => !!c?.alive && c.id !== nephew?.id && c.id !== b.id);
    const earners = crew(s).filter((c) => c.alive && !c.dynasty && c.rank !== 'capo' && c.rank !== 'underboss' && c.attributes.business >= 55 && c.id !== nephew?.id);
    const manager = pick(managers.length ? managers : earners);
    if (!place || !nephew || !manager) return undefined;
    return { boss: b.id, manager: manager.id, nephew: nephew.id, biz: `biz:${place.id}` };
  },
  stages: [
    {
      id: 'passed', title: 'The promotion goes to family', wait: [0, 1],
      auto: (v) => ({
        note: `You made ${v.n('nephew')} the man in charge at ${v.n('biz')}. ${v.n('manager')} trained half the staff there, knows every liquor salesman by his first name, and found out from the bartender.`,
        effects: [grudge(R(v, 'manager'), v.s.playerId, 18), opn(R(v, 'manager'), v.s.playerId, -10, 'Passed over for the boss\'s family')],
        next: 'petition',
      }),
    },
    {
      id: 'petition', title: 'An audience, by appointment', wait: [2, 4],
      text: (v) => `${v.n('manager')} asks for an appointment, which nobody does. ${He(v.c.manager)} brings the books of ${v.n('biz')} for the last three seasons, every column in ${his(v.c.manager)} handwriting. "I'm not asking for anything I didn't build," ${he(v.c.manager)} says. "But I've had an offer from Atlantic City, and I wanted you to hear it from me."`,
      choices: [
        { id: 'partner', label: 'A real piece of the place ($600 now, and a share)', because: 'made the manager a partner', note: (v) => `You gave ${v.f('manager')} a piece of ${v.n('biz')}, on paper.`, next: 'future',
          effects: (v) => [{ type: 'money', amount: -600 }, { type: 'wealth', charId: R(v, 'manager'), amount: 600 }, opn(R(v, 'manager'), v.s.playerId, 18, 'Made me a partner', 0)] },
        { id: 'mentor', label: `Pay ${'{manager}'} to teach the boy the business ($300)`, detail: 'Both can say no.', because: 'asked the manager to teach your relative', note: (v) => `You asked ${v.f('manager')} to teach ${v.f('nephew')} the business, and paid for it.`, next: 'future',
          effects: (v) => [{ type: 'money', amount: -300 }, opn(R(v, 'manager'), R(v, 'nephew'), 5, 'Teaching him the business'), opn(R(v, 'manager'), v.s.playerId, 4, 'At least the boss asked')] },
        { id: 'refuse', label: '"Family is family. Take the offer if you want it."', because: 'kept the appointment as it was', note: (v) => `You told ${v.f('manager')} that family is family.`, next: 'future',
          effects: (v) => [grudge(R(v, 'manager'), v.s.playerId, 15), grudge(R(v, 'manager'), R(v, 'nephew'), 15)] },
      ],
    },
    {
      id: 'future', title: 'A future of one\'s own', wait: [14, 24],
      auto: (v) => {
        const o = op(v.s, R(v, 'manager'), v.s.playerId);
        if (v.arc.picks.petition === 'refuse' || o < -5) {
          return {
            note: `${v.n('manager')} gave two weeks' notice, very politely, and signed a lease on a closed-up supper club two blocks from ${v.n('biz')}.`,
            effects: v.c.manager?.faction === 'player' ? [{ type: 'retire', charId: R(v, 'manager') }] : [],
            seed: { tpl: 'boardwalk_rival', roles: { boss: v.s.playerId, founder: R(v, 'manager') } },
            finish: `${v.f('manager')} is somebody else's boss now: ${his(v.c.manager)} own.`,
          };
        }
        return { note: `${v.n('biz')} had its best season. ${v.f('nephew')} is learning, slowly, mostly by watching ${v.f('manager')}.`, effects: [{ type: 'money', amount: 1500 }], finish: 'The Velvet Room has a queen, whatever the sign on the office door says.' };
      },
    },
  ],
};

function He(c: Character | undefined): string {
  return c?.gender === 'F' ? 'She' : 'He';
}

/* ------------------------------------------------------------------ */
/* 5. The Secret at the Restaurant                                     */
/* ------------------------------------------------------------------ */

const restaurant: ArcTemplate = {
  id: 'restaurant',
  name: 'The Secret at the Restaurant',
  theme: 'romance',
  synopsis: 'a busboy has a story about two people at a motel. It may be true or it may not; either way it is their business.',
  roleLabels: { partner: 'one of them', friend: 'the other', spouse: 'whose marriage it is' },
  minWeek: 10,
  weight: 7,
  bind: (s, pick) => {
    const rels = (s.romance?.rels ?? []).filter((r) => r.kind === 'affair' && r.ended === undefined && r.discovered === undefined);
    const ok = rels.filter((r) => {
      const a = s.characters[r.a];
      const b = s.characters[r.b];
      // Never an orientation story: only a married man and woman whose secret is the marriage.
      return a?.alive && b?.alive && a.gender !== b.gender && a.id !== s.playerId && b.id !== s.playerId;
    });
    const r = pick(ok);
    if (!r) return undefined;
    const married = [s.characters[r.a], s.characters[r.b]].find((c) => c.spouseId && s.characters[c.spouseId]?.alive && c.spouseId !== s.playerId);
    if (!married) return undefined;
    const other = married.id === r.a ? r.b : r.a;
    return { boss: s.playerId, partner: married.id, friend: other, spouse: married.spouseId!, rom: `rom:${r.id}` };
  },
  stages: [
    {
      id: 'whisper', title: 'A busboy talks', wait: [0, 1],
      auto: (v) => ({ note: `A busboy at a restaurant on New Jersey Avenue has a story about ${v.n('partner')} and ${v.n('friend')} and a motel in the Crest. He tells it to anyone who tips. It may be true.`, next: 'discussion' }),
    },
    {
      id: 'discussion', title: 'Other people\'s business', wait: [2, 4],
      text: (v) => `The busboy's story has reached the club, which means it will reach ${v.n('spouse')} by Sunday. ${v.f('partner')} and ${v.f('friend')} are grown people; what they do is theirs to decide, and so is what ${v.f('spouse')} does if ${he(v.c.spouse)} finds out. What you decide is whether the family's busboy keeps telling it.`,
      choices: [
        { id: 'hush', label: 'Have a word with the busboy, and a better job for him ($200)', because: 'kept a busboy from gossiping', note: () => 'The busboy got a job at a motel in Cape May and stopped telling stories.', next: 'aftermath',
          effects: (v) => [{ type: 'money', amount: -200 }, { type: 'storyOp', op: { op: 'hush', romanceId: R(v, 'rom').slice(4) } }] },
        { id: 'warn', label: `Tell ${v_first('partner')}, privately, that people are talking`, because: 'warned a man that people were talking', note: (v) => `You told ${v.f('partner')}, privately, that people were talking. What ${he(v.c.partner)} does with it is ${his(v.c.partner)} business.`, next: 'aftermath',
          effects: (v) => [opn(R(v, 'partner'), v.s.playerId, 6, 'Warned me, and did not judge'), { type: 'storyOp', op: { op: 'hush', romanceId: R(v, 'rom').slice(4) } }] },
        { id: 'none', label: 'It is none of the family\'s business', because: 'stayed out of other people\'s marriages', note: () => 'You stayed out of it.', next: 'aftermath', effects: () => [] },
      ],
    },
    {
      id: 'aftermath', title: 'Lives go on', wait: [12, 26],
      auto: (v) => {
        const r = v.s.romance?.rels.find((x) => x.id === R(v, 'rom').slice(4));
        if (r?.discovered !== undefined) return { note: `It came out, the way these things do. ${v.f('spouse')} knows.`, finish: 'What happens next in that house is for the people who live in it.' };
        if (r?.ended !== undefined) return { note: `Whatever it was between ${v.f('partner')} and ${v.f('friend')}, it is over.`, finish: 'The busboy\'s story is just a story now.' };
        return { note: 'The busboy\'s story faded. Some people still look twice when the two of them are in the same room.', finish: 'A secret kept, for now, by the people whose secret it is.' };
      },
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 6. The Daughter Who Chose the Law                                   */
/* ------------------------------------------------------------------ */

const daughterLaw: ArcTemplate = {
  id: 'daughter_law',
  name: 'The Daughter Who Chose the Law',
  theme: 'family',
  synopsis: 'your daughter wants to be a lawyer: her own career, her own name, and maybe her own side.',
  roleLabels: { daughter: 'your daughter' },
  minWeek: 6,
  weight: 9,
  bind: (s, pick) => {
    const d = pick(alive(s, player(s).childrenIds).filter((c) => c.gender === 'F' && age(s, c) >= 17 && age(s, c) <= 28));
    return d ? { boss: s.playerId, daughter: d.id } : undefined;
  },
  stages: [
    {
      id: 'announce', title: 'The announcement', wait: [0, 1],
      text: (v) => `${v.n('daughter')} waits until dessert. She has been accepted to the law school at Rutgers in Camden. She wants to go. She does not want the family's money for it, she says, and she does not want the family's lawyers calling her professors. She wants to do it the way other people do it.`,
      choices: [
        { id: 'support', label: 'Tell her you are proud of her, and mean it', because: 'blessed your daughter\'s law career', note: (v) => `You told ${v.f('daughter')} you were proud of her. She cried, which she never does.`, next: 'school',
          effects: (v) => [opn(R(v, 'daughter'), v.s.playerId, 18, 'Respected my choice', 0)] },
        { id: 'pay', label: 'Pay the tuition anyway, through the parish ($800)', detail: 'She will figure it out eventually.', because: 'quietly paid your daughter\'s tuition', note: () => 'A scholarship from the parish appeared. She did not ask how.', next: 'school',
          effects: (v) => [{ type: 'money', amount: -800 }, opn(R(v, 'daughter'), v.s.playerId, 8, 'Supported me')] },
        { id: 'pressure', label: '"The family needs you in the business, not in a courtroom."', because: 'pressed your daughter to join the business', note: (v) => `You told ${v.f('daughter')} the family needs her. She went to Camden anyway.`, next: 'school',
          effects: (v) => [grudge(R(v, 'daughter'), v.s.playerId, 25), opn(R(v, 'daughter'), v.s.playerId, -15, 'Tried to stop me')] },
      ],
    },
    {
      id: 'school', title: 'Camden', wait: [26, 40],
      auto: (v) => (v.arc.picks.announce === 'pressure'
        ? { note: `${v.f('daughter')} works nights at a diner on Broadway to pay her own way, and is at the top of her class anyway. She comes home for Easter and talks to her mother, not to you.`, next: 'bar' }
        : { note: `${v.f('daughter')} made law review. Her professors call her "Counselor." She calls home on Sundays.`, effects: [{ type: 'familyOpinion', amount: 2, reason: 'A lawyer in the family' }], next: 'bar' }),
    },
    {
      id: 'bar', title: 'She passed the bar', wait: [8, 16],
      text: (v) => `${v.n('daughter')} passed the bar on her first try. Two offers came the same week: the County Prosecutor's office wants her as an assistant prosecutor, and a respectable firm in Philadelphia wants her for its estates practice. She asks what you think, which is not the same as asking permission.`,
      choices: [
        { id: 'prosecutor', label: '"Take the job you want. Even that one."', because: 'told your daughter to take the prosecutor\'s job', note: (v) => `${v.f('daughter')} took the oath as an assistant prosecutor. There is a wall in her office between her cases and your name.`, finish: () => 'A daughter at the Prosecutor\'s office: the safest and the most dangerous thing in the family.',
          effects: (v) => [opn(R(v, 'daughter'), v.s.playerId, 15, 'Let me be my own person', 0), { type: 'heat', bar: 'local', amount: -4 }, { type: 'respect', amount: 1 }] },
        { id: 'firm', label: 'Philadelphia. A clean firm, a clean name.', because: 'steered your daughter to a Philadelphia firm', note: (v) => `${v.f('daughter')} went to the Philadelphia firm. She drafts wills for Main Line widows and sleeps well.`, finish: () => 'A clean name in the family, kept clean.',
          effects: (v) => [opn(R(v, 'daughter'), v.s.playerId, 6, 'Gave honest advice')] },
        { id: 'family', label: 'Ask her to hang out her own shingle and take the family\'s cases', detail: 'She can say no.', because: 'asked your daughter to be the family\'s lawyer', note: (v) => `You asked ${v.f('daughter')} to be the family's lawyer. ${hasTrait(v.c.daughter!, 'Honest') ? 'She said no, kindly and completely.' : 'She said she would think about it, and then she said yes, on her terms.'}`,
          finish: (v) => (hasTrait(v.c.daughter!, 'Honest') ? 'She practices on her own. She does not take your calls about work.' : 'Counsel to the family: her terms, her fees, her rules.'),
          effects: (v) => (hasTrait(v.c.daughter!, 'Honest') ? [opn(R(v, 'daughter'), v.s.playerId, -8, 'Wanted me for his lawyer')] : [{ type: 'evidence', charId: v.s.playerId, amount: -4 }, opn(R(v, 'daughter'), v.s.playerId, -2, 'Put me in the middle')]) },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 7. The Case That Wouldn't Die                                       */
/* ------------------------------------------------------------------ */

const deadCase: ArcTemplate = {
  id: 'dead_case',
  name: 'The Case That Wouldn\'t Die',
  theme: 'law',
  synopsis: 'a bookkeeper\'s question about trucking invoices turns into a file in the Prosecutor\'s office that never quite closes.',
  roleLabels: { keeper: 'the bookkeeper', investigator: 'the investigator' },
  minWeek: 16,
  weight: 8,
  bind: (s, pick) => {
    const keeper = pick(crew(s).filter((c) => c.alive && !c.dynasty && (c.craft === 'bookmaker' || c.attributes.business >= 60) && c.rank !== 'underboss'));
    const law = s.rivals.find((r) => r.id === 'law');
    const inv = law ? s.characters[law.leaderId] : undefined;
    if (!keeper || !inv?.alive) return undefined;
    return { boss: s.playerId, keeper: keeper.id, investigator: inv.id };
  },
  stages: [
    {
      id: 'audit', title: 'The trucking invoices', wait: [0, 1],
      text: (v) => `${v.n('keeper')} keeps the family's numbers, and has found something he does not like: a trucking company in Rio Grande billing your produce business for four deliveries a week that nobody can remember receiving. He is not accusing anybody. He would just like to know where twelve hundred dollars a month goes.`,
      choices: [
        { id: 'audit', label: 'Bring in an outside accountant ($500)', because: 'had the invoices audited', note: () => 'An accountant from Philadelphia spent a week with the invoices and a cold.', next: 'case', effects: (v) => [{ type: 'money', amount: -500 }, { type: 'evidence', charId: v.s.playerId, amount: -2 }] },
        { id: 'dispute', label: '"Those invoices are fine. Leave them alone."', because: 'told the bookkeeper to leave the invoices alone', note: (v) => `You told ${v.f('keeper')} to leave it. He wrote it down anyway.`, next: 'case', effects: (v) => [grudge(R(v, 'keeper'), v.s.playerId, 15), opn(R(v, 'keeper'), v.s.playerId, -6, 'Told me not to look')] },
        { id: 'burn', label: 'The invoices go in the furnace', detail: 'No paper, no question. Missing paper is also a question.', because: 'burned the trucking invoices', note: () => 'The invoices went in the furnace at the bakery.', next: 'case', effects: (v) => [{ type: 'evidence', charId: v.s.playerId, amount: -3 }, { type: 'heat', bar: 'federal', amount: 3 }] },
      ],
    },
    {
      id: 'case', title: 'A file opens', wait: [8, 12],
      auto: (v) => ({
        note: `${v.n('investigator')}'s office subpoenaed the trucking company's records for an unrelated fraud. The trucking company's books have your produce business's name in them${v.arc.picks.audit === 'dispute' ? ', and someone has been talking to a lawyer about it' : ''}.`,
        effects: [{ type: 'heat', bar: 'federal', amount: v.arc.picks.audit === 'dispute' ? 6 : 3 }],
        next: 'settle',
      }),
    },
    {
      id: 'settle', title: 'The lawyers', wait: [2, 4],
      text: (v) => `The family lawyer lays it out: ${v.n('investigator')} has a file, the file has your company's name, and the file can be closed in court, closed with a check, or kept open for years by a man who likes keeping files open.`,
      choices: [
        { id: 'settle', label: 'Settle the civil side and pay the back taxes ($900)', because: 'settled the trucking case', note: () => 'You paid. The trucking company went bankrupt. The file closed, mostly.', next: 'dormant', effects: () => [{ type: 'money', amount: -900 }, { type: 'heat', bar: 'federal', amount: -4 }] },
        { id: 'fight', label: 'Fight it in court ($500)', because: 'fought the trucking case in court', note: () => 'You fought it. The judge granted a continuance, then another.', next: 'dormant', effects: () => [{ type: 'money', amount: -500 }, { type: 'respect', amount: 1 }] },
        { id: 'records', label: 'Hand over the trucking company\'s records, and only those', detail: 'Lawful cooperation about someone else\'s fraud.', because: 'handed over the trucking company\'s records', note: () => 'You handed over the trucking company\'s records, and nothing else.', next: 'dormant', effects: () => [{ type: 'heat', bar: 'federal', amount: -2 }, { type: 'crewOpinion', amount: -1, reason: 'The boss gave papers to the Prosecutor' }] },
      ],
    },
    {
      id: 'dormant', title: 'Years later', wait: [26, 40],
      auto: (v) => (v.arc.picks.settle === 'settle'
        ? { note: 'A new assistant prosecutor found the old file, read it, and put it back in the drawer.', finish: 'Closed. Really closed, this time.' }
        : { note: `A new assistant prosecutor found the old file and reopened it for a month. ${v.n('investigator')} smiled about it at a Rotary lunch.`, effects: [{ type: 'heat', bar: 'federal', amount: 4 }], finish: 'It will come back. Files like that always do.' }),
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 8. The Shore Election                                               */
/* ------------------------------------------------------------------ */

const election: ArcTemplate = {
  id: 'shore_election',
  name: 'The Shore Election',
  theme: 'town',
  synopsis: 'an incumbent runs again. Who wins is for the voters and the election engine, not for this story.',
  roleLabels: { candidate: 'the incumbent', office: 'the office' },
  minWeek: 4,
  weight: 9,
  cooldown: 100,
  bind: (s, pick) => {
    if (!s.pol) return undefined;
    const now = s.date.y * 12 + s.date.m - 1;
    const up = calendar(s, 1).filter((x) => x.when - now >= 3 && x.when - now <= 9 && x.office.selection === 'elected' && (x.office.level === 'city' || x.office.level === 'county'));
    const race = pick(up);
    if (!race) return undefined;
    const holderId = s.pol.offices[race.office.id]?.holders[race.seats[0]];
    const p = holderId ? getPerson(s, holderId) : undefined;
    if (!p?.alive) return undefined;
    return { boss: s.playerId, candidate: `pol:${p.id}`, office: `office:${race.office.id}@${race.when}` };
  },
  stages: [
    {
      id: 'announce', title: 'He is running again', wait: [0, 1],
      auto: (v) => ({ note: `${v.n('candidate')} announced at a pancake breakfast at the firehouse: ${v.n('office')}, again, in ${mName(whenOf(v))}. The other side has a young man with good teeth and a plan for the boardwalk.`, next: 'debate' }),
    },
    {
      id: 'debate', title: 'The boardwalk question', wait: [2, 6],
      text: (v) => `The campaign is about the boardwalk: tear down the old piers for a new convention hotel, or keep the town the way the summer people like it. ${v.n('candidate')}'s people come to see you. They are not asking for anything, they say, and then they mention the price of radio time.`,
      choices: [
        { id: 'back', label: 'Contribute to his campaign ($800)', because: 'backed the incumbent\'s campaign', note: (v) => `You put money behind ${v.n('candidate')}.`, next: 'election',
          effects: (v) => {
            const e = openElection(v);
            const cand = R(v, 'candidate').slice(4);
            return [{ type: 'money', amount: -800 }, ...(e && e.candidates.some((c) => c.id === cand) ? [{ type: 'pol', op: { op: 'campaign', election: e.id, cand, fund: 800 } } as Effect] : [{ type: 'favor', amount: 1 } as Effect])];
          } },
        { id: 'neutral', label: 'Stay out of it. Shake both their hands.', because: 'stayed neutral in the election', note: () => 'You shook both their hands at the Elks.', next: 'election', effects: () => [] },
        { id: 'other', label: 'Quietly back the young man with the plan ($600)', because: 'backed the challenger', note: () => 'You put money behind the challenger, through a dentist in the Crest.', next: 'election',
          effects: (v) => {
            const e = openElection(v);
            const cand = R(v, 'candidate').slice(4);
            const other = e?.candidates.find((c) => c.id !== cand);
            return [{ type: 'money', amount: -600 }, ...(e && other ? [{ type: 'pol', op: { op: 'campaign', election: e.id, cand: other.id, fund: 600 } } as Effect] : [])];
          } },
      ],
    },
    {
      id: 'election', title: 'Election Day', wait: [1, 2],
      auto: (v) => {
        const now = v.s.date.y * 12 + v.s.date.m - 1;
        const cand = R(v, 'candidate').slice(4);
        if (now <= whenOf(v)) {
          // Waiting for the vote: the arc follows the calendar, one line in the tracker.
          if (v.arc.mem.posters) return { note: '', next: 'election' };
          v.arc.mem.posters = 1;
          return { note: 'The posters are up on every telephone pole on Pacific Avenue.', next: 'election' };
        }
        const res = (v.s.pol?.results ?? []).find((r) => r.office === officeOf(v) && r.when === whenOf(v));
        const holders = v.s.pol?.offices[officeOf(v)]?.holders ?? [];
        const won = res ? res.winners.includes(cand) : holders.includes(cand);
        const head = res?.headline ? `${res.headline}. ` : '';
        return { note: `${head}${won ? `${v.n('candidate')} won another term as ${v.n('office')}.` : `${v.n('candidate')} lost his seat as ${v.n('office')}.`}`, finish: won ? 'The boardwalk question waits for the next election.' : 'The town has new people to talk to.' };
      },
    },
  ],
};

function officeOf(v: ArcView): string {
  return R(v, 'office').slice(7).split('@')[0];
}

function whenOf(v: ArcView): number {
  return Number(R(v, 'office').split('@')[1] ?? 0);
}

function openElection(v: ArcView) {
  return v.s.pol?.elections.find((e) => e.office === officeOf(v) && e.when === whenOf(v));
}

/* ------------------------------------------------------------------ */
/* 9. The Rival on the Boardwalk (seeded by 4)                         */
/* ------------------------------------------------------------------ */

const boardwalkRival: ArcTemplate = {
  id: 'boardwalk_rival',
  name: 'The Rival on the Boardwalk',
  theme: 'business',
  synopsis: 'someone who learned the business in your place opens a place of their own, two blocks down.',
  roleLabels: { founder: 'the new owner' },
  minWeek: 20,
  weight: 0,
  bind: () => undefined,
  stages: [
    {
      id: 'opens', title: 'A new sign two blocks down', wait: [2, 4],
      auto: (v) => ({ note: `${v.n('founder')}'s new club opened on a Friday with a ten-piece band, a line around the block, and three of your best waiters.`, effects: [{ type: 'money', amount: -800 }], next: 'response' }),
    },
    {
      id: 'response', title: 'Compete or cooperate', wait: [4, 8],
      text: (v) => `${v.n('founder')}'s place is full every night. Yours is full on Saturdays. Your capos have ideas, some of them involving the fire marshal. ${v.f('founder')} sends a bottle of champagne and a note: "No hard feelings. There's room on this island for two good rooms."`,
      choices: [
        { id: 'compete', label: 'Compete: a better band, better steaks, lower cover ($400)', because: 'competed with the new club fairly', note: () => 'You hired a better band and cut the cover charge.', next: 'season', effects: () => [{ type: 'money', amount: -400 }, { type: 'respect', amount: 1 }] },
        { id: 'partner', label: `Offer to buy a piece of ${'{founder}'}'s place ($900)`, detail: 'The answer is theirs.', because: 'offered to buy into the rival club', note: (v) => (op(v.s, R(v, 'founder'), v.s.playerId) > -10 ? `${v.f('founder')} said yes, on paper, with ${his(v.c.founder)} own lawyer.` : `${v.f('founder')} said no, politely. You kept your money.`), next: 'season',
          effects: (v) => (op(v.s, R(v, 'founder'), v.s.playerId) > -10 ? [{ type: 'money', amount: -900 }, opn(R(v, 'founder'), v.s.playerId, 10, 'Treated me like a partner')] : []) },
        { id: 'squeeze', label: 'Let the fire marshal take an interest', detail: 'Abstract, legal-looking, and everyone will know.', because: 'sent the fire marshal to the rival club', note: () => 'The fire marshal found the capacity sign was wrong.', next: 'season',
          effects: (v) => [{ type: 'heat', bar: 'local', amount: 4 }, grudge(R(v, 'founder'), v.s.playerId, 25), { type: 'respect', amount: -1 }] },
      ],
    },
    {
      id: 'season', title: 'The end of the season', wait: [10, 18],
      auto: (v) => (v.arc.picks.response === 'squeeze'
        ? { note: `${v.f('founder')}'s club closed for "renovations" and never reopened. Everybody on the boardwalk knows why.`, finish: 'You won. It does not feel like it.' }
        : { note: 'Two good rooms on one strip: the summer people walk from one to the other, and both are full by August.', effects: [{ type: 'money', amount: 1200 }], finish: 'A rival, and a good one. The island is better for it.' }),
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 10. A Crew Becomes a Family                                         */
/* ------------------------------------------------------------------ */

const newCrew: ArcTemplate = {
  id: 'new_crew',
  name: 'A Crew Becomes a Family',
  theme: 'rivals',
  synopsis: 'a few young men have started acting like an outfit of their own.',
  roleLabels: { founder: 'the one they follow' },
  minWeek: 20,
  weight: 8,
  bind: (s, pick) => {
    const f = pick(crew(s).filter((c) => c.alive && !c.dynasty && (c.rank === 'associate' || c.rank === 'soldier') && (hasTrait(c, 'Ambitious') || c.goal === 'become_capo') && op(s, c.id, s.playerId) < 25 && age(s, c) <= 35));
    return f ? { boss: s.playerId, founder: f.id } : undefined;
  },
  stages: [
    {
      id: 'gathering', title: 'Thursday nights at the pizzeria', wait: [0, 1],
      auto: (v) => ({ note: `${v.n('founder')} and five or six young associates meet Thursday nights in the back of a pizzeria in the Crest. They have started calling him by a nickname nobody in the family gave him.`, next: 'noticed' }),
    },
    {
      id: 'noticed', title: 'Somebody noticed', wait: [6, 10],
      text: (v) => `Your capos have noticed ${v.n('founder')}'s Thursday nights. The young men pool their money, run a small dice game of their own, and do not kick up. Nobody has broken a rule, yet. One capo calls it ambition. Another calls it the beginning of something.`,
      choices: [
        { id: 'raise', label: `Give ${'{founder}'} what he wants: real work, his own corner`, because: 'gave the ambitious young man a corner', note: (v) => `You gave ${v.f('founder')} a corner and the young men to work it.`, next: 'identity', effects: (v) => [opn(R(v, 'founder'), v.s.playerId, 14, 'Gave me a chance'), { type: 'policy', charId: R(v, 'founder'), policy: 'earn' }] },
        { id: 'tax', label: 'Let them run their game, and take the family\'s end', because: 'taxed the young men\'s game', note: () => 'The young men kick up now. They do not like it, and they do it.', next: 'identity', effects: (v) => [{ type: 'money', amount: 400 }, opn(R(v, 'founder'), v.s.playerId, -4, 'Taxed our game')] },
        { id: 'break', label: 'Break it up. Every one of them goes to a different capo.', because: 'broke up the young men\'s circle', note: () => 'You broke up the Thursday nights. The pizzeria misses them.', next: 'identity', effects: (v) => [{ type: 'meter', from: R(v, 'founder'), to: v.s.playerId, meter: 'fear', amount: 20 }, opn(R(v, 'founder'), v.s.playerId, -12, 'Broke up my people')] },
      ],
    },
    {
      id: 'identity', title: 'What they became', wait: [16, 26],
      auto: (v) => (op(v.s, R(v, 'founder'), v.s.playerId) >= 5
        ? { note: `${v.f('founder')}'s young men became the hardest-working crew in the family. The old capos complain that they make them look slow.`, effects: [{ type: 'respect', amount: 2 }], finish: 'A crew became part of the family.' }
        : { note: `${v.f('founder')} walked away from the family one night with four of the young men. They run a little dice game in the Crest now, and they do not kick up to anybody.`, effects: [{ type: 'exile', charId: R(v, 'founder') }, { type: 'respect', amount: -1 }], finish: 'A crew became a family of its own.' }),
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 11. The Boss's Judgment                                             */
/* ------------------------------------------------------------------ */

const judgment: ArcTemplate = {
  id: 'judgment',
  name: 'The Boss\'s Judgment',
  theme: 'crew',
  synopsis: 'a capo accuses one of your men of betrayal, and wants a ruling.',
  roleLabels: { accuser: 'the accuser', accused: 'the accused', adviser: 'your adviser' },
  minWeek: 12,
  weight: 9,
  bind: (s) => {
    const ks = capos(s).filter((c) => c.alive);
    const men = crew(s).filter((c) => c.alive && !c.dynasty && (c.rank === 'soldier' || c.rank === 'capo'));
    let best: [Character, Character] | undefined;
    let worst = -10;
    for (const k of ks) for (const m of men) {
      if (k.id === m.id) continue;
      const o = op(s, k.id, m.id);
      if (o < worst) { worst = o; best = [k, m]; }
    }
    const adviser = crew(s).find((c) => (c.rank === 'consigliere' || c.rank === 'underboss') && c.alive && c.id !== best?.[0].id && c.id !== best?.[1].id);
    if (!best || !adviser) return undefined;
    return { boss: s.playerId, accuser: best[0].id, accused: best[1].id, adviser: adviser.id };
  },
  stages: [
    {
      id: 'petition', title: 'A request for judgment', wait: [0, 1],
      text: (v) => `${v.n('accuser')} stands in your office with his hat in his hands and his jaw set. He says ${v.n('accused')} has been holding back money and talking to Atlantic City. ${v.f('accused')} says ${v.f('accuser')} has hated him since a card game in 1957. ${v.n('adviser')} says there is more than one way to find out, and more than one way to be wrong.`,
      choices: [
        { id: 'hear', label: 'Hear them both, separately, and say nothing yet', because: 'heard both sides of the accusation', note: () => 'You heard them both, separately. You said nothing.', next: 'review', effects: () => [] },
        { id: 'mediate', label: 'Sit them down together with the adviser ($200 dinner)', detail: 'Either can refuse to make peace.', because: 'sat the accuser and accused down together', note: (v) => `You sat ${v.n('accuser')} and ${v.n('accused')} at the same table.`, next: 'review',
          effects: (v) => [{ type: 'money', amount: -200 }, opn(R(v, 'accuser'), R(v, 'accused'), 6, 'Sat at the boss\'s table together'), opn(R(v, 'accused'), R(v, 'accuser'), 6, 'Sat at the boss\'s table together')] },
        { id: 'suspend', label: `Take ${'{accused}'} off his work until it is settled`, because: 'suspended the accused man', note: (v) => `You took ${v.f('accused')} off his work while it is looked at.`, next: 'review', effects: (v) => [grudge(R(v, 'accused'), v.s.playerId, 18), opn(R(v, 'accuser'), v.s.playerId, 6, 'Took me seriously')] },
      ],
    },
    {
      id: 'review', title: 'The adviser returns', wait: [2, 4],
      auto: (v) => ({ note: `${v.n('adviser')} came back with what can be known: the money is short by less than ${v.n('accuser')} says and more than ${v.n('accused')} admits, and the Atlantic City part is somebody's cousin's story. It proves nothing either way.`, next: 'verdict' }),
    },
    {
      id: 'verdict', title: 'The ruling', wait: [1, 2],
      text: (v) => `The capos are waiting to see what you do. A ruling against ${v.n('accused')} without proof is a lesson to everyone; so is a ruling for him. ${v.n('accuser')} will not forget either one.`,
      choices: [
        { id: 'withdraw', label: 'Rule there is no case. The accusation is withdrawn.', because: 'threw out the accusation', note: (v) => `You ruled there was no case. ${v.n('accuser')} withdrew it, in front of everyone.`, finish: (v) => `${v.n('accused')} kept his place. ${v.n('accuser')} keeps a list.`,
          effects: (v) => [opn(R(v, 'accused'), v.s.playerId, 12, 'The boss cleared my name'), opn(R(v, 'accuser'), v.s.playerId, -10, 'The boss took his side'), grudge(R(v, 'accuser'), R(v, 'accused'), 10)] },
        { id: 'expel', label: `Put ${'{accused}'} out of the family`, detail: 'A severe ruling, without proof.', because: 'put the accused man out of the family', note: (v) => `You put ${v.f('accused')} out of the family.`, finish: (v) => `${v.f('accused')} left the island. His family stayed, and they remember.`,
          effects: (v) => [{ type: 'exile', charId: R(v, 'accused') }, opn(R(v, 'accuser'), v.s.playerId, 10, 'The boss believed me'), { type: 'crewOpinion', amount: -2, reason: 'A man put out without proof' }] },
        { id: 'open', label: 'Keep it open. Watch them both.', because: 'kept the accusation open', note: () => 'You kept the matter open. Everyone is watching everyone.', finish: () => 'An open question in the family, which is a kind of answer.',
          effects: (v) => [opn(R(v, 'accuser'), v.s.playerId, -3, 'No ruling'), opn(R(v, 'accused'), v.s.playerId, -3, 'Still under suspicion')] },
      ],
    },
  ],
};

export const ARC_TEMPLATES: ArcTemplate[] = [crown, rat, emptyChair, velvet, restaurant, daughterLaw, deadCase, election, boardwalkRival, newCrew, judgment];

registerArcTemplates(ARC_TEMPLATES);

