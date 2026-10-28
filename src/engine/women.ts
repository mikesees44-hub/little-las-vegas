import { displayName, hasTrait, player } from './characters';
import { adultOn } from './datingState';
import { applyEffects } from './effects';
import { famMut } from './familyState';
import { money, type Ctx } from './ledger';
import { hist, nlog, syncProvider } from './nightlife';
import { ADULT_ROLES } from './nightlifeState';
import { pressItem } from './paper';
import { spendPocket } from './pocket';
import { defectTo } from './regimes';
import { addOpinion, changeMeter, opinion } from './relations';
import { drawnTo, kin } from './romance';
import { careersWeek, careersYear } from './womenCareers';
import {
  applyDinner, applyNight, askBlock, babyEvent, dinnerAcceptance, discoveryWeek, endAffair, herPick, HELP_REASON, husbandReacts, lastEvent,
  motiveOf, nightAcceptance, plotsWeek, pregnancyRisk, propEvent, pursueAcceptance, realEvent, settingView, wev,
} from './womenAffairs';
import {
  $, affairFor, affairOf, ageOf, clamp, isAdultC, manOf, marriedOf, roll, WX, wifeFor, wlog, womanBlock,
} from './womenCore';
import {
  BASIS_TEXT, ensureWomen, REQ_TEXT, SETTING_INFO, STAGE_TEXT,
  type Hook, type Motive, type ReqWhy, type Setting, type Talent, type WomenState,
} from './womenState';
import type { ActionPreview } from './actions';
import type { Character, Effect, EventInstance, GameState, PlayerAction, RivalId } from './types';

/**
 * THE WOMEN: orders, answers and the week (state in womenState.ts; careers
 * in womenCareers.ts; affairs, discovery and pregnancy in womenAffairs.ts;
 * the dossier in dossier.ts).
 *
 * Orders (each one hers to accept or refuse; a no is recorded and respected):
 * a dinner on the town, an affair, an evening in a setting she agrees to, a
 * gift, a voluntary arrangement, ending it, signing her with the boss's
 * company, using a hook (a favor, or a tabloid rumor once she has left the
 * company), making amends. Events: office requests (help is never
 * conditional), propositions, "this is the last time", "I want something
 * real", the baby, her husband at the office door, a made man she grew
 * close to.
 *
 * Adults only at every list, preview, commit and week; Mature content Off
 * hides and stops all of it.
 */

export type GiftSize = 'small' | 'fine' | 'lavish';
export const GIFT_INFO: Record<GiftSize, { label: string; cost: number; aff: number }> = {
  small: { label: 'Flowers and a card', cost: 25, aff: 3 },
  fine: { label: 'A silk scarf from Philadelphia', cost: 150, aff: 7 },
  lavish: { label: 'A gold bracelet', cost: 600, aff: 12 },
};

export type WomenAction =
  | { op: 'askOut'; id: string }
  | { op: 'pursue'; id: string }
  | { op: 'night'; id: string; at: Setting }
  | { op: 'gift'; id: string; size: GiftSize }
  | { op: 'arrange'; id: string; weekly: number }
  | { op: 'end'; id: string }
  | { op: 'sign'; id: string; kind: Talent['kind'] }
  | { op: 'hook'; hook: string; how: 'favor' | 'rumor' }
  | { op: 'amends'; id: string };

/** Answers and outcomes (effects). */
export type WomenOp =
  | { op: 'did'; a: WomenAction }
  | { op: 'no'; id: string; what: 'askOut' | 'pursue' | 'night' | 'arrange' | 'sign'; at?: Setting }
  | { op: 'req'; rid: string; how: 'pay' | 'family' | 'job' | 'decline' }
  | { op: 'prop'; id: string; how: 'yes' | 'pro' | 'no'; why: Motive }
  | { op: 'last'; id: string; how: 'accept' | 'talk' }
  | { op: 'real'; id: string; how: 'more' | 'honest' }
  | { op: 'baby'; id: string; how: 'support' | 'acknowledge' | 'distance' }
  | { op: 'husband'; id: string; how: 'apologize' | 'deny' | 'nothing' }
  | { op: 'close'; id: string; how: 'let' | 'warn' | 'amends' };

export { WOMEN_HOURS } from './womenState';

/** How long a hook lasts (CK3: weak hooks fade). */
export const HOOK_WEEKS = 156;
export const SIGN_COST = 1500;

const W_ = (op: WomenOp, label: string) => WX(op, label);
const first = (s: GameState, id: string) => s.characters[id]?.firstName ?? 'her';

/* ------------------------------------------------------------------ */
/* Previews                                                            */
/* ------------------------------------------------------------------ */

function base(title: string, because: string, disabledReason?: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event', disabledReason };
}

/** The boss's company: a label, a talent agency, a picture outfit. */
export function companyOf(s: GameState): string | undefined {
  return s.businesses.find((b) => b.owner === 'player' && (b.kind === 'talent' || b.kind === 'label' || b.kind === 'filmdist'))?.name;
}

export function previewWomen(s: GameState, a: WomenAction): ActionPreview {
  if (a.op === 'hook') return previewHook(s, a.hook, a.how);
  const c = s.characters[a.id];
  const her = c?.firstName ?? 'her';
  const blk = womanBlock(s, a.id);
  if (blk || !c) return base(`${a.op}: ${her}`, `tried with ${her}`, blk ?? 'Nobody');
  const af = affairOf(s, a.id);
  switch (a.op) {
    case 'askOut': {
      const why = askBlock(s, c) ?? (af && (af.stage === 'affair') ? 'You are already seeing her' : undefined);
      return {
        ...base(`Ask ${her} to dinner on the town`, `asked ${her} to dinner`, why), cost: 60, pot: 'pocket',
        detail: `Dinner, the clubs, seen out together: people will see. ${her} decides.${marriedOf(s, c) ? ' She is married; her husband may hear of it.' : ''}`,
        effects: [{ type: 'money', pot: 'pocket', amount: -60, label: `Dinner with ${her}` }, W_({ op: 'did', a }, `Dinner with ${her}`)],
        acceptance: dinnerAcceptance(s, c), refuseEffects: [W_({ op: 'no', id: a.id, what: 'askOut' }, `${her} said no`)],
        warning: manOf(s, c)?.faction === 'player' ? 'Her husband is one of your men. If he finds out, so does the crew.' : undefined,
      };
    }
    case 'pursue': {
      const why = askBlock(s, c) ?? (!af || (af.stage !== 'dating' && !af.initiated) ? 'Have dinner with her first' : af.stage === 'affair' ? 'It is already an affair' : undefined);
      return {
        ...base(`Tell ${her} you want more than dinner`, `pursued ${her}`, why),
        detail: `An affair, if she wants one. She can say no, and that is the end of the asking for a while; twice, and the door is closed.`,
        effects: [W_({ op: 'did', a }, `${her} and you`)], acceptance: pursueAcceptance(s, c), refuseEffects: [W_({ op: 'no', id: a.id, what: 'pursue' }, `${her} said no`)],
      };
    }
    case 'night': {
      const v = settingView(s, c, a.at);
      const info = SETTING_INFO[a.at];
      const cool = s.women?.cool[`night:${a.id}`];
      const why = !af || af.stage !== 'affair' ? 'Only if you are seeing each other and she wants to' : v.no ? `${v.no}. She would rather: ${SETTING_INFO[herPick(s, c)].label.toLowerCase()}` : af.nights.includes(s.week) || (cool !== undefined && s.week - cool < 2) ? 'Not this week' : undefined;
      const risk = pregnancyRisk(s, c, (af?.n ?? 0) + 1);
      return {
        ...base(`An evening with ${her}: ${info.label.toLowerCase()}`, `spent an evening with ${her}`, why), cost: info.cost, pot: info.cost ? 'pocket' : undefined,
        detail: `${info.text} She can agree, say where she would rather, or say no. Fade to black. Pregnancy risk over all your nights: ${risk.word}.`,
        effects: [...(info.cost ? [{ type: 'money', pot: 'pocket', amount: -info.cost, label: info.label } as Effect] : []), W_({ op: 'did', a }, `An evening with ${her}`)],
        acceptance: nightAcceptance(s, c, a.at), refuseEffects: [W_({ op: 'no', id: a.id, what: 'night', at: a.at }, `${her} said not tonight`)],
      };
    }
    case 'gift': {
      const g = GIFT_INFO[a.size];
      const closed = af?.closed !== undefined || (af?.stage === 'ended' && af.ended?.by !== 'boss');
      return {
        ...base(`${g.label} for ${her}`, `sent ${her} a gift`, closed ? 'She ended it. A gift won\'t change that' : undefined), cost: g.cost, pot: 'pocket',
        detail: `A gesture. It warms her a little, less each time; it buys nothing.${a.size === 'lavish' && marriedOf(s, c) ? ' A gold bracelet her husband never bought her raises questions at home.' : ''}`,
        effects: [{ type: 'money', pot: 'pocket', amount: -g.cost, label: g.label }, W_({ op: 'did', a }, `A gift for ${her}`)],
      };
    }
    case 'arrange': {
      const why = !af || af.stage !== 'affair' ? 'Only inside an affair she wants' : af.arrangement ? 'There is one already' : undefined;
      const p = s.nightlife?.people[a.id];
      return {
        ...base(`Offer ${her} an arrangement: ${$(a.weekly)} a week`, `offered ${her} an arrangement`, why),
        detail: `Money every week from your pocket, while it lasts, on her terms; she can end it any week. Some women take it as help; some as an insult.`,
        effects: [W_({ op: 'did', a }, `${her}'s arrangement`)],
        acceptance: { chance: Math.max(0.05, Math.min(0.85, (20 + (p && ADULT_ROLES.includes(p.role) ? 30 : 0) + (af?.aff ?? 0) / 3 - (hasTrait(c, 'Pious') || hasTrait(c, 'Honest') ? 20 : 0) - (marriedOf(s, c) ? 10 : 0)) / 100)), reasons: [{ label: 'Her feelings', value: Math.round((af?.aff ?? 0) / 3) }, ...(p && ADULT_ROLES.includes(p.role) ? [{ label: 'It is how she lives', value: 30 }] : []), ...(marriedOf(s, c) ? [{ label: 'Married', value: -10 }] : [])] },
        refuseEffects: [W_({ op: 'no', id: a.id, what: 'arrange' }, `${her} said no`)],
      };
    }
    case 'end':
      return { ...base(`End it with ${her}`, `ended it with ${her}`, !af || af.stage === 'ended' || af.stage === 'interest' ? 'Nothing to end' : undefined), detail: af && af.aff >= 50 ? 'Her feelings run deep: it will hurt her.' : 'She may be relieved.', effects: [W_({ op: 'did', a }, `It ends with ${her}`)] };
    case 'sign': {
      const co = companyOf(s);
      const t = s.women?.talent[a.id];
      const p = s.nightlife?.people[a.id];
      const amb = s.women?.arcs[a.id]?.amb;
      const why = !co ? 'You need a company of your own: a talent agency, a record label or a picture outfit' : t && t.left === undefined ? 'She is already under contract' : t?.left !== undefined ? 'She left your company' : s.money < SIGN_COST ? `Needs ${$(SIGN_COST)}` : undefined;
      const reasons = [{ label: 'She wants to be somebody', value: amb === 'fame' || amb === 'films' ? 35 : 0 }, { label: 'Her talent', value: Math.round((p?.talent ?? 40) / 4) }, { label: 'What she thinks of you', value: Math.round(opinion(s, a.id, s.playerId) / 3) }];
      return {
        ...base(`Sign ${her} with ${co ?? 'your company'} (${a.kind === 'actress' ? 'pictures' : a.kind === 'singer' ? 'records' : 'publicity'})`, `signed ${her}`, why), cost: SIGN_COST,
        detail: `Lessons, a photographer, a publicity man: ${$(SIGN_COST)} from the Family. It improves her chances; it guarantees nothing, and she can leave. Your company takes a share of what she earns.`,
        effects: [{ type: 'money', amount: -SIGN_COST, label: `${her}: lessons and publicity`, category: 'business' }, W_({ op: 'did', a }, `${her} signs`)],
        acceptance: { chance: Math.max(0.05, Math.min(0.9, (20 + reasons.reduce((x, r) => x + r.value, 0)) / 100)), reasons: [{ label: 'Base', value: 20 }, ...reasons.filter((r) => r.value)] },
        refuseEffects: [W_({ op: 'no', id: a.id, what: 'sign' }, `${her} said no`)],
      };
    }
    case 'amends': {
      const p = s.nightlife?.people[a.id];
      const cl = s.women?.close[a.id];
      const why = opinion(s, a.id, s.playerId) > 10 && !cl && p?.scorned === undefined ? 'Nothing to make amends for' : undefined;
      return { ...base(`Make amends with ${her}`, `made amends with ${her}`, why), cost: 200, pot: 'pocket', detail: 'An apology in person and something to show you mean it. It helps; it does not erase.', effects: [{ type: 'money', pot: 'pocket', amount: -200, label: `Amends: ${her}` }, W_({ op: 'did', a }, `Amends with ${her}`)] };
    }
  }
}

function hookOf(s: GameState, id: string): Hook | undefined {
  return s.women?.hooks.find((h) => h.id === id);
}

/** Is a hook usable now (holder is the boss and alive; not expired; one use)? */
export function hookLive(s: GameState, h: Hook): boolean {
  const holder = s.characters[h.holder];
  return h.status === 'active' && h.holder === s.playerId && !!holder?.alive && s.week < h.expires;
}

function previewHook(s: GameState, id: string, how: 'favor' | 'rumor'): ActionPreview {
  const h = hookOf(s, id);
  const c = h ? s.characters[h.target] : undefined;
  const her = c?.firstName ?? 'her';
  const t = h ? s.women?.talent[h.target] : undefined;
  const why = !adultOn(s) ? 'Mature content is Off in Settings' : !h || !c ? 'No such hook' : !hookLive(s, h) ? (h.status === 'used' ? 'Used already' : 'It has expired') : !c.alive ? 'She has died' : !isAdultC(s, c) ? 'Adults only' : how === 'rumor' && t?.left === undefined ? 'Only if she leaves your company' : undefined;
  return {
    ...base(how === 'favor' ? `Call in a favor from ${her}` : `Give the Leader a story about ${her}`, how === 'favor' ? `called in a favor from ${her}` : `planted a story about ${her}`, why),
    detail: how === 'favor'
      ? `One time: she headlines a night at your club, because of ${h ? BASIS_TEXT[h.basis] : 'what you know'}. A hook buys a favor, never anything personal. She will hate you for it, and it may get around.`
      : `An item for the gossip column. The paper may not run it; she may answer it; other talent will hear what you did. One time, and the hook is spent.`,
    effects: [W_({ op: 'did', a: { op: 'hook', hook: id, how } }, how === 'favor' ? `A favor from ${her}` : `A story about ${her}`)],
    warning: 'Her hatred; your reputation.',
  };
}

/* ------------------------------------------------------------------ */
/* Lists (the calling card / dossier / the dialogue window)            */
/* ------------------------------------------------------------------ */

/** Every order on her that makes sense to show now (blocked ones carry their reason). Empty when nothing is allowed at all. */
export function womenActionsFor(s: GameState, id: string): PlayerAction[] {
  const c = s.characters[id];
  if (!c || womanBlock(s, id)) return [];
  const af = affairOf(s, id);
  const out: WomenAction[] = [];
  if (!af || af.stage === 'interest' || af.stage === 'dating' || af.stage === 'ended') out.push({ op: 'askOut', id });
  if (af?.stage === 'dating' || af?.initiated) out.push({ op: 'pursue', id });
  if (af?.stage === 'affair') {
    out.push({ op: 'night', id, at: herPick(s, c) }, { op: 'gift', id, size: 'fine' });
    if (!af.arrangement) out.push({ op: 'arrange', id, weekly: 75 });
    out.push({ op: 'end', id });
  } else if (af && af.stage !== 'ended') out.push({ op: 'gift', id, size: 'small' });
  if (companyOf(s) && !s.women?.talent[id]) out.push({ op: 'sign', id, kind: s.nightlife?.people[id]?.role === 'singer' ? 'singer' : 'actress' });
  const p = s.nightlife?.people[id];
  if (s.women?.close[id] || p?.scorned !== undefined || opinion(s, id, s.playerId) < -20) out.push({ op: 'amends', id });
  for (const h of s.women?.hooks ?? []) if (h.target === id && hookLive(s, h)) out.push({ op: 'hook', hook: h.id, how: 'favor' }, { op: 'hook', hook: h.id, how: 'rumor' });
  return out.map((op) => ({ kind: 'women', op }) as PlayerAction);
}

export interface WomenChoice { key: string; label: string; line: string; action: PlayerAction; odds?: number; block?: string }

/** The same choices as data a dialogue window can render (label, the line he says, her odds, the block). */
export function womenChoices(s: GameState, id: string): WomenChoice[] {
  const LINES: Partial<Record<WomenAction['op'], string>> = {
    askOut: '"Have dinner with me. Somewhere with a band."', pursue: '"I don\'t want this to end at dinner."', night: '"Spend the evening with me."', gift: '"I saw this and thought of you."',
    arrange: '"Let me help. No strings you don\'t choose."', end: '"We should stop."', sign: '"You could be somebody. Let me help."', amends: '"I was wrong. I\'m sorry."', hook: '"You owe me one, and we both know why."',
  };
  return womenActionsFor(s, id).map((a, i) => {
    const op = (a as Extract<PlayerAction, { kind: 'women' }>).op;
    const p = previewWomen(s, op);
    return { key: `${op.op}:${i}`, label: p.title, line: LINES[op.op] ?? '', action: a, odds: p.acceptance?.chance, block: p.disabledReason };
  });
}

export function describeWomenOp(s: GameState, o: WomenOp): string | undefined {
  const her = 'id' in o ? first(s, o.id) : 'her';
  switch (o.op) {
    case 'did': {
      const a = o.a;
      const n = 'id' in a ? first(s, a.id) : 'her';
      return a.op === 'askOut' ? `Dinner on the town with ${n}` : a.op === 'pursue' ? `${n} and you: an affair, if she wants it` : a.op === 'night' ? `An evening with ${n} (${SETTING_INFO[a.at].label.toLowerCase()})` : a.op === 'gift' ? `A gift for ${n}` : a.op === 'arrange' ? `${$(a.weekly)} a week to ${n}, while she wants it` : a.op === 'end' ? `It ends with ${n}` : a.op === 'sign' ? `${n} under contract with your company` : a.op === 'amends' ? `Amends with ${n}` : 'A hook spent';
    }
    case 'no': return undefined;
    case 'req': return o.how === 'pay' ? 'Paid from your pocket; she owes nothing' : o.how === 'family' ? 'The Family covers it' : o.how === 'job' ? 'Work for her husband' : 'Turned away';
    case 'prop': return o.how === 'yes' ? `It begins with ${her}` : o.how === 'pro' ? `Business with ${her}` : `No to ${her}`;
    case 'last': return o.how === 'accept' ? `${her} is ending it` : `You ask ${her} to talk; she decides`;
    case 'real': return o.how === 'more' ? `A promise to ${her}: twelve weeks` : `The truth to ${her}`;
    case 'baby': return o.how === 'support' ? 'Quiet support' : o.how === 'acknowledge' ? 'The child acknowledged, publicly' : 'You step back';
    case 'husband': return o.how === 'apologize' ? 'An apology and an envelope' : o.how === 'deny' ? 'A denial' : 'A humiliation';
    case 'close': return o.how === 'let' ? 'You let it be' : o.how === 'warn' ? 'He is warned off' : 'Amends with her';
  }
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

export function applyWomenOp(ctx: Ctx, o: WomenOp): void {
  const s = ctx.s;
  if (!adultOn(s)) return;
  const W = ensureWomen(s);
  const boss = player(s);
  if (o.op === 'req') { answerReq(ctx, W, o.rid, o.how); return; }
  if (o.op === 'did' && o.a.op === 'hook') { useHook(ctx, W, o.a.hook, o.a.how); return; }
  const id = o.op === 'did' ? (o.a as Exclude<WomenAction, { op: 'hook' }>).id : o.id;
  const c = s.characters[id];
  // Adults only, re-checked when it happens.
  if (!c?.alive || !isAdultC(s, c) || !isAdultC(s, boss) || kin(boss, c) || c.id === boss.spouseId) return;
  switch (o.op) {
    case 'no': {
      const af = affairFor(s, id);
      W.stats.refused++;
      if (o.what === 'night') { W.cool[`night:${id}`] = s.week; wlog(W, s, `${c.firstName} said not tonight${o.at ? ` (not ${SETTING_INFO[o.at].label.toLowerCase()}; she would rather ${SETTING_INFO[herPick(s, c)].label.toLowerCase()})` : ''}.`); return; }
      if (o.what === 'sign' || o.what === 'arrange') { wlog(W, s, `${c.firstName} said no (${o.what === 'sign' ? 'your company' : 'an arrangement'}). That is her right.`); return; }
      af.refused.push(s.week);
      if (af.refused.length > 4) af.refused.splice(0, af.refused.length - 4);
      if (af.refused.length >= 2) af.closed = s.week;
      wlog(W, s, `${c.firstName} said no (${o.what === 'askOut' ? 'dinner' : 'more than dinner'}). ${af.closed !== undefined ? 'She has closed the door.' : 'That is her right.'}`);
      return;
    }
    case 'did': {
      const a = o.a;
      const blk = womanBlock(s, id);
      if (blk) return;
      const af = affairFor(s, id);
      if (a.op === 'askOut') { if (askBlock(s, c)) return; applyDinner(ctx, W, af, c); }
      else if (a.op === 'pursue') {
        if (askBlock(s, c) || af.stage === 'affair') return;
        af.stage = 'affair';
        af.since = s.week;
        af.aff = clamp(af.aff + 8);
        wlog(W, s, `${c.firstName} ${c.lastName} and you: it is an affair now. Her choice.`);
      } else if (a.op === 'night') {
        if (af.stage !== 'affair' || settingView(s, c, a.at).no || af.nights.includes(s.week)) return;
        applyNight(ctx, W, af, c, a.at);
      } else if (a.op === 'gift') {
        if (af.closed !== undefined || (af.stage === 'ended' && af.ended?.by !== 'boss')) return;
        af.gifts++;
        af.lastGift = s.week;
        af.aff = clamp(af.aff + GIFT_INFO[a.size].aff / (1 + af.gifts * 0.35));
        if (a.size === 'lavish' && marriedOf(s, c)) af.known.push({ w: 'home', how: 'told', week: s.week });
        wlog(W, s, `You sent ${c.firstName} ${GIFT_INFO[a.size].label.toLowerCase()}.`);
      } else if (a.op === 'arrange') {
        if (af.stage !== 'affair' || af.arrangement) return;
        af.arrangement = { weekly: Math.max(25, Math.round(a.weekly)), since: s.week };
        wlog(W, s, `${c.firstName} agreed to an arrangement: ${$(af.arrangement.weekly)} a week, on her terms.`);
      } else if (a.op === 'end') {
        if (af.stage === 'ended' || af.stage === 'interest') return;
        endAffair(ctx, W, af, c, 'boss', 'You ended it.');
      } else if (a.op === 'sign') signHer(ctx, W, c, a.kind);
      else if (a.op === 'amends') {
        addOpinion(s, id, boss.id, 'He apologized', 10, 1);
        const p = s.nightlife?.people[id];
        if (p) p.scorned = undefined;
        const cl = W.close[id];
        if (cl) cl.level = clamp(cl.level - 25);
        wlog(W, s, `You made amends with ${c.firstName}.`);
      }
      return;
    }
    case 'prop': {
      const af = affairFor(s, id);
      W.cool[`prop:${id}`] = s.week;
      if (o.how === 'yes') {
        af.initiated = o.why;
        af.closed = undefined;
        af.refused = [];
        // She asked: it is an affair if he says yes (every evening is still hers to agree to).
        af.stage = 'affair';
        af.ended = undefined;
        af.since = s.week;
        af.aff = clamp(af.aff + 10);
        wlog(W, s, `${c.firstName} ${c.lastName} came to you, and you said yes.`);
      } else if (o.how === 'pro') {
        addOpinion(s, id, boss.id, o.why === 'power' || o.why === 'protection' ? 'He kept it business, and fair' : 'He kept it business', o.why === 'love' ? -2 : 2, 1);
        wlog(W, s, `You kept it business with ${c.firstName}.`);
      } else {
        addOpinion(s, id, boss.id, 'He turned me down', -3, 1);
        wlog(W, s, `You turned ${c.firstName} down, kindly.`);
      }
      return;
    }
    case 'last': {
      const af = affairOf(s, id);
      if (!af || af.stage === 'ended') return;
      if (o.how === 'talk' && roll(`${s.seed}|${s.week}|wtalk|${id}`) < 0.3) { af.guilt = clamp(af.guilt - 15); W.cool[`last:${id}`] = s.week; wlog(W, s, `${c.firstName} listened, and stayed. For now.`); return; }
      // Her choice: one last evening, or now.
      if (roll(`${s.seed}|${s.week}|wlast|${id}`) < 0.5) { af.last1 = s.week; wlog(W, s, `${c.firstName}: one last evening, and then it is over. Her terms.`); }
      else endAffair(ctx, W, af, c, 'her', '"This is the last time." She meant it.');
      return;
    }
    case 'real': {
      const af = affairOf(s, id);
      if (!af || af.stage !== 'affair') return;
      W.cool[`real:${id}`] = s.week;
      if (o.how === 'more') { af.promised = s.week + 12; af.aff = clamp(af.aff + 5); wlog(W, s, `You promised ${c.firstName} more of you.`); }
      else if (roll(`${s.seed}|${s.week}|whonest|${id}`) < 0.5) endAffair(ctx, W, af, c, 'her', 'You told her the truth, and she ended it.');
      else { addOpinion(s, id, boss.id, 'He told me the truth', 4, 1); wlog(W, s, `${c.firstName} took the truth better than you expected.`); }
      return;
    }
    case 'baby': {
      const af = affairOf(s, id);
      if (!af?.preg) return;
      if (o.how === 'support') { addOpinion(s, id, boss.id, 'He stood behind me', 15, 1); af.aff = clamp(af.aff + 6); }
      else if (o.how === 'distance') { addOpinion(s, id, boss.id, 'He walked away from his child', -25, 0); const p = s.nightlife?.people[id]; if (p) p.scorned = s.week; }
      else {
        af.ack = true;
        addOpinion(s, id, boss.id, 'He said it was his, out loud', 20, 1);
        const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
        applyEffects(ctx, [{ type: 'respect', amount: -1, label: 'The boss\'s child by another woman' }, { type: 'familyOpinion', amount: -2, reason: 'The boss\'s private life is everybody\'s business', label: 'Talk in the family' },
          ...(wife?.alive ? [{ type: 'opinion', from: wife.id, to: boss.id, amount: -25, reason: 'Another woman\'s child, and everybody knows', decay: 1, label: 'Your wife heard' } as Effect] : [])], { label: 'Acknowledged', because: `acknowledged ${c.firstName}'s child`, category: 'event' });
        const m = manOf(s, c);
        if (m && af.husbandKnew === undefined) husbandReacts(ctx, W, af, c, m);
      }
      wlog(W, s, `${c.firstName}'s baby: ${describeWomenOp(s, o)}.`);
      return;
    }
    case 'husband': {
      const af = affairOf(s, id);
      const m = manOf(s, c);
      if (!af || !m) return;
      if (o.how === 'deny') {
        const thin = af.known.filter((k) => k.how !== 'witness').length <= 1;
        if (thin && roll(`${s.seed}|${s.week}|wdeny|${m.id}`) < 0.5) {
          af.husbandKnew = undefined;
          addOpinion(s, m.id, boss.id, 'Swore it wasn\'t true', -5, 1);
          changeMeter(s, m.id, boss.id, 'grievance', 10);
          wlog(W, s, `${m.firstName} believed you. Mostly.`);
          ctx.log.push(`${m.firstName} believed you. Mostly.`);
          return;
        }
        husbandReacts(ctx, W, af, c, m, 'hard');
      } else husbandReacts(ctx, W, af, c, m, o.how === 'apologize' ? 'soft' : 'hard');
      return;
    }
    case 'close': {
      const cl = W.close[id];
      const man = cl ? s.characters[cl.man] : undefined;
      if (!cl || !man) return;
      if (o.how === 'let') addOpinion(s, man.id, boss.id, 'He let it be', 3, 1);
      else if (o.how === 'warn') { addOpinion(s, man.id, boss.id, 'Warned me off her', -15, 1); addOpinion(s, id, boss.id, 'He had his man warned off me', -10, 1); cl.level = clamp(cl.level - 30); cl.warned = s.week; }
      else { spendPocket(ctx, 200, `Amends: ${c.firstName}`, `wamends:${id}`); addOpinion(s, id, boss.id, 'He apologized', 12, 1); cl.level = clamp(cl.level - 25); const p = s.nightlife?.people[id]; if (p) p.scorned = undefined; }
      wlog(W, s, `${c.firstName} and ${man.firstName}: ${describeWomenOp(s, o)}.`);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Talent and hooks                                                    */
/* ------------------------------------------------------------------ */

/** Did she work in the trade (what the boss knows about her past)? */
function hasPast(s: GameState, id: string): boolean {
  const p = s.nightlife?.people[id];
  return !!p && (ADULT_ROLES.includes(p.role) || p.role === 'adultfilm' || p.hist.some(([, t]) => /payroll|evening|price/i.test(t)) || (s.dating?.providers[id] !== undefined));
}

function signHer(ctx: Ctx, W: WomenState, c: Character, kind: Talent['kind']): void {
  const s = ctx.s;
  if (W.talent[c.id] || !companyOf(s)) return;
  const p = s.nightlife?.people[c.id];
  W.talent[c.id] = { kind, since: s.week, fame: clamp((p?.talent ?? 35) / 3) };
  addOpinion(s, c.id, s.playerId, 'He believed in me', 8, 1);
  if (p) hist(p, s, `Signed with ${companyOf(s)}.`);
  wlog(W, s, `${c.firstName} ${c.lastName} signed with ${companyOf(s)}.`);
  if (hasPast(s, c.id)) addHook(s, W, c.id, 'past');
}

export function addHook(s: GameState, W: WomenState, target: string, basis: Hook['basis']): Hook | undefined {
  if (W.hooks.some((h) => h.target === target && h.holder === s.playerId && h.status === 'active')) return undefined;
  const h: Hook = { id: `wh${s.nextId++}`, holder: s.playerId, target, basis, made: s.week, expires: s.week + HOOK_WEEKS, status: 'active' };
  W.hooks.push(h);
  W.stats.hooks++;
  if (W.hooks.length > 20) {
    const i = W.hooks.findIndex((x) => x.status !== 'active');
    W.hooks.splice(i >= 0 ? i : 0, 1);
  }
  return h;
}

function useHook(ctx: Ctx, W: WomenState, id: string, how: 'favor' | 'rumor'): void {
  const s = ctx.s;
  const h = W.hooks.find((x) => x.id === id);
  if (!h || !hookLive(s, h)) return;
  const c = s.characters[h.target];
  if (!c?.alive || !isAdultC(s, c)) return;
  const t = W.talent[c.id];
  if (how === 'rumor' && t?.left === undefined) return;
  h.status = 'used';
  h.used = { week: s.week, how };
  W.stats.hooksUsed++;
  const boss = player(s);
  const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: how === 'favor' ? `called in a favor from ${c.firstName}` : `planted a story about ${c.firstName}`, category: 'event' });
  addOpinion(s, c.id, boss.id, 'He used what he knew against me', how === 'favor' ? -30 : -50, 0);
  const p = s.nightlife?.people[c.id];
  if (p) p.grudge = s.week;
  if (how === 'favor') {
    const take = 300 + (t?.fame ?? 10) * 20;
    money(ctx, take, `${c.firstName} headlined a night at your club (a favor)`, 'business');
    if ((p?.discretion ?? 50) < 60 || roll(`${s.seed}|whookout|${id}`) < 0.3) fx([{ type: 'respect', amount: -1, label: 'Word got around how you got her' }], 'Word got around');
    wlog(W, s, `${c.firstName} ${c.lastName} did you the favor, and will never forgive it.`);
  } else {
    const runs = roll(`${s.seed}|whookrun|${id}`) < 0.6;
    if (runs) {
      pressItem(s, { s: 'spout', b: `A certain songbird who just left a local outfit for the big city might not want her new friends to know where she got her start on the island.`, a: 'town' });
      if (t) t.fame = clamp(t.fame - 25);
      fx([{ type: 'respect', amount: -1, label: 'Everybody knows where that story came from' }], 'The story ran');
    }
    for (const [oid, ot] of Object.entries(W.talent)) if (oid !== c.id && ot.left === undefined) addOpinion(s, oid, boss.id, 'He\'d do it to any of us', -10, 1);
    wlog(W, s, runs ? `The Leader ran the item about ${c.firstName}. She answered it in the Daily Tide.` : `The Leader's editor passed on the item about ${c.firstName}. She heard about it anyway.`);
  }
}

function talentWeek(ctx: Ctx, W: WomenState): void {
  const s = ctx.s;
  for (const [id, t] of Object.entries(W.talent)) {
    const c = s.characters[id];
    if (!c?.alive || !isAdultC(s, c)) { delete W.talent[id]; continue; }
    if (t.left !== undefined) continue;
    const p = s.nightlife?.people[id];
    const tal = p?.talent ?? 40;
    if (s.week % 2 === 0) t.fame = clamp(t.fame + (tal >= 60 ? 2 : 1));
    if (t.fame >= 10 && companyOf(s)) money(ctx, Math.round(t.fame * 4), `${c.firstName} ${c.lastName}'s contract (your company's share)`, 'business');
    if (p && t.fame >= 40 && t.kind !== 'celebrity' && p.role !== 'actress' && p.role !== 'recording') {
      p.role = t.kind === 'singer' ? 'recording' : 'actress';
      p.price = 0;
      p.payroll = undefined;
      hist(p, s, t.kind === 'singer' ? 'Her first record is on the radio.' : 'Her first real part, in a picture.');
      if (s.nightlife) nlog(s.nightlife, s, `${c.firstName} ${c.lastName} is ${t.kind === 'singer' ? 'on the radio' : 'in pictures'} now.`);
      syncProvider(s, p);
    }
    const op = opinion(s, id, s.playerId);
    const leave = 0.01 + (op < -10 ? 0.05 : 0) + (t.fame >= 60 ? 0.02 : 0) + (!companyOf(s) ? 0.3 : 0);
    if (roll(`${s.seed}|${s.week}|wleave|${id}`) < leave) {
      t.left = s.week;
      t.why = op < -10 ? 'how she was treated' : !companyOf(s) ? 'your company closed' : 'a bigger outfit in New York';
      wlog(W, s, `${c.firstName} ${c.lastName} left your company (${t.why}).`);
      ctx.log.push(`${c.firstName} ${c.lastName} left your company.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Office requests (help is never conditional)                         */
/* ------------------------------------------------------------------ */

export const REQ_AMOUNT: Record<ReqWhy, number> = { rent: 120, groceries: 60, doctor: 200, business: 1500, inside: 300, funeral: 400 };

interface Asker { her: Character; man?: Character; why: ReqWhy; known: string }

function askers(s: GameState): Asker[] {
  const out: Asker[] = [];
  for (const m of Object.values(s.characters)) {
    if (!m.alive || m.faction !== 'player' || m.gender !== 'M' || m.id === s.playerId || ageOf(s, m) < 20) continue;
    if (!m.spouseId && !m.household?.wife) continue;
    const kids = m.household?.kids.length ?? 0;
    const inside = !!m.imprisonedUntil && m.imprisonedUntil > s.week;
    const earn = m.lastEarn ?? 0;
    const why: ReqWhy | undefined = inside ? 'inside' : earn < 150 && m.wealth < 2500 ? (roll(`${s.seed}|${s.week}|wrw|${m.id}`) < 0.5 ? 'rent' : 'groceries') : kids && roll(`${s.seed}|${s.week}|wrk|${m.id}`) < 0.3 ? 'doctor' : roll(`${s.seed}|${s.week}|wrb|${m.id}`) < 0.12 ? 'business' : undefined;
    if (!why) continue;
    const her = m.spouseId ? s.characters[m.spouseId] : undefined;
    out.push({ her: her ?? ({ id: `pending:${m.id}` } as Character), man: m, why, known: inside ? `${m.firstName} is inside until week ${m.imprisonedUntil}` : earn ? `${m.firstName} brought in ${$(earn)} last week` : `${m.firstName} has not brought much in lately` });
  }
  for (const p of Object.values(s.nightlife?.people ?? {})) {
    if (p.status !== 'active' || !p.met) continue;
    const c = s.characters[p.id];
    if (!c?.alive || !isAdultC(s, c)) continue;
    if (p.fam.mother === 'ailing') out.push({ her: c, why: 'doctor', known: 'her mother is sick' });
    else if (p.savings < 200 && p.fam.kids.length) out.push({ her: c, why: 'rent', known: `${p.fam.kids.length} kids, and not much put by` });
  }
  return out;
}

function reqEvent(s: GameState, W: WomenState): EventInstance | undefined {
  const list = askers(s);
  if (!list.length) return undefined;
  const a = list[Math.floor(roll(`${s.seed}|${s.week}|wask`) * list.length)];
  const her = a.her.id.startsWith('pending:') ? (a.man ? wifeFor(s, a.man) : undefined) : a.her;
  if (!her || !isAdultC(s, her) || her.id === s.playerId || her.id === player(s).spouseId || W.reqs.some((r) => r.who === her.id && s.week - r.week < 26)) return undefined;
  const amount = REQ_AMOUNT[a.why];
  const rid = `wr${s.nextId++}`;
  W.reqs.push({ id: rid, who: her.id, man: a.man?.id, why: a.why, amount, week: s.week, status: 'open' });
  if (W.reqs.length > 12) W.reqs.splice(0, W.reqs.length - 12);
  W.stats.reqs++;
  const man = a.man;
  const job = !!man && (man.faction === 'player' || man.faction === 'none') && !(man.imprisonedUntil && man.imprisonedUntil > s.week);
  return wev(s, `office_women_${a.why}`, `The office: ${her.firstName} ${her.lastName}`,
    `${her.firstName} ${her.lastName}${man ? `, ${man.firstName}'s wife,` : ''} comes to the back room. She needs ${$(amount)}: ${REQ_TEXT[a.why]}. What you know: ${a.known}.`,
    [
      { id: 'pay', label: '"Take care of it. You don\'t owe me anything."', detail: `${$(amount)} from your pocket. Her gratitude, and her family's.`, because: `helped ${her.firstName} with ${REQ_TEXT[a.why]}`, effects: [{ type: 'money', pot: 'pocket', amount: -amount, label: `${her.firstName}: ${REQ_TEXT[a.why]}` }, W_({ op: 'req', rid, how: 'pay' }, `${her.firstName}'s request`)] },
      { id: 'family', label: '"The Family will cover it."', detail: `${$(amount)} from the Family's money.${amount >= 500 ? ' Your officers notice one household getting Family money.' : ''}`, because: `had the Family help ${her.firstName}`, effects: [{ type: 'money', amount: -amount, label: `${her.firstName}: ${REQ_TEXT[a.why]}` }, W_({ op: 'req', rid, how: 'family' }, `${her.firstName}'s request`)] },
      ...(job ? [{ id: 'job', label: `"There's paid work for ${man!.firstName}. Have him see me."`, detail: 'Steady money for the household instead of a handout.', because: `found ${man!.firstName} work`, effects: [W_({ op: 'req', rid, how: 'job' }, `${her.firstName}'s request`)] }] : []),
      { id: 'decline', label: '"Not this time."', detail: 'Disappointment, nothing worse.', because: `turned ${her.firstName} away`, effects: [W_({ op: 'req', rid, how: 'decline' }, `${her.firstName}'s request`)] },
    ], [her.id, ...(man ? [man.id] : [])], false, 30);
}

function answerReq(ctx: Ctx, W: WomenState, rid: string, how: 'pay' | 'family' | 'job' | 'decline'): void {
  const s = ctx.s;
  const r = W.reqs.find((x) => x.id === rid);
  if (!r || r.status !== 'open') return;
  const her = s.characters[r.who];
  const man = r.man ? s.characters[r.man] : undefined;
  if (!her?.alive || !isAdultC(s, her)) return;
  const boss = player(s);
  r.status = how === 'pay' ? 'paid' : how === 'family' ? 'family' : how === 'job' ? 'job' : 'declined';
  if (how === 'pay' || how === 'family') {
    // Gratitude only: never counted in any romantic odds (womenAffairs.ts romanticOpinion).
    addOpinion(s, her.id, boss.id, HELP_REASON, how === 'pay' ? 12 : 8, 1);
    if (man?.alive) addOpinion(s, man.id, boss.id, 'Looked after my family', 6, 1);
    const p = s.nightlife?.people[her.id];
    if (p) p.savings += r.amount;
    W.stats.helped++;
    if (how === 'family' && r.amount >= 500) applyEffects(ctx, [{ type: 'familyOpinion', amount: -1, reason: 'Family money for one household', label: 'Your officers noticed' }], { label: 'Family money', because: `helped ${her.firstName}`, category: 'event' });
  } else if (how === 'job') {
    if (man?.alive) addOpinion(s, man.id, boss.id, 'Gave me work', 8, 1);
    addOpinion(s, her.id, boss.id, HELP_REASON, 4, 1);
    if (man) man.lastEarn = Math.max(man.lastEarn ?? 0, 200);
  } else {
    addOpinion(s, her.id, boss.id, 'Turned me away', -4, 1);
    if (man?.alive) addOpinion(s, man.id, boss.id, 'Turned my wife away', -2, 1);
  }
  wlog(W, s, `${her.firstName} ${her.lastName}'s request (${REQ_TEXT[r.why]}): ${describeWomenOp(s, { op: 'req', rid, how })}.`);
}

/* ------------------------------------------------------------------ */
/* Close to another made man                                           */
/* ------------------------------------------------------------------ */

function mistreated(s: GameState, id: string): string | undefined {
  const p = s.nightlife?.people[id];
  const af = s.women?.affairs[id];
  if (opinion(s, id, s.playerId) >= -15) return undefined;
  if ((s.women?.hooks ?? []).some((h) => h.target === id && h.status === 'used')) return 'he listened when you used what you knew against her';
  if (af?.ended?.by === 'boss' && af.aff >= 50) return 'he was there after you ended it';
  if (p?.scorned !== undefined || p?.grudge !== undefined) return 'he treats her like a person';
  if (s.women?.talent[id]?.left !== undefined) return 'he helped her think about an outside contract';
  return undefined;
}

function closeMonth(ctx: Ctx, W: WomenState): EventInstance | undefined {
  const s = ctx.s;
  const boss = player(s);
  let ev: EventInstance | undefined;
  for (const [id, cl] of Object.entries(W.close)) {
    const c = s.characters[id];
    const man = s.characters[cl.man];
    if (!c?.alive || !man?.alive || !isAdultC(s, c) || man.faction !== 'player') { delete W.close[id]; continue; }
    cl.level = clamp(cl.level + (opinion(s, id, boss.id) < 0 ? 8 : -6));
    if (cl.level <= 0) { delete W.close[id]; continue; }
    addOpinion(s, man.id, boss.id, 'She told me how he treats her', -2, 1);
    if (cl.level >= 60) changeMeter(s, man.id, boss.id, 'grievance', 8);
    if (cl.known === undefined && cl.level >= 30 && roll(`${s.seed}|${s.week}|wcknow|${id}`) < 0.4 && !ev) {
      cl.known = s.week;
      ev = wev(s, 'close', `${c.firstName}: "He actually listens"`, `${c.firstName} ${c.lastName} has become close to ${displayName(man)}, one of your own. You do not know whether it is friendship, business, or more. What she tells him about you is not flattering, and he has started to look at you differently.`, [
        { id: 'let', label: 'Let it be.', detail: 'Her life, his life.', because: `let ${c.firstName} and ${man.firstName} be`, effects: [W_({ op: 'close', id, how: 'let' }, `${c.firstName} and ${man.firstName}`)] },
        { id: 'warn', label: `Tell ${man.firstName} to keep away from her.`, detail: 'He may listen; he will resent it; so will she.', because: `warned ${man.firstName} off ${c.firstName}`, effects: [W_({ op: 'close', id, how: 'warn' }, `${c.firstName} and ${man.firstName}`)] },
        { id: 'amends', label: `Make it right with ${c.firstName}.`, detail: '$200 and an apology in person.', because: `made amends with ${c.firstName}`, effects: [W_({ op: 'close', id, how: 'amends' }, `${c.firstName} and ${man.firstName}`)] },
      ], [c.id, man.id], false, 45);
    }
    if (cl.level >= 80 && opinion(s, man.id, boss.id) < -30 && man.rank !== 'boss' && roll(`${s.seed}|${s.week}|wcgo|${id}`) < 0.08) {
      const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
      defectTo(ctx, man, mobs[0]?.id as RivalId | undefined, 'desert');
      wlog(W, s, `${displayName(man)} left the family, and ${c.firstName} went with him.`);
      delete W.close[id];
    }
  }
  // New: a woman you mistreated, a made man who is kind to her.
  for (const id of Object.keys({ ...W.affairs, ...(s.nightlife?.people ?? {}), ...W.talent })) {
    if (W.close[id] || Object.keys(W.close).length >= 6) continue;
    const c = s.characters[id];
    if (!c?.alive || c.gender !== 'F' || !isAdultC(s, c)) continue;
    const why = mistreated(s, id);
    if (!why || roll(`${s.seed}|${s.week}|wcnew|${id}`) >= 0.12) continue;
    const own = manOf(s, c)?.id;
    const men = Object.values(s.characters).filter((m) => m.alive && m.faction === 'player' && m.gender === 'M' && m.id !== boss.id && m.id !== own && isAdultC(s, m) && ['soldier', 'capo', 'underboss', 'consigliere'].includes(m.rank) && !kin(m, c) && drawnTo(s, c, m));
    if (!men.length) continue;
    men.sort((a, b) => b.attributes.diplomacy - a.attributes.diplomacy || (a.id < b.id ? -1 : 1));
    const man = men[Math.floor(roll(`${s.seed}|wcman|${id}`) * Math.min(3, men.length))];
    W.close[id] = { man: man.id, since: s.week, level: 12, why };
    W.stats.close++;
  }
  return ev;
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** Hooks: expired ones lapse; a dead holder or a new boss voids them all (heirs get nothing). */
export function hooksTidy(s: GameState): void {
  const W = s.women;
  if (!W) return;
  for (const h of W.hooks) {
    if (h.status !== 'active') continue;
    const holder = s.characters[h.holder];
    if (!holder?.alive || h.holder !== s.playerId) { h.status = 'void'; h.why = 'The boss who held it is gone'; }
    else if (s.week >= h.expires) { h.status = 'expired'; h.why = 'Too long ago to matter'; }
  }
}

function push(s: GameState, ev: EventInstance | undefined): void {
  if (ev) s.eventQueue.push(ev);
}

export function womenWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  hooksTidy(s);
  if (!adultOn(s)) return;
  const W = ensureWomen(s);
  const boss = player(s);
  if (!boss?.alive) return;
  // A new boss inherits nothing: the old boss's affairs end quietly.
  for (const a of Object.values(W.affairs)) if (a.with !== s.playerId && a.stage !== 'ended') { a.stage = 'ended'; a.ended = { week: s.week, by: 'boss', why: 'The boss she knew is gone' }; a.arrangement = undefined; }
  // Adults only, the living only: re-checked every week.
  for (const [id, a] of Object.entries(W.affairs)) {
    const c = s.characters[id];
    if (!c || !isAdultC(s, c)) { delete W.affairs[id]; continue; }
    if (!c.alive && a.stage !== 'ended') { a.stage = 'ended'; a.ended = { week: s.week, by: 'her', why: 'She died' }; a.arrangement = undefined; }
  }
  careersWeek(ctx, W);
  careersYear(ctx, W);
  // Affairs: money, time, her feelings, her guilt, the chain.
  for (const a of Object.values(W.affairs)) {
    if (a.with !== s.playerId || a.stage === 'interest') continue;
    const c = s.characters[a.id];
    if (!c?.alive) continue;
    if (a.stage === 'affair') {
      if (a.arrangement) {
        if (a.aff < 20 || a.guilt >= 85) { a.arrangement = undefined; wlog(W, s, `${c.firstName} ended the arrangement. Her call.`); }
        else spendPocket(ctx, a.arrangement.weekly, `${c.firstName}'s arrangement`, `warr:${a.id}`, true);
      }
      if (a.last !== undefined && s.week - a.last > 8) a.aff = clamp(a.aff - 2);
      if (a.nights[a.nights.length - 1] !== s.week && a.guilt > 0 && s.week % 2 === 0) a.guilt = clamp(a.guilt - 1);
      if (a.promised !== undefined && s.week > a.promised) {
        const kept = a.last !== undefined && a.last >= a.promised - 12;
        a.promised = undefined;
        if (!kept) {
          a.aff = clamp(a.aff - 15);
          wlog(W, s, `${c.firstName}: "You promised. Then you disappeared."`);
          if (roll(`${s.seed}|${s.week}|wprom|${a.id}`) < 0.35) endAffair(ctx, W, a, c, 'her', '"You promised." She is tired of waiting.');
        }
      }
      if (a.stage === 'affair' && marriedOf(s, c) && a.guilt >= 60 && a.last1 === undefined && (W.cool[`last:${a.id}`] ?? -99) + 12 <= s.week && roll(`${s.seed}|${s.week}|wlastq|${a.id}`) < 0.15) {
        W.cool[`last:${a.id}`] = s.week;
        push(s, lastEvent(s, c));
      }
      if (a.stage === 'affair' && !marriedOf(s, c) && a.aff >= 80 && (W.cool[`real:${a.id}`] ?? -99) + 26 <= s.week && roll(`${s.seed}|${s.week}|wrealq|${a.id}`) < 0.1) {
        W.cool[`real:${a.id}`] = s.week;
        push(s, realEvent(s, c));
      }
    }
    if (a.preg && a.told === undefined && a.pregWeek !== undefined && s.week - a.pregWeek >= 7 && (s.romance?.pregnancies ?? []).some((x) => x.id === a.preg)) {
      a.told = s.week;
      const D = s.dating;
      const k = D?.preg.find((x) => x.id === a.preg);
      if (k && !k.knownBy.includes(boss.id)) k.knownBy.push(boss.id);
      push(s, babyEvent(s, c));
    }
    if (a.ack && a.preg) acknowledgeBirth(s, a, c);
    push(s, discoveryWeek(ctx, W, a, c));
  }
  plotsWeek(ctx, W);
  talentWeek(ctx, W);
  // Requests: now and then, from a real need.
  for (const r of W.reqs) if (r.status === 'open' && s.week - r.week > 2) r.status = 'lapsed';
  if (!W.reqs.some((r) => r.status === 'open') && (W.cool.req ?? -99) + 4 <= s.week && roll(`${s.seed}|${s.week}|wreq`) < 0.08) {
    const ev = reqEvent(s, W);
    if (ev) { W.cool.req = s.week; push(s, ev); }
  }
  // Monthly: propositions; the made men she grows close to.
  if (s.week % 4 === 2) {
    push(s, closeMonth(ctx, W));
    if ((W.cool.prop ?? -99) + 6 <= s.week && roll(`${s.seed}|${s.week}|wprop`) < 0.3) {
      const ev = proposition(s, W);
      if (ev) { W.cool.prop = s.week; W.stats.props++; push(s, ev); }
    }
  }
  // Bounded: ended affairs older than three years are forgotten, oldest first past 60 records.
  const ids = Object.keys(W.affairs);
  if (ids.length > 60) {
    const old = ids.filter((id) => W.affairs[id].stage === 'ended' && s.week - (W.affairs[id].ended?.week ?? 0) > 156).sort((x, y) => (W.affairs[x].ended?.week ?? 0) - (W.affairs[y].ended?.week ?? 0));
    for (const id of old.slice(0, ids.length - 60)) delete W.affairs[id];
  }
  for (const k of Object.keys(W.cool)) if (s.week - W.cool[k] > 104) delete W.cool[k];
  W.hooks = W.hooks.filter((h) => h.status === 'active' || s.week - h.made < 260);
}

function acknowledgeBirth(s: GameState, a: { id: string; preg?: string }, c: Character): void {
  if ((s.romance?.pregnancies ?? []).some((x) => x.id === a.preg)) return;
  const boss = player(s);
  const kid = c.childrenIds.map((k) => s.characters[k]).find((k) => k && (k.bioFatherId === boss.id || k.fatherId === boss.id) && !boss.childrenIds.includes(k.id));
  if (!kid) return;
  if (!kid.fatherId) kid.fatherId = boss.id;
  boss.childrenIds.push(kid.id);
  famMut(s, kid.id).bastardOf = boss.id;
  a.preg = undefined;
}

function proposition(s: GameState, W: WomenState): EventInstance | undefined {
  const boss = player(s);
  const pool: { c: Character; why: Motive }[] = [];
  const ids = new Set<string>([...Object.keys(s.nightlife?.people ?? {}).filter((id) => s.nightlife!.people[id].met && s.nightlife!.people[id].status === 'active'), ...Object.keys(W.affairs), ...W.reqs.map((r) => r.who)]);
  for (const id of ids) {
    const c = s.characters[id];
    if (!c || womanBlock(s, id)) continue;
    const af = affairOf(s, id);
    if (af && (af.stage === 'affair' || af.closed !== undefined || (af.stage === 'ended' && s.week - (af.ended?.week ?? 0) < 52))) continue;
    if ((W.cool[`prop:${id}`] ?? -99) + 52 > s.week) continue;
    const why = motiveOf(s, c);
    if (why) pool.push({ c, why });
  }
  if (!pool.length) return undefined;
  pool.sort((a, b) => (a.c.id < b.c.id ? -1 : 1));
  const pick = pool[Math.floor(roll(`${s.seed}|${s.week}|wpropw`) * pool.length)];
  W.cool[`prop:${pick.c.id}`] = s.week;
  if (boss.id === pick.c.id) return undefined;
  return propEvent(s, pick.c, pick.why);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export interface AffairRow { id: string; name: string; stage: string; aff: number; guilt: number; nights: number; known: number; husband?: string; risk: string; ended?: string }

export function affairRows(s: GameState): AffairRow[] {
  if (!adultOn(s) || !s.women) return [];
  return Object.values(s.women.affairs).filter((a) => a.with === s.playerId && a.stage !== 'interest' && s.characters[a.id] && isAdultC(s, s.characters[a.id])).map((a) => {
    const c = s.characters[a.id];
    const m = manOf(s, c);
    return {
      id: a.id, name: displayName(c), stage: STAGE_TEXT[a.stage], aff: a.aff, guilt: a.guilt, nights: a.n, known: a.known.length,
      husband: m ? `${displayName(m)}${a.husbandKnew !== undefined ? ' (knows)' : ''}` : undefined, risk: pregnancyRisk(s, c, a.n).word, ended: a.ended?.why,
    };
  }).sort((x, y) => (x.ended ? 1 : 0) - (y.ended ? 1 : 0));
}

export interface HookRow { id: string; target: string; name: string; basis: string; expires: number; status: Hook['status']; canRumor: boolean }

export function hookRows(s: GameState): HookRow[] {
  if (!adultOn(s) || !s.women) return [];
  return s.women.hooks.filter((h) => h.holder === s.playerId).map((h) => ({ id: h.id, target: h.target, name: s.characters[h.target] ? displayName(s.characters[h.target]) : '?', basis: BASIS_TEXT[h.basis], expires: h.expires, status: hookLive(s, h) ? 'active' : h.status, canRumor: s.women!.talent[h.target]?.left !== undefined }));
}

export function talentRows(s: GameState): { id: string; name: string; kind: string; fame: number; left?: string }[] {
  if (!adultOn(s) || !s.women) return [];
  return Object.entries(s.women.talent).filter(([id]) => s.characters[id]).map(([id, t]) => ({ id, name: displayName(s.characters[id]), kind: t.kind, fame: t.fame, left: t.left !== undefined ? `left week ${t.left} (${t.why})` : undefined }));
}

export function womenLog(s: GameState, n = 10): { week: number; text: string }[] {
  if (!adultOn(s)) return [];
  return (s.women?.log ?? []).slice(-n).reverse().map(([week, text]) => ({ week, text }));
}

/** An office request now, from a real need (the week calls this; exposed for the office and tests). */
export function officeRequest(s: GameState): EventInstance | undefined {
  return reqEvent(s, ensureWomen(s));
}
