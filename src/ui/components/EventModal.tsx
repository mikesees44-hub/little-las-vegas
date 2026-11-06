import { touchesAMan } from '../../engine/bundles';
import { useState } from 'react';
import { rankWordOf } from '../../engine/rankView';
import { aboveLabel } from '../../engine/valente';
import { PredictedReactions } from '../reactions/Reactions';
import { recurringOfAll } from '../../engine/recurring';
import { AdviceButton } from '../advice/AdviceButton';
import { displayName } from '../../engine/characters';
import { officeVisitors } from '../../engine/bossOffice';
import { oddsOfChoice, stakesLine, worstOfChoice } from '../../engine/decide';
import { alwaysOn, consiglierePick, routineEvent } from '../../engine/delegation';
import { setAlways } from '../../engine/lieutenants';
import type { EventInstance, GameState } from '../../engine/types';
import { Modal } from './Modal';
import { negotiable } from '../../engine/minds/dialogue';
import { NegotiationWindow } from '../minds/NegotiationWindow';
import { faceToFace, heatedChoices } from '../../engine/argue';
import { useShell } from '../shell/context';
import { DecisionCard, type DecisionOption } from '../decide/DecisionCard';
import { voicesFor } from '../decide/voices';
import { Glossed } from '../clarity/Term';
import { domainOf, domainOfText } from '../domain';

/**
 * A decision that came to the boss, on the one decision card (ui/decide):
 * what is on the line, every option with its odds ("certain" when nothing is
 * rolled) and what may come of it, his people's voices in a line each, one
 * primary button, "Decide later" and "Hand it off" (the seat that would
 * answer it his way). Number keys pick (again, or Enter, gives); Esc is "not now".
 */
export function EventModal({ s, ev, index, total, selected, onChoose, onClose }: {
  s: GameState;
  ev: EventInstance;
  index: number;
  total: number;
  selected?: string;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}) {
  const ids = ev.actors ?? (ev.meta?.charId ? [String(ev.meta.charId)] : []);
  const actors = ids.map((id) => s.characters[id]).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 3);
  // A decision with someone on the other side can be talked out in the two-way window (minds/dialogue.ts).
  const [talk, setTalk] = useState(false);
  const nego = negotiable(s, ev);
  // A heated answer can be given to his face: settled now, and he answers right there (engine/argue).
  const shell = useShell();
  const heated = shell.update ? heatedChoices(s, ev) : [];
  const [face, setFace] = useState(false);
  const toFace = (choiceId: string) => { shell.update?.((x) => faceToFace(x, ev.iid, choiceId)); onClose(); };
  const dflt = ev.choices.find((c) => c.id === ev.defaultChoiceId) ?? ev.choices[0];
  const hand = officeVisitors(s).find((v) => v.ref.event === ev.iid)?.delegate;
  // A routine decision (a small ask): one button follows the consigliere's recommendation, and one link
  // hands every small ask like it to him from now on (engine/delegation.ts). A real decision keeps the hand-off.
  const routine = routineEvent(s, ev);
  const cp = routine ? consiglierePick(s, ev) : undefined;
  const cpMan = cp?.byId ? s.characters[cp.byId] : undefined;
  const cpName = cpMan?.firstName;
  const cpWho = cpMan?.rank === 'consigliere' ? 'the consigliere' : cpName ?? 'your people';
  // The recommended answer, picked when the card opens (never given until he taps): the consigliere's pick,
  // unless it would cost one of his men his life or freedom (that pick is always the boss's own tap).
  const rec = cp ?? consiglierePick(s, ev);
  const recId = rec && !touchesAMan(ev.choices.find((c) => c.id === rec.choiceId)?.effects ?? []) ? rec.choiceId : undefined;
  const recWho = rec?.byId && s.characters[rec.byId] ? (s.characters[rec.byId].rank === 'consigliere' ? 'The consigliere' : s.characters[rec.byId].firstName) : 'Your people';
  const options: DecisionOption[] = ev.choices.map((c) => ({
    recommended: c.id === recId,
    pickedBy: c.id === recId ? `${recWho}'s pick` : undefined,
    id: c.id,
    label: c.label,
    detail: c.detail,
    effects: c.effects,
    odds: oddsOfChoice(c),
    worst: worstOfChoice(c),
    disabled: c.disabledReason,
    done: selected === c.id,
    note: <>
      {!/(Accepting|Declining):/.test(c.detail ?? '') && <PredictedReactions s={s} ev={ev} ch={c} />}
      {recurringOfAll(s, c.effects).map((r, j) => <span key={j} className="mt-1 block text-[11px] text-amber-200" data-testid="recurring-note">↻ {r.text}</span>)}
    </>,
  }));
  return (
    <Modal onClose={onClose}>
      <DecisionCard
        s={s}
        kicker={`Decision ${index + 1} of ${total}`}
        domain={domainOf((ev.meta as { theme?: string } | undefined)?.theme) ?? domainOfText(s, `${ev.title} ${ev.text ?? ''}`)}
        deadline={ev.mandatory ? 'now' : 'by the week\'s turn'}
        title={ev.title}
        faces={actors}
        sub={actors.length > 0 ? actors.map((c, i) => <span key={c.id}>{i > 0 && ' · '}{displayName(c)}{aboveLabel(s, c.id) ? `, ${aboveLabel(s, c.id)}` : c.rank !== 'civilian' ? `, ${rankWordOf(s, c)}` : c.office ? `, ${c.office}` : ''}</span>) : undefined}
        stakes={stakesLine(s, ev.choices.map((c) => c.effects))}
        text={<Glossed text={ev.text} />}
        extra={<>
          {nego && (
            <button type="button" className="btn-quiet mt-2 text-xs" onClick={() => setTalk(true)} data-testid="event-negotiate">
              Talk it out with {s.characters[nego.counterpart]?.firstName ?? 'him'}: bargain over the terms, settled right now ▸
            </button>
          )}
          {talk && <NegotiationWindow s={s} ev={ev} onClose={() => setTalk(false)} />}
          {heated.length > 0 && (heated.length === 1
            ? <button type="button" className="btn-quiet mt-1 block text-xs text-red-200" onClick={() => toFace(heated[0].ch.id)} data-testid="event-face">
                Say it to {s.characters[heated[0].spec.t] ? `${s.characters[heated[0].spec.t].firstName}'s` : 'his'} face: {heated[0].ch.label}, settled now, and he answers ▸
              </button>
            : <div className="mt-1 text-xs" data-testid="event-face">
                <button type="button" className="btn-quiet text-red-200" onClick={() => setFace((x) => !x)}>Say it to his face: settled now, and he answers ▸</button>
                {face && <div className="mt-1 flex flex-wrap gap-1">{heated.map(({ ch, spec }) => (
                  <button key={ch.id} type="button" className="btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => toFace(ch.id)}>{ch.label} ({s.characters[spec.t]?.firstName})</button>
                ))}</div>}
              </div>)}
          {dflt && <p className="mt-1 text-[11px] text-stone-500" data-testid="event-default">If you don't decide before the week turns: <span className="text-stone-300">{alwaysOn(s, 'asks') && cp ? `${cp.label} (the consigliere's call)` : dflt.label}</span>.</p>}
          {cp && shell.update && !alwaysOn(s, 'asks') && (
            <button type="button" className="btn-quiet mt-0.5 block text-[11px]" onClick={() => { shell.update?.((x) => setAlways(x, 'asks', true)); onChoose(cp.choiceId); }} data-testid="event-always-asks"
              title="Small asks like this one: no life, no war, no real money. They go to Handled for you on the Desk, where you can take any back. Settings and Standing Orders turn it off.">
              ↻ Do it, and always let {cpName ?? 'him'} settle small asks like this ▸
            </button>
          )}
        </>}
        options={options}
        voices={voicesFor(s, { kind: 'event', iid: ev.iid })}
        selected={selected}
        onDecide={onChoose}
        onLater={onClose}
        laterLabel="Decide later"
        onHandOff={cp ? () => onChoose(cp.choiceId) : hand ? () => onChoose((hand.op as { choiceId: string }).choiceId) : undefined}
        handOffLabel={cp ? `Do what ${cpWho} says (${cp.label})` : hand ? `${hand.label} (${hand.does})` : undefined}
        advice={<AdviceButton s={s} subject={{ kind: 'event', iid: ev.iid }} onChoose={onChoose} auto={false} />}
        keys={!talk}
        optionTestId="event-choice"
        testid="event-decision"
      />
    </Modal>
  );
}
