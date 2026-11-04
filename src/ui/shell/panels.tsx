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
import { LoanDesk } from '../econ/LoanDesk';
import { HousesSummary } from '../econ/HomePanel';
import { Holdings } from '../econ/Holdings';
import { RacketHub } from '../econ/RacketHub';
import { DirtyWork } from '../econ/DirtyWork';
import { GearPanel, TechPanel } from '../econ/FamilyDevelopment';
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
import { ShadowCourt } from '../power/ShadowCourt';
import { CouncilSeats } from '../borgata/CouncilSeats';
import { ChainOfCommandPlace } from '../lieutenants/Lieutenants';
import { TheRise } from '../borgata/TheRise';
import { YourPlace } from '../borgata/YourPlace';
import { CaposSection, MenRoster } from '../borgata/Capos';
import { MyMen } from '../borgata/MyMen';
import { ProgressBoard } from '../borgata/CrewXp';
import { Protection } from '../borgata/Protection';
import { PlanNew } from './sections/PlanNew';
import { PatronagePanel } from '../town/Patronage';
import { Happening } from '../town/Happening';
import { Feed } from './Feed';
import { TheBook } from '../book/TheBook';
import { WalkLauncher } from '../hood/WalkLauncher';
import { GoodLifePanel } from '../econ/GoodLife';
import { SpendPanel } from '../econ/SpendPanel';
import { StorePanel } from '../store/StorePanel';
import { PocketShop } from '../store/PocketShop';
import { HousesPanel } from '../houses/HousesPanel';
import { WeeklyTake } from '../tribute/WeeklyTake';
import { MoneyView } from '../money/MoneyView';
import { EarningsBoard } from '../tribute/EarningsBoard';
import { HoodDashboard } from '../hood/HoodDashboard';
import { MissionBoard, PactsPanel } from '../hood/MissionBoard';
import { EmpireSection } from '../empire/EmpireSection';
import { NightPanel } from '../ears/EarsPanel';
import { NightlifePanel } from '../nightlife/NightlifePanel';
import { HerBook } from '../town/HerBook';
import { DatingPanel } from '../dating/DatingPanel';
import { YourPeople } from '../bonds/YourPeople';
import { AttachmentBoard } from '../ears/Connections';
import { IntrigueBoard } from '../intrigue/IntrigueBoard';
import { WarRoom } from '../intrigue/WarRoom';
import { ArmyPanel } from '../army/ArmyPanel';
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
      { id: 'people', label: 'Your people', blurb: 'Your wife, your goomars, your kids, your friends, your crew and your enemies: how they feel about you, what they remember, what they want right now.', render: (s) => <YourPeople s={s} /> },
      { id: 'dating', label: 'Relationships & Dating', blurb: 'People you know, dates and relationships, adult services with their prices, and family & consequences. She always decides.', render: (s) => <DatingPanel s={s} /> },
      { id: 'lifestyle', label: 'Lifestyle & Perks', render: (s) => <LifestylePanel s={s} /> },
      { id: 'pocket', label: 'Your Pocket', wide: true, blurb: 'Spend it on yourself: his house, a summer place, a condo in Florida, cars, the watch and the cufflinks, jewelry and furs for her, nights out, her apartment. Every card says what it does before you buy: respect, who thinks better of you, the upkeep, and what the IRS counts.', render: (s) => <PocketShop s={s} /> },
      { id: 'store', label: 'The Store', wide: true, blurb: 'Everything money buys, in eight tabs: property and legitimate businesses, vehicles and race cars, crew & services, equipment, the armory, lifestyle (watches, jewelry, racehorses, vacations), investments, family & legacy. Inspect, ask your adviser, negotiate, buy or finance. Share the wealth, and plan a vacation for the whole family.', render: (s) => <StorePanel s={s} /> },
      { id: 'spend', label: 'Spend', blurb: 'Everything money buys in 1960: cars, boats, clothes, jewelry, the house, staff, society, the children\'s occasions, vice, the pad and the crew. Your pocket and the Family\'s money, side by side; the IRS counts what your books cannot explain.', render: (s) => <SpendPanel s={s} /> },
      { id: 'possessions', label: 'The Good Life', blurb: 'Homes, cars, the boat and the toys, paid from your pocket. Every one costs upkeep, and the feds count what the books cannot explain.', render: (s) => <GoodLifePanel s={s} /> },
      { id: 'walk', label: 'Walk the town', blurb: 'Out on the Boardwalk as yourself: walk up to a place to go in, buy it or run it; call a meeting; plan a trip.', render: (s) => <WalkLauncher s={s} /> },
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
      { id: 'court', label: 'The Succession', blurb: 'Who backs whom as far as you know it, the underboss\'s court, the promises you have heard of, and your moves.', render: (s) => <ShadowCourt s={s} /> },
      { id: 'activities', label: 'Activities', render: (s) => <ActivitiesPanel s={s} /> },
      { id: 'decisions', label: 'Decisions', render: (s) => <DecisionsPanel s={s} /> },
      { id: 'legacy', label: 'Legacy & Renown', render: (s) => <LegacyPanel s={s} /> },
    ],
  },
  {
    id: 'borgata', icon: '⚑', label: 'The Borgata', short: 'Borgata', key: 'b',
    blurb: 'Your men: the org chart, the council, the capos, who gets made.',
    sections: [
      { id: 'place', label: 'Your place', wide: true, blurb: 'Where you stand in the family above you, and the way up.', render: (s) => <YourPlace s={s} /> },
      { id: 'rise', label: 'The Rise', wide: true, blurb: 'Grow the family: the ladder, your capos front and center (territory, take, mood, ambition, their men), every man\'s level, focus and newest perk, and who is ready for more.', render: (s) => <TheRise s={s} /> },
      { id: 'chart', label: 'Org Chart', wide: true, render: (s) => <CrewTree s={s} chartOnly /> },
      { id: 'take', label: 'The Weekly Take', wide: true, blurb: 'Every Monday the underboss brings the crews\' money and your cut goes in on its own: the envelope, crew accounts, agreements, disputes, the ledger.', render: (s) => <WeeklyTake s={s} /> },
      { id: 'earnings', label: 'The Family\'s Earnings', wide: true, blurb: 'Everyone in the family, what each man earned, kicked up and kept this week, and how much money he has.', render: (s) => <EarningsBoard s={s} /> },
      { id: 'council', label: 'Council', blurb: 'Five seats, one job each a week. Click a face to open him; click an empty seat to compare candidates.', render: (s) => <CouncilSeats s={s} /> },
      { id: 'chain', label: 'Who handles what', blurb: 'The chain of command: what your underboss, your consigliere and each capo handle on their own, and what waits for you. One tap: Hands-on, Balanced, Chairman.', render: (s) => <ChainOfCommandPlace s={s} /> },
      { id: 'capos', label: 'Capos & Men', render: (s) => stack(<CaposSection key="c" s={s} />, <MenRoster key="m" s={s} />) },
      { id: 'mymen', label: 'My Men', wide: true, blurb: 'Take care of your men: their money, their safety, their back. The whole crew watches how you treat each one.', render: (s) => <MyMen s={s} /> },
      { id: 'progress', label: 'Coming up', blurb: 'Every man\'s level, title and specialty: who is ready to be made or to run a crew, who is waiting on your word, who feels slighted.', render: (s) => <ProgressBoard s={s} /> },
      { id: 'membership', label: 'Membership', blurb: 'Philadelphia\'s books, and the young men who want in.', render: (s) => stack(<BooksPanel key="b" s={s} />, <CrewListPart key="h" s={s} part="hire" />) },
      { id: 'grievances', label: 'Grievances & Factions', render: (s) => stack(<PowerPart key="g" s={s} part="grievances" />, <FactionsPanel key="f" s={s} />) },
      { id: 'protect', label: 'Guards & inquiries', blurb: 'Who guards whom and on what schedule, the inquiries running and the reports you may read. Assign a guard to anyone, or have someone looked into.', render: (s) => <Protection s={s} /> },
      { id: 'orders', label: 'Orders & Edicts', render: (s) => stack(<GeneralOrders key="g" s={s} />, <CrewListPart key="e" s={s} part="edicts" />) },
    ],
  },
  {
    id: 'holdings', icon: '$', label: 'Holdings', short: 'Holdings', key: 'l',
    blurb: 'Everything that makes or keeps money: places, property, the books.',
    sections: [
      { id: 'money', label: 'Money', wide: true, blurb: 'Family money and your pocket, moving money between them, and last week in plain words: what came in, your cut, what went out. Everything is collected on its own.', render: (s) => <MoneyView s={s} /> },
      { id: 'hub', label: 'The Rackets', wide: true, blurb: 'Every racket on the island: what it pays, what it takes, how you run it. Start one, set how it runs, take the next step.', render: (s) => <RacketHub s={s} /> },
      { id: 'dirty', label: 'Dirty Work', wide: true, blurb: 'One-off jobs: a score, muscle, a fix, a load to move. Pick the job, the man, the target; one button.', render: (s) => <DirtyWork s={s} /> },
      { id: 'tech', label: 'Technology & connections', wide: true, blurb: 'Family development: new ways of doing business as the years go by. Every step, what it does for you, what it costs, and what unlocks it.', render: (s) => <TechPanel s={s} /> },
      { id: 'gear', label: 'Crew equipment', wide: true, blurb: 'How tough your crews are and why, against the other families; each crew\'s equipment, and buying more.', render: (s) => <GearPanel s={s} /> },
      { id: 'rackets', label: 'What you own', wide: true, blurb: 'What you own: upgrades, managers, the take. Open a new place below, or from a district on the map.', render: (s) => stack(<Holdings key="h" s={s} />, <Businesses key="b" s={s} />) },
      { id: 'property', label: 'Property', render: (s) => <RealEstate s={s} /> },
      { id: 'designer', label: 'Empire Designer', wide: true, blurb: 'Your motels and hotels, set up and run your way: the look, the staff, the supplies, the projects. Click one to open its Designer.', render: (s) => <EmpireSection s={s} /> },
      { id: 'hq', label: 'Headquarters', render: (s) => <HQPanel s={s} /> },
      { id: 'loandesk', label: 'Loan desk', blurb: 'Your bank or your book: the people Chemical Bank turned down, your terms (the rate up to the vig), and what happens when they stop paying.', render: (s) => <LoanDesk s={s} /> },
      { id: 'books', label: 'The Books', render: (s) => <TheBooks s={s} /> },
      { id: 'take', label: 'The Weekly Take', wide: true, blurb: 'The envelope in detail: every crew and every man, the accounts (Family money, your pocket), what is owed, investments and the full books.', render: (s) => <WeeklyTake s={s} /> },
    ],
  },
  {
    id: 'ops', icon: '☠', label: 'Operations', short: 'Ops', key: 'o',
    blurb: 'Everything your people are doing out there: schemes, hits, heists, envoys, trips.',
    sections: [
      { id: 'progress', label: 'In progress', render: (s) => <SchemesPanel s={s} /> },
      { id: 'missions', label: 'Mission Board', blurb: 'The big cases, stage by stage: who is involved, what is disputed, who knows what, and your move. Talks waiting on an answer are here too.', render: (s) => <MissionBoard s={s} /> },
      { id: 'plan', label: 'Plan new…', render: (s) => <PlanNew s={s} /> },
      { id: 'travel', label: 'Travel & Envoys', render: (s) => stack(<TravellersPanel key="t" s={s} />, <EnvoysAbroad key="e" s={s} />) },
    ],
  },
  {
    id: 'diplomacy', icon: '⚖', label: 'Diplomacy & the Table', short: 'Table', key: 'd',
    blurb: 'The other families: the board, disputes at the Table, wars, the balance of power.',
    sections: [
      { id: 'board', label: 'The Board', render: (s) => <RivalBoard s={s} /> },
      { id: 'pacts', label: 'Pacts & Families', blurb: 'Truces and partnerships with the families, and how they deal with each other when you are not in the room.', render: (s) => <PactsPanel s={s} /> },
      { id: 'table', label: 'The Table & Wars', render: (s) => <TablePanel s={s} /> },
      { id: 'balance', label: 'Balance of Power', render: (s) => <PowerPart s={s} part="blitz" /> },
      { id: 'front', label: 'The Front', render: (s) => <PowerPart s={s} part="front" /> },
      { id: 'intrigue', label: 'Intrigue', blurb: 'The era with each family, who spies on whom as far as you know, the men you suspect, the lies and rumors in play, and what you were told against what you later learned.', render: (s) => <IntrigueBoard s={s} /> },
      { id: 'army', label: 'The Army', blurb: 'Your men under arms, crew by crew; hired muscle; the mattresses; allies and pacts; what it costs a week.', render: (s) => <ArmyPanel s={s} /> },
      { id: 'warroom', label: 'The War Room', blurb: 'During a war: the fronts, your men, the war ledger, peace terms. After it: what the violence bought.', render: (s) => <WarRoom s={s} /> },
    ],
  },
  {
    id: 'town', icon: '§', label: 'Town & Law', short: 'Town', key: 't',
    blurb: 'Outside the family: your case, City Hall, the underbelly, patronage.',
    sections: [
      { id: 'case', label: 'Your Case', blurb: 'The government\'s case against the boss, from a file to a trial, and the fugitive road.', render: (s) => <LawPanel s={s} /> },
      { id: 'cityhall', label: 'City Hall & People', wide: true, render: (s) => <CityHall s={s} /> },
      { id: 'happening', label: 'What\'s happening', blurb: 'The Boardwalk\'s people living their own lives: the stories going on, the talk of the street, and the people, as far as you know.', render: (s) => <Happening s={s} /> },
      { id: 'hoods', label: 'Neighborhoods', blurb: 'Each neighborhood from its records: who lives and works there, who owns what, the police, the policy, and what changed.', render: (s) => stack(<HousesSummary key="h" s={s} />, <HoodDashboard key="d" s={s} />) },
      { id: 'underbelly', label: 'The Underbelly', render: (s) => <UnderbellyPanel s={s} /> },
      { id: 'night', label: 'The Night', blurb: 'The Madam, the Ears who hear everything, and the men who exploit women. Set-ups and reports only; she always decides.', render: (s) => <NightPanel s={s} /> },
      { id: 'nightlife', label: 'Nightlife', blurb: 'The people of the night (the young and mature high-end lists, call girls, the street, dancers, singers, bar regulars, the clubs), the madams\' houses, promises and goomars. Adults only; she always decides.', render: (s) => <NightlifePanel s={s} /> },
      { id: 'women', label: 'Women of the town', blurb: 'The women who earn their own way: the numbers, the books, fronts, politics, the switchboard, and the madams\' houses. Partner, protect, hire, lend, back, listen, squeeze or leave her be. She always decides.', render: (s) => <HerBook s={s} /> },
      { id: 'attached', label: 'Who\'s attached to whom', blurb: 'The connection web: who is sweet on whom, who is a regular, who keeps someone on the side. The Ears reveal the rest.', render: (s) => <AttachmentBoard s={s} /> },
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
      { id: 'book', label: 'Your File', wide: true, blurb: 'Everything in one place: every order and what came of it, by person, place and money. Search it, filter it, click through.', render: (s) => <TheBook s={s} /> },
    ],
  },
];

export const PANELS_BY_ID = Object.fromEntries(PANELS.map((p) => [p.id, p])) as Record<PanelId, PanelDef>;

export function sectionOf(panel: PanelId, section?: string): SectionDef | undefined {
  const p = PANELS_BY_ID[panel];
  return p?.sections.find((x) => x.id === section) ?? p?.sections[0];
}
