import { useMemo, useState } from 'react';
import { LoggedCard } from '../book/TheBook';
import { AT_TEXT, END_TEXT, runDare, type DareAt, type DareMove } from '../../engine/honeyScript';
import type { Dialogue } from '../../engine/minds/dialogue';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { DialogueWindow, type BeatOption } from '../minds/DialogueWindow';

/**
 * THE BOLD DARE, face to face (engine/honeyScript.ts): pick the room, then
 * the scene plays in the two-way window, beat by beat. Every line shows its
 * odds; her answers come from who she is. She decides; nothing is paid unless
 * she says yes. The order at the end replays exactly what happened here.
 */
export function DareFlow({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const c = s.characters[id];
  const [at, setAt] = useState<DareAt | undefined>();
  const [moves, setMoves] = useState<DareMove[]>([]);
  const run = useMemo(() => (at ? runDare(s, id, at, moves) : undefined), [s, id, at, moves]);
  if (!c) return null;
  const her = c.firstName;
  const d: Dialogue = {
    id, kind: 'romance', round: moves.length, max: 3, interest: run?.warmth ?? 50, anger: run?.anger ?? 0, i0: run?.warmth ?? 50,
    log: run ? run.log.map((l) => ({ who: l.who, text: l.text })) : [{ who: 'narrator', text: `Where do you make your move on ${her}?` }],
    ...(run?.end || run?.block ? { end: 'done' as const } : {}),
  };
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const options: BeatOption[] = !at
    ? (['office', 'club'] as DareAt[]).map((x) => ({ key: x, label: x === 'office' ? 'Upstairs, in your office' : 'On the club floor', hint: `the dare happens in ${AT_TEXT[x]}`, onPick: () => setAt(x) }))
    : (run?.options ?? []).filter((o) => !o.block).map((o) => ({ key: o.move, label: `${o.label} · ${pct(o.odds)}`, hint: `"${o.say}" (${o.hint})`, onPick: () => setMoves((m) => [...m, o.move]) }));
  const blocked = (run?.options ?? []).filter((o) => o.block);
  const order: PlayerAction | undefined = at && run?.end ? { kind: 'honey', op: { op: 'dare', id, at, moves: run.moves } } : undefined;
  const why = run?.read.reasons.slice().sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, 3).map((r) => `${r.value > 0 ? '+' : '−'}${Math.abs(r.value)} ${r.label.toLowerCase()}`).join(', ');
  return (
    <DialogueWindow s={s} d={d} title={`A bold dare: ${her}`} onClose={onClose} options={options}
      note={run?.block ?? (at && !run?.end ? `She decides, every line. ${why ? `Her read of you: ${why}.` : ''}${blocked.length ? ` (${blocked[0].block}.)` : ''}` : undefined)}
      result={run?.end ? `${END_TEXT[run.end]}.${run.signs.length ? ' Something about her stays with you.' : ''} Give the order to make it so.` : undefined}
      footer={(
        <div className="space-y-1.5" data-testid="dare-flow">
          {at && !run?.end && moves.length > 0 && <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setMoves((m) => m.slice(0, -1))} data-testid="dare-undo">Take back the last line</button>}
          {order && <ActionCard s={s} action={order} />}
          {order && run?.end && <LoggedCard s={s} person={id} action={order} title={`A bold dare with ${her}: ${END_TEXT[run.end].toLowerCase()}`} lines={run.signs} />}
        </div>
      )} />
  );
}
