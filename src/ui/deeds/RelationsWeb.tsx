import { relationsWeb } from '../../engine/deeds/clash';
import type { GameState } from '../../engine/types';
import { useSheet } from '../components/People';

const EDGE: Record<string, { stroke: string; dash?: string; label: string }> = {
  friend: { stroke: '#6ee7b7', label: 'Friends' },
  ally: { stroke: '#34d399', label: 'Allies' },
  lovers: { stroke: '#f9a8d4', label: 'Sweethearts' },
  rival: { stroke: '#fbbf24', label: 'Rivals' },
  feud: { stroke: '#f87171', label: 'Feud' },
  likes: { stroke: '#6ee7b7', dash: '3 3', label: 'Likes' },
  hates: { stroke: '#f87171', dash: '3 3', label: 'Hates' },
};

const NODE: Record<string, string> = { player: '#d4a72c', manno: '#b4534a', feldstein: '#6b7bc4', kessler: '#4f9b6e', philly: '#9b6bb4', law: '#5b8bb4', none: '#8a8178' };

/**
 * The relationships web: who stands where with whom among the people who
 * matter (ties and strong feelings), around one man or across the island.
 * Tap a name for his sheet.
 */
export function RelationsWeb({ s, center, title }: { s: GameState; center?: string; title?: string }) {
  const { open } = useSheet();
  const web = relationsWeb(s, center, center ? 12 : 18);
  if (web.edges.length === 0) return (
    <section className="mt-3 text-xs" data-testid="relations-web">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{title ?? 'The web'}</div>
      <div className="mt-1 text-stone-500">No strong ties yet. Give it a few weeks: people make friends and enemies on their own.</div>
    </section>
  );
  const W = 360;
  const H = 300;
  const R = 118;
  const pos = new Map<string, [number, number]>();
  const others = web.nodes.filter((n) => n.id !== center);
  if (center) pos.set(center, [W / 2, H / 2]);
  others.forEach((n, i) => {
    const a = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, [W / 2 + Math.cos(a) * R * (center ? 1 : 1.05), H / 2 + Math.sin(a) * R * 0.95]);
  });
  const used = [...new Set(web.edges.map((e) => e.kind))];
  return (
    <section className="mt-3 text-xs" data-testid="relations-web">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{title ?? 'The web'}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full max-w-[420px]" role="img" aria-label="Who stands where with whom">
        {web.edges.map((e, i) => {
          const a = pos.get(e.a);
          const b = pos.get(e.b);
          if (!a || !b) return null;
          const st = EDGE[e.kind];
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={st.stroke} strokeWidth={e.kind === 'feud' || e.kind === 'ally' ? 2.4 : 1.4} strokeDasharray={st.dash} opacity={0.8}><title>{`${st.label}${e.why ? `: ${e.why}` : ''}`}</title></line>;
        })}
        {web.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const short = n.boss ? 'You' : n.name.replace(/ ".*" /, ' ').split(' ').slice(0, 2).join(' ');
          return (
            <g key={n.id} onClick={() => !n.boss && open(n.id)} style={{ cursor: n.boss ? 'default' : 'pointer' }}>
              <circle cx={p[0]} cy={p[1]} r={n.id === center ? 9 : 6} fill={NODE[n.faction] ?? NODE.none} stroke="#1c1917" strokeWidth={1.5} />
              <text x={p[0]} y={p[1] + (p[1] > H / 2 ? 18 : -11)} textAnchor="middle" fontSize={10} fill="#d6d3d1">{short}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 text-[10px] text-stone-500">
        {used.map((k) => <span key={k}><span style={{ color: EDGE[k].stroke }}>{EDGE[k].dash ? '┄' : '━'}</span> {EDGE[k].label}</span>)}
      </div>
    </section>
  );
}
