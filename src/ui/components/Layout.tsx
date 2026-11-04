import { useEffect, useRef, type ReactNode } from 'react';
import { DOMAIN_IDS, DOMAINS, domClass, type Domain } from '../domain';
import { AssetImg } from '../hood/AssetImg';
import type { AssetKey } from '../hood/art/assetUrls';

/**
 * THE LAYOUT KIT (LAYOUT_AUDIT.md). One way to build a screen inside a drawer:
 *
 *   <PageHeader title sub primary more />   a title row with at most ONE primary action and a More menu
 *   (the drawer's "Do this now" strip)      what needs you, on each home's front page (shell/Drawer.tsx)
 *   <Section title aside>…</Section>         a block with the one section-header style
 *   <Card tone>…</Card>                      a card: plain, attention (gold), done (emerald) or danger
 *   <ActionMenu>…buttons…</ActionMenu>       secondary actions folded into "More ▾"
 *   <StatChip label value />                 a number with its label
 *   <DoneMark>Ordered</DoneMark>             the same "✓ Done" everywhere
 *   domain="money" on Section / Card        the part of the Don's life it belongs to (ui/domain.ts):
 *                                           a coloured edge, tint, header and dot over the noir
 *   <DomainDot d /> <DomainChip d />         the domain's dot and its icon chip; <DomainLegend /> the key
 *   <CardHead d title sub aside />           a card's own header: the domain chip and the title in its ink
 *   domStat(d) / .llv-dom-btn / .llv-dom-row a stat box, a button, a list row wearing a domain
 *
 * The menu is a native <details>: its buttons are always in the page (tests and screen readers find
 * them, test ids are kept), folded until opened. Nothing here removes an option; it only groups them.
 */

/** A screen's title row: the title, one line under it, the one primary action, and a More menu. */
export function PageHeader({ title, sub, primary, more, testid }: {
  title: ReactNode;
  sub?: ReactNode;
  /** The one thing this screen most wants you to do (a btn-primary). */
  primary?: ReactNode;
  /** Everything else: buttons, folded into "More ▾". */
  more?: ReactNode;
  testid?: string;
}) {
  return (
    <header className="llv-pagehead" data-testid={testid}>
      <div className="min-w-0 flex-1">
        <h3 className="llv-pagehead-title">{title}</h3>
        {sub && <p className="llv-pagehead-sub">{sub}</p>}
      </div>
      {(primary || more) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {more && <ActionMenu>{more}</ActionMenu>}
          {primary}
        </div>
      )}
    </header>
  );
}

/** A section with the one header style: display serif, a short line under it, actions on the right. */
export function Section({ title, sub, aside, children, className = '', testid, domain }: {
  title?: ReactNode;
  /** The part of the Don's life (ui/domain.ts): the header takes its colour and dot. */
  domain?: Domain;
  sub?: ReactNode;
  /** Right side of the header: a count, a quiet link, a menu. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <section className={`llv-section ${domClass(domain)} ${className}`} data-testid={testid} data-domain={domain}>
      {(title || aside) && (
        <div className={`llv-section-head ${domain ? 'llv-dom' : ''}`}>
          <div className="min-w-0">
            {title && <h4 className="llv-section-title">{domain && <span className="llv-dom-dot mr-1.5 align-middle" aria-hidden />}{title}</h4>}
            {sub && <p className="llv-section-sub">{sub}</p>}
          </div>
          {aside && <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-stone-400">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type CardTone = 'plain' | 'attention' | 'done' | 'danger';

/** A card. "done" carries the corner badge, so a finished thing reads as finished at a glance. */
export function Card({ tone = 'plain', children, className = '', testid, doneLabel = 'Done', domain }: {
  tone?: CardTone;
  /** The part of the Don's life: an edge band and a faint tint in its colour (a done or danger tone still wins the border). */
  domain?: Domain;
  children?: ReactNode;
  className?: string;
  testid?: string;
  doneLabel?: string;
}) {
  return (
    <div className={`llv-card-box llv-card-${tone} ${domain ? `${domClass(domain)} llv-dom-edge llv-dom-tint` : ''} ${className}`} data-testid={testid} data-domain={domain}>
      {tone === 'done' && <span className="llv-card-donebadge"><DoneMark>{doneLabel}</DoneMark></span>}
      {children}
    </div>
  );
}

/**
 * A card's own header: the domain's icon chip (or a glyph of its own), the title in the domain's ink,
 * a line under it, and a right side (a figure, a count, a quiet link). Colour is never the only signal:
 * the chip carries an icon and the title its words.
 */
export function CardHead({ d, title, sub, aside, glyph, className = '', testid }: {
  d?: Domain;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  /** The chip's icon (defaults to the domain's glyph). */
  glyph?: ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <div className={`llv-cardhead ${domClass(d)} ${className}`} data-testid={testid}>
      {d && <DomainChip d={d} glyph={glyph} size={24} className="mt-px" />}
      <div className="min-w-0 flex-1">
        <div className={`llv-cardhead-title ${d ? 'llv-dom-ink' : ''}`}>{title}</div>
        {sub && <p className="llv-section-sub mt-0.5">{sub}</p>}
      </div>
      {aside && <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-stone-400">{aside}</div>}
    </div>
  );
}

/**
 * A place's banner: the painting of the place (the asset store) under a dark wash, the title over it in the
 * domain's ink. Without the painting (offline, the single file) a drawn wash in the domain's colour, so it never
 * reads as an empty box. Decorative: the title and line carry the meaning.
 */
export function PlaceBanner({ art, d, title, sub, aside, testid }: { art: AssetKey | AssetKey[]; d: Domain; title: ReactNode; sub?: ReactNode; aside?: ReactNode; testid?: string }) {
  return (
    <div className={`llv-banner ${domClass(d)}`} data-testid={testid} data-domain={d}>
      <AssetImg k={art} alt="" className="llv-banner-img" fallback={<span className="llv-banner-fallback" aria-hidden />} />
      <div className="llv-banner-wash" aria-hidden />
      <div className="relative flex h-full items-end gap-2 p-3">
        <DomainChip d={d} size={26} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-tight llv-dom-ink sm:text-xl">{title}</div>
          {sub && <div className="text-[12px] leading-snug text-stone-200">{sub}</div>}
        </div>
        {aside && <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{aside}</div>}
      </div>
    </div>
  );
}

/** "✓ Done", "✓ Ordered", "✓ Sent": the one finished mark. */
export function DoneMark({ children = 'Done', className = '' }: { children?: ReactNode; className?: string }) {
  return <span className={`llv-done ${className}`} data-done="true"><span aria-hidden>✓</span> {children}</span>;
}

/** The stat box's domain treatment (an edge and a faint wash), for hand-built stat boxes too. */
export function domStat(d: Domain | undefined): string {
  return d ? `${domClass(d)} llv-dom-edge` : '';
}

/** A number with its label, the same everywhere (top of a page, a man's card). */
export function StatChip({ label, value, sub, tone, testid, domain, className = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn'; testid?: string; domain?: Domain; className?: string }) {
  const t = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-200' : 'text-stone-100';
  return (
    <div className={`llv-stat ${domStat(domain)} ${className}`} data-testid={testid} data-domain={domain}>
      <div className="llv-stat-label">{label}</div>
      <div className={`llv-stat-value ${t}`}>{value}</div>
      {sub && <div className="llv-stat-sub">{sub}</div>}
    </div>
  );
}

/**
 * Secondary actions folded into one "More ▾" button. The children are ordinary buttons (keep their
 * test ids); a click on one closes the menu. Escape and a click outside close it too.
 */
export function ActionMenu({ label = 'More', children, align = 'right', testid, className = '' }: {
  label?: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  testid?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const away = (e: Event) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && el.open) { el.open = false; e.stopPropagation(); } };
    document.addEventListener('pointerdown', away);
    el.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); el.removeEventListener('keydown', key); };
  }, []);
  return (
    <details ref={ref} className={`llv-menu ${className}`} data-testid={testid}>
      <summary className="llv-menu-btn" aria-haspopup="menu">{label} <span aria-hidden className="text-stone-500">▾</span></summary>
      <div className={`llv-menu-panel ${align === 'left' ? 'left-0' : 'right-0'}`} role="menu"
        onClick={(e) => { if ((e.target as HTMLElement).closest('button:not([disabled])')) ref.current?.removeAttribute('open'); }}>
        {children}
      </div>
    </details>
  );
}

/** Screen-level tabs: an underlined segmented row, visibly not a row of action buttons. */
export function SubTabs<T extends string>({ tabs, value, onChange, testid, label }: {
  tabs: { id: T; label: ReactNode; testid?: string; badge?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  testid?: string;
  label?: string;
}) {
  return (
    <div className="llv-seg tabbar" role="tablist" aria-label={label} data-testid={testid}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} data-testid={t.testid}
          className={`llv-seg-tab ${t.id === value ? 'llv-seg-on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}{t.badge}
        </button>
      ))}
    </div>
  );
}

/** When a list is empty: say so, and say what to do. */
export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="llv-empty" role="status">
      <div className="font-semibold text-stone-200">{title}</div>
      {children && <div className="mt-0.5 text-stone-400">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A domain's dot (with its name for screen readers: colour is never the only signal). */
export function DomainDot({ d, className = '' }: { d: Domain | undefined; className?: string }) {
  if (!d) return null;
  return <span className={`${domClass(d)} llv-dom-dot ${className}`} role="img" aria-label={DOMAINS[d].label} title={DOMAINS[d].label} />;
}

/** A domain's icon chip: its glyph on a tint of its colour. */
export function DomainChip({ d, size = 22, glyph, className = '' }: { d: Domain | undefined; size?: number; glyph?: ReactNode; className?: string }) {
  if (!d) return null;
  return (
    <span className={`${domClass(d)} llv-dom-chip ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }} title={DOMAINS[d].label} aria-hidden>
      {glyph ?? DOMAINS[d].glyph}
    </span>
  );
}

/** The key to the colours: each part of the Don's life, its colour, its glyph and what it covers (Settings and Help). */
export function DomainLegend({ compact }: { compact?: boolean }) {
  return (
    <ul className={`grid gap-1.5 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`} data-testid="domain-legend" aria-label="What the colours mean">
      {DOMAIN_IDS.map((d) => (
        <li key={d} className={`${domClass(d)} llv-card-box llv-card-plain llv-dom-edge llv-dom-tint flex items-start gap-2 px-2.5 py-1.5`}>
          <DomainChip d={d} />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold llv-dom-ink">{DOMAINS[d].label}</span>
            {!compact && <span className="block text-[11px] leading-snug text-stone-400">{DOMAINS[d].blurb}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
