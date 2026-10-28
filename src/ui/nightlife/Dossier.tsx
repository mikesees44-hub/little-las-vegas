import { useState, type ReactNode } from 'react';
import { DESC_LABEL, DESC_OPTIONS, dossierOf, optionLabel, setDescriptor, type Bar } from '../../engine/dossier';
import { BASIS_TEXT } from '../../engine/womenState';
import { herPick, pregnancyRisk } from '../../engine/womenAffairs';
import { SETTING_INFO, SETTINGS, type DescOverride, type Setting } from '../../engine/womenState';
import { settingView } from '../../engine/womenAffairs';
import { previewWomen, womenActionsFor } from '../../engine/women';
import { affairOf } from '../../engine/womenCore';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { ActionCard } from '../components/Orders';
import { FACTION_TINT } from '../components/People';
import { LooksBadge } from '../components/LooksBadge';
import { Modal } from '../components/Modal';
import { Portrait } from '../portrait/Portrait';
import { useShell } from '../shell/context';

/**
 * THE DOSSIER (engine/dossier.ts): one adult woman, in depth. A large
 * portrait; the look at a glance (hot or not, and to your eye); appearance
 * as independent descriptors you can change one at a time, over the full
 * head-to-toe profile in words; how different people rate her; an aptitude
 * chart (game scores, not IQ), a trait chart, a motivation chart; her career
 * and conditions; relationships; secrets you know. Then her orders: every
 * one hers to accept or refuse. Nothing explicit; adults only; hidden with
 * mature content Off.
 */

function Sec({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return (
    <section className="rounded-md border border-noir-700 bg-noir-900/50 p-2.5" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-gold-500/80 mb-1">{title}</div>
      {children}
    </section>
  );
}

function Bars({ bars, tone = 'bg-gold-500/80' }: { bars: Bar[]; tone?: string }) {
  return (
    <ul className="space-y-1">
      {bars.map((b) => (
        <li key={b.key} className="flex items-center gap-2 text-[11px]" title={b.text}>
          <span className="w-28 text-stone-400">{b.label}</span>
          <span className="h-1.5 flex-1 rounded bg-noir-700 overflow-hidden"><span className={`block h-full ${tone}`} style={{ width: `${b.v}%` }} /></span>
          <span className="w-8 text-right tabular-nums text-stone-200">{b.v}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where tonight: the boss proposes, she agrees, says where she'd rather, or says no (the EveningFlow pattern; the choices are data). */
function NightPicker({ s, id }: { s: GameState; id: string }) {
  const c = s.characters[id];
  const [at, setAt] = useState<Setting>(c ? herPick(s, c) : 'hotel');
  if (!c) return null;
  const a: PlayerAction = { kind: 'women', op: { op: 'night', id, at } };
  return (
    <div className="space-y-1.5" data-testid="night-picker">
      <div className="text-[11px] text-stone-400">Where? She would rather: <b className="text-stone-200">{SETTING_INFO[herPick(s, c)].label.toLowerCase()}</b>. Pregnancy risk over your nights so far: {pregnancyRisk(s, c, affairOf(s, id)?.n ?? 0).word}.</div>
      <div className="flex flex-wrap gap-1">
        {SETTINGS.map((x) => {
          const v = settingView(s, c, x);
          return (
            <button key={x} type="button" onClick={() => setAt(x)} aria-pressed={at === x} data-testid={`setting-${x}`} title={v.no ?? SETTING_INFO[x].text}
              className={`rounded px-2 py-1 text-[11px] ${at === x ? 'bg-gold-500 text-noir-950 font-semibold' : 'border border-noir-600 text-stone-300'} ${v.no ? 'line-through opacity-60' : ''}`}>
              {SETTING_INFO[x].label}{SETTING_INFO[x].cost ? ` ($${SETTING_INFO[x].cost})` : ''}
            </button>
          );
        })}
      </div>
      <ActionCard s={s} action={a} />
    </div>
  );
}

export function Dossier({ s, id, actions = true }: { s: GameState; id: string; actions?: boolean }) {
  const shell = useShell();
  const [edit, setEdit] = useState(false);
  const v = dossierOf(s, id);
  const c = s.characters[id];
  if (!v || !c) return <p className="text-xs text-stone-500" data-testid="dossier-none">No dossier: adults only, with mature content on.</p>;
  const set = (k: keyof DescOverride, val: string | undefined) => (shell.act ?? shell.update)?.((x) => setDescriptor(x, id, k, val), 'Changed a description');
  const acts = actions ? womenActionsFor(s, id).filter((a) => !(a.kind === 'women' && a.op.op === 'night')) : [];
  const affair = affairOf(s, id);
  const hookActs = acts.filter((a) => a.kind === 'women' && a.op.op === 'hook');
  const L = v.look;
  return (
    <article className="space-y-2.5" data-testid="dossier" data-id={id}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="shrink-0 self-center sm:self-start rounded-lg border border-gold-600/50 p-1">
          <Portrait c={c} seed={s.seed} date={s.date} size={200} tint={FACTION_TINT[c.faction]} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-display text-2xl text-gold-300 break-words">{v.name}</h3>
          <div className="text-[12px] text-stone-300">{v.age} · {v.role}</div>
          <LooksBadge s={s} id={id} />
          <div className="text-[13px] italic text-stone-200" data-testid="dossier-type">{L.type}</div>
          <p className="text-[12px] text-stone-300" data-testid="dossier-line">{L.line}</p>
          <ul className="text-[11px] text-stone-400" data-testid="dossier-ratings">{L.ratings.map((r) => <li key={r.who}>{r.who}: {r.word}</li>)}</ul>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Sec title="Appearance" testid="dossier-appearance">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-[12px]">
            {(['tier', 'body', 'figure', 'bust', 'hair', 'eyes', 'style', 'mark', 'type'] as (keyof DescOverride)[]).map((k) => {
              const shown = k === 'body' ? L.build : (L as unknown as Record<string, string | undefined>)[k] ?? '';
              if (k === 'bust' && !L.bust) return null;
              return [
                <dt key={`${k}t`} className="text-stone-500">{DESC_LABEL[k]}</dt>,
                <dd key={`${k}d`} className="text-stone-100">
                  {edit ? (
                    <select className="w-full rounded bg-noir-800 text-[12px]" value={L.set.includes(k) ? (s.women?.looks[id]?.[k] ?? '') : ''} onChange={(e) => set(k, e.target.value || undefined)} data-testid={`desc-${k}`}>
                      <option value="">(as she is: {shown})</option>
                      {DESC_OPTIONS[k].map((o) => <option key={o} value={o}>{optionLabel(k, o)}</option>)}
                    </select>
                  ) : shown}
                </dd>,
              ];
            })}
            <dt className="text-stone-500">Height</dt><dd className="text-stone-100">{L.body.height}</dd>
            <dt className="text-stone-500">Waist · hips</dt><dd className="text-stone-100">{L.body.waist} · {L.body.hips}</dd>
            <dt className="text-stone-500">Legs</dt><dd className="text-stone-100">{L.body.legs}</dd>
            <dt className="text-stone-500">Skin</dt><dd className="text-stone-100">{L.body.skin}</dd>
            <dt className="text-stone-500">Face</dt><dd className="text-stone-100">{[L.body.face.shape, L.body.face.lips, L.body.face.nose, L.body.face.smile, L.body.face.mark].filter(Boolean).join('; ')}</dd>
            <dt className="text-stone-500">Carries herself</dt><dd className="text-stone-100">{L.body.posture}</dd>
            <dt className="text-stone-500">Voice · scent</dt><dd className="text-stone-100">{L.body.voice} · {L.body.scent}</dd>
            <dt className="text-stone-500">Wardrobe</dt><dd className="text-stone-100">{L.body.wardrobe}</dd>
          </dl>
          <p className="mt-1 text-[11px] text-stone-400">{L.body.flavor}</p>
          <button type="button" className="mt-1 text-[11px] text-gold-400" onClick={() => setEdit((x) => !x)} data-testid="dossier-edit">{edit ? 'Done' : 'Change the description…'}</button>
        </Sec>
        <Sec title="Aptitude (game scores, not IQ)" testid="dossier-aptitude">
          <div className="mb-1 text-[11px] text-stone-400" data-testid="dossier-iq">IQ: {v.iq.text}</div>
          <Bars bars={v.aptitude} />
        </Sec>
        <Sec title="Traits" testid="dossier-traits">
          <ul className="space-y-1">{v.traits.map((t) => (
            <li key={t.name} className="text-[11px]" title={[t.good, t.bad].filter(Boolean).join('; ')}>
              <div className="flex items-center gap-2"><span className="w-28 text-stone-200">{t.name}</span><span className="h-1.5 flex-1 rounded bg-noir-700 overflow-hidden"><span className="block h-full bg-sky-400/70" style={{ width: `${t.v}%` }} /></span></div>
              <div className="text-[10px] text-stone-500">{t.good}{t.bad ? ` · ${t.bad}` : ''}</div>
            </li>
          ))}</ul>
        </Sec>
        <Sec title={`What drives her (${v.read})`} testid="dossier-motives">
          <Bars bars={v.motives} tone="bg-rose-400/70" />
        </Sec>
        {v.career && (
          <Sec title="Her career" testid="dossier-career">
            <ul className="text-[12px] text-stone-200 space-y-0.5">
              <li>Aim: {v.career.aim}</li>
              <li>Works: {v.career.tier}</li>
              <li>Conditions: {v.career.cond} of 100 · keeps about ${v.career.pay} a week</li>
              {v.career.text && <li className="text-stone-400">{v.career.text}</li>}
              <li className="text-[11px] text-stone-500">She can quit anything, any week.</li>
            </ul>
          </Sec>
        )}
        <Sec title="Relationships" testid="dossier-relations">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-[12px]">
            {v.relations.map((r, i) => [<dt key={`a${i}`} className="text-stone-500">{r.label}</dt>, <dd key={`b${i}`} className={r.tone === 'good' ? 'text-emerald-300' : r.tone === 'bad' ? 'text-red-300' : r.tone === 'warn' ? 'text-amber-200' : 'text-stone-100'}>{r.text}</dd>])}
          </dl>
        </Sec>
        <Sec title="Secrets you know" testid="dossier-secrets">
          {v.secrets.length === 0 ? <p className="text-[12px] text-stone-500">Nothing yet.</p> : (
            <ul className="text-[12px] space-y-0.5">{v.secrets.map((x, i) => <li key={i} className="text-stone-200"><span className="mr-1 rounded bg-noir-700 px-1 text-[9px] uppercase">{x.label}</span>{x.text}</li>)}</ul>
          )}
          {hookActs.length > 0 && <p className="mt-1 text-[10px] text-stone-500">A hook: {BASIS_TEXT.past.split(' ')[0]}… one use, it fades with time, and it dies with you. It never buys anything personal.</p>}
        </Sec>
      </div>

      {actions && (acts.length > 0 || affair?.stage === 'affair') && (
        <Sec title="You and her (she decides every time)" testid="dossier-actions">
          <div className="space-y-1.5">
            {affair?.stage === 'affair' && <NightPicker s={s} id={id} />}
            {acts.map((a, i) => <ActionRow key={i} s={s} action={a} label={previewWomen(s, (a as Extract<PlayerAction, { kind: 'women' }>).op).title} />)}
          </div>
        </Sec>
      )}
    </article>
  );
}

export function DossierModal({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="p-3 pb-24 sm:p-4" data-testid="dossier-modal">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Dossier</div>
          <button type="button" className="btn-ghost text-xs px-2 py-0.5" onClick={onClose}>Close</button>
        </div>
        <Dossier s={s} id={id} />
      </div>
    </Modal>
  );
}
