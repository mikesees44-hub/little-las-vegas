import { useState } from 'react';
import { PredictedReactions } from '../reactions/Reactions';
import { recurringOfAll } from '../../engine/recurring';
import { AdviceButton } from '../advice/AdviceButton';
import { displayName } from '../../engine/characters';
import { officeVisitors } from '../../engine/bossOffice';
import { oddsOfChoice, stakesLine, worstOfChoice } from '../../engine/decide';
import type { EventInstance, GameState } from '../../engine/types';
import { Modal } from './Modal';
import { negotiable } from '../../engine/minds/dialogue';
import { NegotiationWindow } from '../minds/NegotiationWindow';
import { faceToFace, heatedChoices } from '../../engine/argue';
import { useShell } from '../shell/context';
import { DecisionCard, type DecisionOption } from '../decide/DecisionCard';
import { voicesFor } from '../decide/voices';

/**
 * A decision that came to the boss, on the one decision card (ui/decide):
 * what is on the line, every option with its odds ("certain" when nothing is
 * rolled) and what may come of it, his people's voices in a line each, one
 * primary button, "Decide later" and "Hand it off" (the seat that would
 * answer it his way). Number keys pick and give.
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
  const options: DecisionOption[] = ev.choices.map((c) => ({
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
        deadline={ev.mandatory ? 'now' : 'by the week\'s turn'}
        title={ev.title}
        faces={actors}
        sub={actors.length > 0 ? actors.map((c, i) => <span key={c.id}>{i > 0 && ' · '}{displayName(c)}{c.rank !== 'civilian' ? `, ${c.rank}` : c.office ? `, ${c.office}` : ''}</span>) : undefined}
        stakes={stakesLine(s, ev.choices.map((c) => c.effects))}
        text={ev.text}
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
          {dflt && <p className="mt-1 text-[11px] text-stone-500" data-testid="event-default">If you don't decide before the week turns: <span className="text-stone-300">{dflt.label}</span>.</p>}
        </>}
        options={options}
        voices={voicesFor(s, { kind: 'event', iid: ev.iid })}
        selected={selected}
        onDecide={onChoose}
        onLater={onClose}
        laterLabel="Decide later"
        onHandOff={hand ? () => onChoose((hand.op as { choiceId: string }).choiceId) : undefined}
        handOffLabel={hand ? `${hand.label} (${hand.does})` : undefined}
        advice={<AdviceButton s={s} subject={{ kind: 'event', iid: ev.iid }} onChoose={onChoose} auto={false} />}
        keys={!talk}
        optionTestId="event-choice"
        testid="event-decision"
      />
    </Modal>
  );
}
