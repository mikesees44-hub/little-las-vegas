import { useMemo, useState, type ReactNode } from 'react';
import { displayName, player } from '../../engine/characters';
import { dateOfWeek, formatDate } from '../../engine/calendar';
import { capoTrends, filterLines, keeper, keeperSkill, honesty, MODE_INFO, MODES, raidExposure, reconcileBooks, SECTION_LABEL, sectionLabel, srcName, visibleWeeks, type Section } from '../../engine/ledgerbook';
import { rivalBonesOnYou } from '../../engine/bones';
import { interactionsFor } from '../../engine/interactions';
import { FACTION_NAMES } from '../../engine/world';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { KeeperPicker } from '../clarity/Pickers';
import { CharLink } from '../components/People';
import { Stat } from '../econ/Holdings';

/** A tiny line of a capo's weekly kick-ups. */
function Sparkline({ values, w = 120, h = 28 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Kick-ups, last ${values.length} weeks`} className="shrink-0">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gold-400" />
      <circle cx={w} cy={h - 2 - (last / max) * (h - 4)} r="2" className="fill-gold-300" />
    </svg>
  );
}

function Panel({ title, children, note, id }: { title: string; children: ReactNode; note?: string; id?: string }) {
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0" data-testid={id}>
      <div className="panel-title">{title}</div>
      {note && <p className="text-[11px] text-stone-500 mt-0.5">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

const wk = (w: number) => formatDate(dateOfWeek(Math.max(1, w)));

/** THE BOOKS: the boss's private ledger, drawn line for line from the one ledger. */
export function TheBooks({ s }: { s: GameState }) {
  const b = s.ledgerBook;
  const [who, setWho] = useState('');
  const [section, setSection] = useState<Section | ''>('');
  const [src, setSrc] = useState('');
  const [week, setWeek] = useState('');
  const weeks = visibleWeeks(s);
  const all = useMemo(() => filterLines(s, {}), [s]);
  const lines = useMemo(() => filterLines(s, { who: who || undefined, section: section || undefined, src: src || undefined, week: week ? Number(week) : undefined }), [s, who, section, src, week]);
  if (!b) return <div className="text-sm text-stone-400" data-testid="the-books">The books start with the first week you run.</div>;
  const mode = MODE_INFO[b.mode];
  const kp = keeper(s);
  const people = [...new Set(all.map((x) => x.line.w).filter((x): x is string => !!x))];
  const sources = [...new Set(all.map((x) => x.line.s).filter((x): x is string => !!x))];
  const trends = capoTrends(s);
  const rec = reconcileBooks(s).filter((r) => weeks.some((w) => w.week === r.week));
  const recOk = rec.every((r) => r.ok);
  const total = lines.reduce((a, x) => a + x.line.a, 0);
  const tribute = all.filter((x) => x.section === 'tribute');
  const pad = all.filter((x) => x.section === 'pad');
  const padBy = new Map<string, { n: number; total: number }>();
  for (const p of pad) {
    const k = p.line.l.split(' (')[0];
    const v = padBy.get(k) ?? { n: 0, total: 0 };
    v.n++;
    v.total += p.line.a;
    padBy.set(k, v);
  }
  const open = b.discrepancies.filter((d) => !d.settled && s.characters[d.whoId]?.alive && s.characters[d.whoId]?.faction === 'player');
  const settled = b.discrepancies.filter((d) => d.settled).slice(-5).reverse();
  const receipts = b.receipts.slice(-10).reverse();
  const lastWeek = weeks[weeks.length - 1];
  const hooksMine = s.hooks.filter((h) => h.holder === 'player' && s.characters[h.targetId]?.alive);
  const hooksOnUs = s.hooks.filter((h) => h.holder !== 'player' && s.characters[h.targetId]?.faction === 'player' && s.characters[h.targetId]?.alive);
  const boons = Object.values(s.pol?.boons ?? {}).filter((x) => x.until > s.week);
  const owedToUs = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && (c.arrears ?? 0) > 0);
  const ourMenOwe = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.debtTo);
  const onYou = rivalBonesOnYou(s).slice(0, 4);

  return (
    <div className="space-y-4 min-w-0" data-testid="the-books">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="How they're kept" value={b.mode === 'head' ? 'In your head' : b.mode === 'coded' ? 'Coded ledger' : 'Full books'} sub={`${mode.retain} weeks remembered`} />
        <Stat label="Bookkeeper" value={kp ? kp.firstName + ' ' + kp.lastName : 'You'} sub={kp ? `skill ×${keeperSkill(s).toFixed(2)} · honesty ${honesty(s, kp)}` : 'nobody else counts'} warn={!!kp && honesty(s, kp) < 35} />
        <Stat label="If they're seized" value={`+${raidExposure(s)} evidence`} sub={`on your file (${Math.round(player(s).evidence ?? 0)} now)`} warn={raidExposure(s) >= 10} />
        <Stat label="Books balance" value={recOk ? 'To the dollar' : 'Off'} sub={lastWeek ? `last week ${fmt$(lastWeek.end - lastWeek.start)}` : 'nothing yet'} warn={!recOk} />
      </section>

      <Panel title="How the books are kept" note="More detail means more control: skims show up sooner and your figures are closer. It also means more evidence when a raid seizes the ledger, or your bookkeeper flips." id="books-mode">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => <ActionCard key={m} s={s} action={{ kind: 'ledger', op: { op: 'mode', mode: m } }} />)}
        </div>
        {b.seizures.length > 0 && (
          <ul className="mt-2 text-xs text-red-300 space-y-0.5">
            {b.seizures.slice(-3).reverse().map((z, i) => <li key={i}>{wk(z.week)}: {z.by === 'flip' ? 'your bookkeeper took the books to the Feds' : `${z.by === 'fbi' ? 'the FBI' : 'the county detectives'} seized your ${z.mode === 'full' ? 'books' : 'coded ledger'}`} (+{z.evidence} on your file).</li>)}
          </ul>
        )}
      </Panel>

      <Panel title="Envelopes" note={`Every money line of the ledger, week by week, as posted. ${weeks.length} week${weeks.length === 1 ? '' : 's'} in the books.`} id="books-envelopes">
        <div className="flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">Person
            <select className="bg-noir-900 border border-noir-700 rounded px-1 py-0.5 max-w-[10rem]" value={who} onChange={(e) => setWho(e.target.value)} data-testid="filter-person">
              <option value="">Everyone</option>
              {people.map((id) => <option key={id} value={id}>{s.characters[id] ? displayName(s.characters[id]) : id}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">Racket
            <select className="bg-noir-900 border border-noir-700 rounded px-1 py-0.5 max-w-[10rem]" value={section} onChange={(e) => setSection(e.target.value as Section | '')} data-testid="filter-racket">
              <option value="">All kinds</option>
              {(Object.keys(SECTION_LABEL) as Section[]).filter((k) => all.some((x) => x.section === k)).map((k) => <option key={k} value={k}>{sectionLabel(s, k)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">Place
            <select className="bg-noir-900 border border-noir-700 rounded px-1 py-0.5 max-w-[10rem]" value={src} onChange={(e) => setSrc(e.target.value)}>
              <option value="">Anywhere</option>
              {sources.map((id) => <option key={id} value={id}>{srcName(s, id) ?? id}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">Week
            <select className="bg-noir-900 border border-noir-700 rounded px-1 py-0.5" value={week} onChange={(e) => setWeek(e.target.value)} data-testid="filter-week">
              <option value="">All weeks</option>
              {weeks.slice().reverse().map((w) => <option key={w.week} value={w.week}>{wk(w.week)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="w-full text-xs table-fixed">
            <tbody>
              {lines.slice().reverse().slice(0, 200).map((x, i) => (
                <tr key={i} className="border-b border-noir-800 align-top">
                  <td className="w-16 sm:w-24 py-0.5 text-stone-500 tabular-nums">{wk(x.week).replace(/, \d{4}$/, '')}</td>
                  <td className="py-0.5 pr-1 text-stone-300 break-words">
                    {x.line.l}
                    {x.line.w && <> · <CharLink s={s} id={x.line.w} className="text-stone-400" /></>}
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-stone-600">{sectionLabel(s, x.section)}</span>
                  </td>
                  <td className={`w-20 py-0.5 text-right tabular-nums ${x.line.a >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmt$(x.line.a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length === 0 && <div className="text-xs text-stone-500">Nothing in the books for that.</div>}
        </div>
        <div className="mt-1 text-xs text-stone-400 flex justify-between"><span>{lines.length} lines</span><span className="tabular-nums">Net {fmt$(total)}</span></div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Kick-ups by capo" note="Week by week from the books. Short means the books expect more than came in." id="books-capos">
          <ul className="space-y-2">
            {trends.map((t) => {
              const c = s.characters[t.id];
              const notes = weeks.flatMap((w) => w.kicks.filter((k) => k.k === t.id));
              const late = notes.reduce((a, n) => a + n.held, 0);
              return (
                <li key={t.id} className="flex items-center gap-2 text-xs min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate"><CharLink s={s} id={t.id} className="text-stone-100" />{c && !c.alive ? ' †' : ''}</div>
                    <div className="text-stone-500">{fmt$(t.total)} in {t.values.length} wks{late ? ` · held back ${fmt$(late)}` : ''}{t.late ? ` · owes ${fmt$(t.late)}` : ''}{t.flagged ? <span className="text-red-300"> · {t.flagged} flag{t.flagged > 1 ? 's' : ''}</span> : ''}</div>
                  </div>
                  <Sparkline values={t.values} />
                </li>
              );
            })}
            {trends.length === 0 && <li className="text-xs text-stone-500">No capo has kicked up yet.</li>}
          </ul>
        </Panel>

        <Panel title="Short, late and skimming" note={`What the books turned up. ${b.mode === 'head' ? 'From memory: rough, and sometimes wrong.' : b.mode === 'coded' ? 'Close enough.' : 'To the dollar.'}`} id="books-discrepancies">
          <ul className="space-y-2">
            {open.map((d) => {
              const c = s.characters[d.whoId];
              const threaten = c?.alive ? interactionsFor(s, c.id).find((p) => p.id === 'threaten' || p.id === 'demand') : undefined;
              return (
                <li key={d.id} className="rounded border border-red-900/60 bg-red-950/20 p-2 text-xs">
                  <div className="text-red-200">{d.text}.</div>
                  <div className="text-stone-500">{wk(d.week)} · {d.kind === 'receipt' ? 'a report that did not hold up' : 'the envelope'}{d.src ? ` · ${srcName(s, d.src) ?? ''}` : ''}</div>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <ActionCard s={s} action={{ kind: 'ledger', op: { op: 'confront', discId: d.id } }} compact />
                    <ActionCard s={s} action={{ kind: 'ledger', op: { op: 'forgive', discId: d.id } }} compact />
                    {threaten && c && <ActionCard s={s} action={{ kind: 'interact', id: threaten.id, target: c.id }} compact />}
                  </div>
                </li>
              );
            })}
            {open.length === 0 && <li className="text-xs text-stone-500">Nothing the books can't account for{b.mode === 'head' ? ' — that you can remember' : ''}.</li>}
            {settled.map((d) => <li key={d.id} className="text-[11px] text-stone-500">{wk(d.settledWeek ?? d.week)}: {s.characters[d.whoId]?.firstName ?? '?'} — {d.settled}.</li>)}
          </ul>
        </Panel>
      </div>

      <Panel title="Receipts" note="After a job, whoever did it hands in his report. It is as true as he is honest. Check a bad one with the consigliere (quiet) or the enforcer (loud)." id="books-receipts">
        <ul className="space-y-2">
          {receipts.map((r, ri) => {
            const c = s.characters[r.byId];
            return (
              <li key={r.id} className="rounded border border-noir-700 bg-noir-900/50 p-2 text-xs">
                <div className="flex flex-wrap justify-between gap-x-2"><span><CharLink s={s} id={r.byId} className="text-stone-100" /> on {r.job}</span><span className="text-stone-500">{wk(r.week)}{r.reported ? ` · handed in ${fmt$(r.reported)}` : ''}</span></div>
                <div className="italic text-stone-300 mt-0.5">"{r.said}"</div>
                {r.checked ? (
                  <div className={`mt-1 ${r.checked.caught ? 'text-red-300' : 'text-stone-400'}`}>{r.checked.caught ? `Checked by the ${r.checked.via}: a lie. ${r.truth}` : r.lie ? `The ${r.checked.via} found nothing.` : `The ${r.checked.via} says it checks out.`}</div>
                ) : c?.alive && ri < 3 ? (
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <ActionCard s={s} action={{ kind: 'ledger', op: { op: 'check', receiptId: r.id, via: 'consigliere' } }} compact label="Ask the consigliere" />
                    <ActionCard s={s} action={{ kind: 'ledger', op: { op: 'check', receiptId: r.id, via: 'enforcer' } }} compact label="Send the enforcer" />
                  </div>
                ) : null}
              </li>
            );
          })}
          {receipts.length === 0 && <li className="text-xs text-stone-500">No jobs reported yet.</li>}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tribute to Philly" id="books-tribute">
          <ul className="text-xs space-y-0.5">
            {tribute.slice().reverse().map((x, i) => <li key={i} className="flex justify-between gap-2"><span className="text-stone-300 min-w-0 break-words">{wk(x.week)} — {x.line.l}</span><span className="tabular-nums text-red-300 shrink-0">{fmt$(x.line.a)}</span></li>)}
            {tribute.length === 0 && <li className="text-stone-500">No envelope across the bridge in the books.</li>}
          </ul>
        </Panel>

        <Panel title="The shylock book" note={`${s.loans.length} loan${s.loans.length === 1 ? '' : 's'} on the street · ${fmt$(s.loans.reduce((a, l) => a + l.principal, 0))} out · ${fmt$(s.loans.reduce((a, l) => a + l.vig, 0))}/wk vig`} id="books-shylock">
          <ul className="text-xs space-y-0.5">
            {s.loans.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span className="min-w-0 break-words text-stone-300">{l.borrower}{l.collateralName ? ` (on ${l.collateralName})` : ''}</span>
                <span className={`tabular-nums shrink-0 ${l.weeksLate ? 'text-red-300' : 'text-stone-200'}`}>{fmt$(l.principal)} · {fmt$(l.vig)}/wk{l.weeksLate ? ` · ${l.weeksLate} wk behind` : ''}</span>
              </li>
            ))}
            {s.loans.length === 0 && <li className="text-stone-500">Nothing on the street.</li>}
          </ul>
        </Panel>

        <Panel title="Debts" id="books-debts">
          <div className="text-xs space-y-1">
            <div className="text-stone-500 uppercase tracking-wider text-[10px]">You owe</div>
            {s.debts.map((d) => <div key={d.id} className="flex justify-between gap-2"><span>{d.lender}</span><span className="tabular-nums text-red-300">{fmt$(d.weeklyPayment)}/wk × {d.weeksLeft}</span></div>)}
            {s.debts.length === 0 && <div className="text-stone-500">Nobody.</div>}
            <div className="text-stone-500 uppercase tracking-wider text-[10px] pt-1">Owed to you</div>
            {owedToUs.map((c) => <div key={c.id} className="flex justify-between gap-2"><CharLink s={s} id={c.id} /><span className="tabular-nums text-emerald-300">{fmt$(c.arrears ?? 0)} held back</span></div>)}
            {owedToUs.length === 0 && <div className="text-stone-500">Nobody is behind.</div>}
            {ourMenOwe.length > 0 && <div className="text-stone-500 uppercase tracking-wider text-[10px] pt-1">Your men owe rivals</div>}
            {ourMenOwe.map((c) => <div key={c.id} className="flex justify-between gap-2"><CharLink s={s} id={c.id} /><span className="tabular-nums text-amber-300">{fmt$(c.debtTo!.amount)} to {FACTION_NAMES[c.debtTo!.rival]}</span></div>)}
          </div>
        </Panel>

        <Panel title="Favors" id="books-favors">
          <div className="text-xs space-y-1">
            <div>{s.favors} political favor{s.favors === 1 ? '' : 's'} owed to you.</div>
            {boons.map((x, i) => <div key={i} className="text-stone-300">In force: {x.label} (until {wk(x.until)})</div>)}
            {hooksMine.slice(0, 8).map((h) => <div key={h.id} className="text-gold-300"><CharLink s={s} id={h.targetId} /> owes you: {h.reason}{h.strong ? '' : ' (spent when used)'}</div>)}
            {hooksOnUs.slice(0, 6).map((h) => <div key={h.id} className="text-red-300">{FACTION_NAMES[h.holder]} has something on <CharLink s={s} id={h.targetId} />: {h.reason}</div>)}
            {!hooksMine.length && !hooksOnUs.length && <div className="text-stone-500">No hooks either way.</div>}
          </div>
        </Panel>

        <Panel title="The pad" note="Cops and officials, by the envelopes in the books." id="books-pad">
          <ul className="text-xs space-y-0.5">
            {[...padBy.entries()].sort((a, b) => a[1].total - b[1].total).map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span className="min-w-0 break-words text-stone-300">{k} <span className="text-stone-500">×{v.n}</span></span><span className="tabular-nums text-red-300 shrink-0">{fmt$(v.total)}</span></li>)}
            {pad.length === 0 && <li className="text-stone-500">Nobody on the pad in these weeks.</li>}
          </ul>
        </Panel>

        <Panel title="Big scores and the split" id="books-scores">
          <ul className="text-xs space-y-0.5">
            {b.scores.slice().reverse().slice(0, 10).map((x, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="min-w-0 break-words"><span className="text-stone-500">{wk(x.week)}</span> <CharLink s={s} id={x.byId} />: {x.what} ({fmt$(x.value)})</span>
                <span className="tabular-nums shrink-0 text-stone-200">you {fmt$(x.yours)} · him {fmt$(x.value - x.yours)}</span>
              </li>
            ))}
            {b.scores.length === 0 && <li className="text-stone-500">No big scores yet.</li>}
          </ul>
        </Panel>
      </div>

      {onYou.length > 0 && (
        <Panel title="Made their bones on your people" id="books-rival-bones">
          <ul className="text-xs space-y-0.5">{onYou.map((x, i) => <li key={i} className="text-red-300">{wk(x.week)}: {x.name} ({FACTION_NAMES[x.rival]}) — {x.cost}</li>)}</ul>
        </Panel>
      )}

      <Panel title="Bookkeeper" note="He sees every envelope. A crooked one covers for his friends; a scared one walks the books into the federal building." id="books-keeper">
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'ledger', op: { op: 'keeper' } }} compact />
        </div>
        <div className="mt-2"><KeeperPicker s={s} /></div>
      </Panel>

      <p className="text-[11px] text-stone-500" data-testid="books-reconcile">
        Reconciliation: {rec.map((r) => `${wk(r.week).replace(/, \d{4}$/, '')} ${r.ok ? '✓' : `✗ (${fmt$(r.lines)} vs ${fmt$(r.delta)})`}`).join(' · ') || 'nothing yet'}.
      </p>
    </div>
  );
}
