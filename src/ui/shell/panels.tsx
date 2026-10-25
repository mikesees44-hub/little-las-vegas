import type { ReactNode } from 'react';
import type { GameState, SuccessionLaw, WeeklyReport } from '../../engine/types';
import { Businesses } from '../components/Businesses';
import { CharacterSheet } from '../components/CharacterSheet';
import { CrewListPart } from '../components/CrewList';
import { BooksPanel, CrewTree, FactionsPanel, GeneralOrders } from '../components/CrewTree';
import { LawPanel } from '../components/LawPanel';
import { LifestylePanel } from '../components/Lifestyle';
import { OfficePanel } from '../components/OfficePanel';
import { SchemesPanel } from '../components/Schemes';
import { TablePanel } from '../components/TablePanel';
import { UnderbellyPanel } from '../components/UnderbellyPanel';
import { CityHall } from '../cityhall/CityHall';
import { HQPanel } from '../econ/HQPanel';
import { Holdings } from '../econ/Holdings';
import { RealEstate } from '../econ/RealEstate';
import { TheBooks } from '../books/TheBooks';
import { ActivitiesPanel } from '../family/ActivitiesPanel';
import { DecisionsPanel } from '../family/DecisionsPanel';
import { DynastyTree } from '../family/DynastyTree';
import { HouseHeader } from '../family/FamilyTab';
import { LegacyPanel } from '../family/LegacyPanel';
import { MarriagePanel } from '../family/MarriagePanel';
import { EnvoysAbroad } from '../map/MapView';
import { AudiencePanel } from '../power/AudiencePanel';
import { PowerPart } from '../power/PowerTab';
import { TravellersPanel } from '../travel/Panels';
import { RivalBoard } from './sections/RivalBoard';
import { Succession } from '../house/Succession';
import { CouncilSeats } from '../borgata/CouncilSeats';
import { CaposSection, MenRoster } from '../borgata/Capos';
import { PlanNew } from './sections/PlanNew';
import { PatronagePanel } from '../town/Patronage';
import { Feed } from './Feed';
import { GoodLifePanel } from '../econ/GoodLife';
import { HousesPanel } from '../houses/HousesPanel';
import { HoodDashboard } from '../hood/HoodDashboard';
import type { PanelId, Route } from './routes';

/**
 * The panel registry: the seven drawers of the map-first shell plus the
 * feed, each a list of sections. A branch that adds a screen adds ONE line
 * here (a section) instead of editing a tab list and a render switch.
 * Existing components are reused unchanged inside the sections.
 */

/** What a section may need from the App beyond the state. */
export interface SectionCtx {
  pendingLaw?: SuccessionLaw;
  pendingHeir?: string;
  onLaw: (l: SuccessionLaw) => void;
  onHeir: (id: string) => void;
  /** Go to another drawer and section ('holdings.property', or an old tab id). */
  go: (r: Route | string) => void;
  /** Weekly reports from this sitting, and opening one. */
  reports: WeeklyReport[];
  openReports: (r: WeeklyReport[]) => void;
  /** The house page open in Houses (undefined = the list). */
  houseSel?: string;
  onHouseSel: (id?: string) => void;
}

export interface SectionDef {
  id: string;
  label: string;
  /** One line under the section tabs: what this is for. */
  blurb?: string;
  /** Needs room: the drawer opens wide (org chart, family tree, City Hall). */
  wide?: boolean;
  render: (s: GameState, ctx: SectionCtx) => ReactNode;
}

export interface PanelDef {
  id: PanelId;
  icon: string;
  label: string;
  /** The rail's short label. */
  short: string;
  /** One-line description (rail hover). */
  blurb: string;
  /** Letter shortcut. */
  key: string;
  sections: SectionDef[];
}

const stack = (...nodes: ReactNode[]) => <div className="space-y-6">{nodes}</div>;

export const PANELS: PanelDef[] = [
  {
    id: 'you', icon: '☺', label: 'You', short: 'You', key: 'y',
    blurb: 'The boss himself: his sheet, how he rules, who comes to see him.',
    sections: [
      { id: 'character', label: 'Character', render: (s) => stack(<PowerPart key="st" s={s} part="station" />, <CharacterSheet key="cs" s={s} id={s.playerId} onClose={() => {}} embedded />) },
      { id: 'lifestyle', label: 'Lifestyle & Perks', render: (s) => <LifestylePanel s={s} /> },
      { id: 'possessions', label: 'The Good Life', blurb: 'Homes, cars, the boat and the toys. Every one costs upkeep, and the feds count what the books cannot explain.', render: (s) => <GoodLifePanel s={s} /> },
      { id: 'court', label: 'Hold court', blurb: 'Office hours and the Audience: the people who come to the boss.', render: (s) => stack(<OfficePanel key="o" s={s} />, <AudiencePanel key="a" s={s} />) },
    ],
  },
  {
    id: 'house', icon: '♔', label: 'The House', short: 'House', key: 'h',
    blurb: 'Your blood: the tree, marriages, the heir, the house\'s name.',
    sections: [
      { id: 'tree', label: 'Family Tree', wide: true, render: (s) => <div className="space-y-3" data-testid="family-tab"><HouseHeader s={s} /><DynastyTree s={s} /></div> },
      { id: 'houses', label: 'All the Houses', wide: true, blurb: 'Every family on the island and beyond: trees back to the old country, the living and the dead.', render: (s, c) => <HousesPanel s={s} selected={c.houseSel} onSelect={c.onHouseSel} /> },
      { id: 'marriages', label: 'Marriages & Children', render: (s) => <MarriagePanel s={s} /> },
      { id: 'succession', label: 'Succession', blurb: 'One place for the heir: the law, how he is named, who is pushing.', render: (s, c) => <Succession s={s} pendingLaw={c.pendingLaw} pendingHeir={c.pendingHeir} onLaw={c.onLaw} onHeir={c.onHeir} /> },
      { id: 'activities', label: 'Activities', render: (s) => <ActivitiesPanel s={s} /> },
      { id: 'decisions', label: 'Decisions', render: (s) => <DecisionsPanel s={s} /> },
      { id: 'legacy', label: 'Legacy & Renown', render: (s) => <LegacyPanel s={s} /> },
    ],
  },
  {
    id: 'borgata', icon: '⚑', label: 'The Borgata', short: 'Borgata', key: 'b',
    blurb: 'Your men: the org chart, the council, the capos, who gets made.',
    sections: [
      { id: 'chart', label: 'Org Chart', wide: true, render: (s) => <CrewTree s={s} chartOnly /> },
      { id: 'council', label: 'Council', blurb: 'Five seats, one job each a week. Click a face to open him; click an empty seat to compare candidates.', render: (s) => <CouncilSeats s={s} /> },
      { id: 'capos', label: 'Capos & Men', render: (s) => stack(<CaposSection key="c" s={s} />, <MenRoster key="m" s={s} />) },
      { id: 'membership', label: 'Membership', blurb: 'Philadelphia\'s books, and the young men who want in.', render: (s) => stack(<BooksPanel key="b" s={s} />, <CrewListPart key="h" s={s} part="hire" />) },
      { id: 'grievances', label: 'Grievances & Factions', render: (s) => stack(<PowerPart key="g" s={s} part="grievances" />, <FactionsPanel key="f" s={s} />) },
      { id: 'orders', label: 'Orders & Edicts', render: (s) => stack(<GeneralOrders key="g" s={s} />, <CrewListPart key="e" s={s} part="edicts" />) },
    ],
  },
  {
    id: 'holdings', icon: '$', label: 'Holdings', short: 'Holdings', key: 'l',
    blurb: 'Everything that makes or keeps money: places, property, the books.',
    sections: [
      { id: 'rackets', label: 'Rackets & Fronts', wide: true, blurb: 'What you own: upgrades, managers, the take. Open a new place below, or from a district on the map.', render: (s) => stack(<Holdings key="h" s={s} />, <Businesses key="b" s={s} />) },
      { id: 'property', label: 'Property', render: (s) => <RealEstate s={s} /> },
      { id: 'hq', label: 'Headquarters', render: (s) => <HQPanel s={s} /> },
      { id: 'books', label: 'The Books', render: (s) => <TheBooks s={s} /> },
    ],
  },
  {
    id: 'ops', icon: '☠', label: 'Operations', short: 'Ops', key: 'o',
    blurb: 'Everything your people are doing out there: schemes, hits, heists, envoys, trips.',
    sections: [
      { id: 'progress', label: 'In progress', render: (s) => <SchemesPanel s={s} /> },
      { id: 'plan', label: 'Plan new…', render: (s) => <PlanNew s={s} /> },
      { id: 'travel', label: 'Travel & Envoys', render: (s) => stack(<EnvoysAbroad key="e" s={s} />, <TravellersPanel key="t" s={s} />) },
    ],
  },
  {
    id: 'diplomacy', icon: '⚖', label: 'Diplomacy & the Table', short: 'Table', key: 'd',
    blurb: 'The other families: the board, disputes at the Table, wars, the balance of power.',
    sections: [
      { id: 'board', label: 'The Board', render: (s) => <RivalBoard s={s} /> },
      { id: 'table', label: 'The Table & Wars', render: (s) => <TablePanel s={s} /> },
      { id: 'balance', label: 'Balance of Power', render: (s) => <PowerPart s={s} part="blitz" /> },
      { id: 'front', label: 'The Front', render: (s) => <PowerPart s={s} part="front" /> },
    ],
  },
  {
    id: 'town', icon: '§', label: 'Town & Law', short: 'Town', key: 't',
    blurb: 'Outside the family: your case, City Hall, the underbelly, patronage.',
    sections: [
      { id: 'case', label: 'Your Case', blurb: 'The government\'s case against the boss, from a file to a trial, and the fugitive road.', render: (s) => <LawPanel s={s} /> },
      { id: 'cityhall', label: 'City Hall & People', wide: true, render: (s) => <CityHall s={s} /> },
      { id: 'hoods', label: 'Neighborhoods', blurb: 'Each neighborhood from its records: who lives and works there, who owns what, the police, the policy, and what changed.', render: (s) => <HoodDashboard s={s} /> },
      { id: 'underbelly', label: 'The Underbelly', render: (s) => <UnderbellyPanel s={s} /> },
      { id: 'patronage', label: 'Patronage', render: (s) => <PatronagePanel s={s} /> },
    ],
  },
  {
    id: 'chronicle', icon: '✎', label: 'Chronicle', short: 'Chronicle', key: 'c',
    blurb: 'What happened: your story, the street, the papers, the weekly reports.',
    sections: [
      { id: 'all', label: 'All', render: (s) => <Feed s={s} filter="all" /> },
      { id: 'mine', label: 'Mine', render: (s) => <Feed s={s} filter="mine" /> },
      { id: 'street', label: 'Street', render: (s) => <Feed s={s} filter="street" /> },
      { id: 'family', label: 'Family', render: (s) => <Feed s={s} filter="family" /> },
      { id: 'papers', label: 'Papers', render: (s) => <Feed s={s} filter="papers" /> },
      { id: 'stories', label: 'Storylines', render: (s) => <Feed s={s} filter="stories" /> },
      { id: 'reports', label: 'Reports', render: (s, c) => <Feed s={s} filter="reports" reports={c.reports} onReport={c.openReports} /> },
    ],
  },
];

export const PANELS_BY_ID = Object.fromEntries(PANELS.map((p) => [p.id, p])) as Record<PanelId, PanelDef>;

export function sectionOf(panel: PanelId, section?: string): SectionDef | undefined {
  const p = PANELS_BY_ID[panel];
  return p?.sections.find((x) => x.id === section) ?? p?.sections[0];
}
