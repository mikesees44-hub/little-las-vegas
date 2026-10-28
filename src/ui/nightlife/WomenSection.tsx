import { useState } from 'react';
import { affairRows, hookRows, talentRows, womenLog } from '../../engine/women';
import { adultOn } from '../../engine/datingState';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { CharLink } from '../components/People';
import { LooksBadge } from '../components/LooksBadge';
import { DossierModal } from './Dossier';

/**
 * HER SIDE OF IT (engine/women.ts): the boss's affairs (her feelings, her
 * guilt, who knows, her husband, the pregnancy risk in words), the talent
 * under contract with his company, the hooks he holds (one use; they fade;
 * they die with him), and what happened lately. Hidden with mature content Off.
 */
export function WomenSection({ s, onCard }: { s: GameState; onCard: (id: string) => void }) {
  const [dossier, setDossier] = useState<string | undefined>();
  if (!adultOn(s)) return <p className="text-xs text-stone-500" data-testid="women-off">Mature content is Off in Settings.</p>;
  const affairs = affairRows(s);
  const hooks = hookRows(s);
  const talent = talentRows(s);
  return (
    <section className="space-y-3" data-testid="women-section">
      <p className="text-[11px] text-stone-400">Every woman here is an adult and decides for herself: dinner, an affair, where, whether it goes on. Help with money is never tied to any of it. A no is final until she says otherwise.</p>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Affairs</div>
        {affairs.length === 0 ? <p className="mt-1 text-xs text-stone-500">None. Open a woman's dossier to ask her to dinner.</p> : (
          <ul className="mt-1 space-y-1.5">{affairs.map((a) => (
            <li key={a.id} className="rounded-md border border-noir-700 bg-noir-800/50 p-2 text-[12px]" data-testid="women-affair">
              <div className="flex flex-wrap items-center gap-1.5"><CharLink s={s} id={a.id}>{a.name}</CharLink><LooksBadge s={s} id={a.id} compact /><span className="text-stone-400">{a.stage}</span></div>
              <div className="text-[11px] text-stone-400">Her feelings {a.aff} · guilt {a.guilt} · {a.nights} evening{a.nights === 1 ? '' : 's'} · {a.known ? `${a.known} who know or saw` : 'nobody knows'}{a.husband ? ` · husband ${a.husband}` : ''} · pregnancy risk {a.risk}{a.ended ? ` · ${a.ended}` : ''}</div>
              <div className="mt-1 flex gap-1.5"><button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setDossier(a.id)} data-testid="women-dossier">Dossier ▸</button><button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => onCard(a.id)}>Card ▸</button></div>
            </li>
          ))}</ul>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Your company's talent</div>
        {talent.length === 0 ? <p className="mt-1 text-xs text-stone-500">Nobody under contract. With a talent agency, a label or a picture outfit, you can sign a woman from her dossier.</p> : (
          <ul className="mt-1 text-[12px] space-y-0.5">{talent.map((t) => <li key={t.id}><CharLink s={s} id={t.id}>{t.name}</CharLink>: {t.kind}, fame {t.fame}{t.left ? <span className="text-red-300"> · {t.left}</span> : null}</li>)}</ul>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Hooks you hold</div>
        {hooks.length === 0 ? <p className="mt-1 text-xs text-stone-500">None.</p> : (
          <ul className="mt-1 space-y-1.5">{hooks.map((h) => (
            <li key={h.id} className="rounded-md border border-noir-700 p-2 text-[12px]" data-testid="women-hook">
              <div><CharLink s={s} id={h.target}>{h.name}</CharLink>: {h.basis} · {h.status === 'active' ? `until week ${h.expires}` : h.status}</div>
              {h.status === 'active' && <div className="mt-1 space-y-1"><ActionRow s={s} action={{ kind: 'women', op: { op: 'hook', hook: h.id, how: 'favor' } }} />{h.canRumor && <ActionRow s={s} action={{ kind: 'women', op: { op: 'hook', hook: h.id, how: 'rumor' } }} />}</div>}
            </li>
          ))}</ul>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Lately</div>
        <ul className="mt-1 space-y-0.5 text-[12px] text-stone-300">{womenLog(s, 15).map((l, i) => <li key={i}><span className="text-stone-500">Week {l.week}:</span> {l.text}</li>)}</ul>
      </div>
      {dossier && <DossierModal s={s} id={dossier} onClose={() => setDossier(undefined)} />}
    </section>
  );
}
