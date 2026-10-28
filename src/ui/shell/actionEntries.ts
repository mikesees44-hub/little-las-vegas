import type { PlayerAction } from '../../engine/types';

/**
 * THE ACTION REGISTRY: every order the boss can give (each PlayerAction kind
 * and, for the kinds with sub-orders, each op) and where in the game it is
 * given. It is the map the declutter work is checked against
 * (tests/declutter.test.ts: nothing the engine can do goes missing from the
 * UI) and the "things to do" half of Find… (ui/shell/Find.tsx).
 *
 * `at` says where you go to do it, best first:
 *  - a registry key ("holdings.loandesk") or "nav.settings": a screen;
 *  - "person": the Deal with [person] panel (a face's ⋯ / right-click / sheet);
 *  - "place": a place's card (walk, street, lot);
 *  - "map", "office": the map or the Boss's Office;
 *  - "event": offered as a decision's choice (the week brings it to you).
 * `files` are the sources that build the order (src/…), the proof it is wired:
 * the test checks that each op's name is written in one of them.
 */
export type EntryAt = string;

export interface ActionEntry {
  kind: PlayerAction['kind'];
  /** The op names this entry covers (`type`/`op`/`t` of the kind's op). Omitted for kinds without ops. */
  ops?: string[];
  /** What it is, in the boss's words: the Find… line. */
  label: string;
  /** More words people would type for it. */
  words: string;
  at: EntryAt[];
  files: string[];
  /** Text that proves the wiring when the op's name is not written as such (a command set applied directly). */
  proof?: string;
}

export const ACTION_ENTRIES: ActionEntry[] = [
  // ---- Rackets & places you own --------------------------------------------------------------
  { kind: 'buyBusiness', label: 'Buy a business', words: 'open a new place shop bar restaurant', at: ['holdings.rackets', 'place'], files: ['ui/components/Businesses.tsx'] },
  { kind: 'sellBusiness', label: 'Sell a business', words: 'sell a place get rid of', at: ['holdings.rackets'], files: ['ui/components/Businesses.tsx'] },
  { kind: 'lend', label: 'Put money on the street (shylock)', words: 'lend loan shark vig shylock', at: ['holdings.rackets', 'holdings.loandesk'], files: ['ui/components/Businesses.tsx'] },
  { kind: 'findFrontMan', label: 'Find a front man', words: 'front man clean name license', at: ['holdings.rackets'], files: ['ui/components/Businesses.tsx'] },
  { kind: 'charterBank', label: 'Charter a bank', words: 'bank charter', at: ['holdings.rackets'], files: ['ui/components/Businesses.tsx'] },
  { kind: 'casino', label: 'Buy into (or sell) the casino', words: 'casino stake gambling', at: ['holdings.rackets'], files: ['ui/components/Businesses.tsx'] },
  { kind: 'econ', ops: ['racket'], label: 'Start or run a racket', words: 'racket numbers book protection smokes guns steady earner', at: ['holdings.hub'], files: ['ui/econ/RacketHub.tsx'] },
  { kind: 'econ', ops: ['upgrade', 'collect', 'rename'], label: 'Upgrade a place, collect, rename it', words: 'upgrade improve collect rename', at: ['holdings.rackets', 'holdings.hub'], files: ['ui/econ/Holdings.tsx', 'ui/econ/RacketHub.tsx', 'ui/econ/BizPanel.tsx'] },
  { kind: 'econ', ops: ['manager', 'oversight', 'audit', 'assistant'], label: 'Managers, oversight and audits', words: 'manager hire put someone in charge oversight audit assistant skimming', at: ['holdings.rackets', 'place'], files: ['ui/econ/LotPanel.tsx', 'ui/econ/Holdings.tsx'] },
  { kind: 'econ', ops: ['buyLot', 'leaseLot', 'deal', 'sellLot', 'slowRival', 'bid'], label: 'Buy, lease or sell property', words: 'buy land lot building lease rent real estate offer sell bid', at: ['holdings.property', 'place'], files: ['ui/econ/RealEstate.tsx', 'ui/econ/LotPanel.tsx', 'ui/hood/WalkCard.tsx', 'ui/econ/DealWindow.tsx', 'ui/econ/Holdings.tsx'] },
  { kind: 'econ', ops: ['build', 'renovate', 'permits', 'bribeInspector', 'puppetPermit', 'fixCode', 'home'], label: 'Build, fix up, permits, houses', words: 'build construct renovate fix up permits inspector code house home rent', at: ['holdings.property', 'place'], files: ['ui/econ/Holdings.tsx', 'ui/econ/HomePanel.tsx', 'ui/hood/StreetCard.tsx'] },
  { kind: 'econ', ops: ['empire'], label: 'Run your hotels & motels (Empire Designer)', words: 'hotel motel designer staff supplies project look', at: ['holdings.designer'], files: ['ui/empire/context.tsx'], proof: 'applyEmpireCmd' },
  { kind: 'econ', ops: ['bank'], label: 'Lend from your bank or book (loan desk)', words: 'loan desk bank borrow rate vig', at: ['holdings.loandesk'], files: ['ui/econ/LoanDesk.tsx'] },
  { kind: 'econ', ops: ['hq', 'sweep'], label: 'Headquarters: set it up, sweep for bugs', words: 'headquarters social club bugs sweep wire', at: ['holdings.hq', 'office'], files: ['ui/econ/HQPanel.tsx', 'ui/office/SocialClub.tsx'] },
  { kind: 'econ', ops: ['gift', 'invite', 'leverage'], label: 'Give a gift, invite to the game, gifts with strings', words: 'gift present tickets invite leverage', at: ['person'], files: ['ui/sheet/InteractionMenu.tsx', 'ui/sheet/menuCatalog.ts', 'ui/econ/Gifts.tsx'] },
  { kind: 'econ', ops: ['project'], label: 'Fund a public project', words: 'patronage public project goodwill no-show', at: ['town.patronage'], files: ['ui/town/Patronage.tsx', 'ui/econ/Gifts.tsx'] },
  { kind: 'econ', ops: ['luxBuy', 'luxSell'], label: 'The good life: homes, cars, the boat', words: 'car boat house luxury toys buy sell', at: ['you.possessions'], files: ['ui/econ/GoodLife.tsx'] },
  { kind: 'spend', ops: ['buy', 'sell'], label: 'Spend: buy anything, from a Cadillac to a church roof', words: 'spend shop buy car cadillac boat yacht plane suit fur mink jewelry diamond watch house pool maid cook bodyguard driver club church donation feast wedding communion school vegas track bribe judge lawyer bail safehouse stash accountant tax bonus turkeys funeral widows sell let go', at: ['you.spend'], files: ['ui/econ/SpendPanel.tsx'] },
  { kind: 'hood', ops: ['restyle'], label: 'Give a place a new look', words: 'restyle look neon sign style', at: ['place'], files: ['ui/hood/StreetCard.tsx'] },
  { kind: 'dirty', label: 'Dirty work: a one-off job', words: 'hijack truck shakedown fix a fight move a load beating pay off witness torch insurance fire rob game run off', at: ['holdings.dirty', 'person', 'place'], files: ['ui/econ/DirtyWork.tsx'] },
  { kind: 'dev', ops: ['adopt', 'drop', 'resp', 'mandate'], label: 'Technology & connections', words: 'technology connections develop adopt modern', at: ['holdings.tech'], files: ['ui/econ/FamilyDevelopment.tsx'] },
  { kind: 'dev', ops: ['buy', 'assign', 'repair', 'scrap'], label: 'Crew equipment', words: 'gear equipment guns cars buy assign repair', at: ['holdings.gear'], files: ['ui/econ/FamilyDevelopment.tsx'] },

  // ---- Money ------------------------------------------------------------------------------------
  { kind: 'tribute', ops: ['policy', 'squeeze', 'move'], label: 'Your cut of the envelope; move money between pots', words: 'envelope cut split tribute kick up move money pocket family', at: ['holdings.money', 'office', 'holdings.take'], files: ['ui/money/MoneyView.tsx', 'ui/money/MoneyPots.tsx', 'ui/tribute/WeeklyTake.tsx', 'ui/App.tsx'] },
  { kind: 'tribute', ops: ['audit', 'auditUb', 'terms', 'forgive'], label: 'Audit a crew, set a man\'s terms, forgive a debt', words: 'audit crew terms forgive arrears debt underboss', at: ['holdings.take'], files: ['ui/tribute/WeeklyTake.tsx'] },
  { kind: 'tribute', ops: ['ubRate', 'allowance'], label: 'The underboss\'s share, allowances', words: 'underboss share allowance wife', at: ['event', 'office'], files: ['engine/tributeEvents.ts'] },
  { kind: 'ledger', ops: ['mode', 'keeper', 'check', 'confront', 'forgive'], label: 'The books: how they are kept, the bookkeeper', words: 'books ledger bookkeeper launder wash dirty money receipts', at: ['holdings.books'], files: ['ui/books/TheBooks.tsx'] },
  { kind: 'bones', ops: ['assign', 'favor'], label: 'Make your bones: give a man his chance', words: 'bones assign hit heist collection favor made', at: ['holdings.books', 'person'], files: ['ui/books/BonesFacts.tsx'] },

  // ---- The Family (crew) ------------------------------------------------------------------------
  { kind: 'appoint', label: 'Seat a man on the council', words: 'appoint council seat underboss consigliere bagman enforcer fixer', at: ['borgata.council', 'person'], files: ['ui/sheet/menuCatalog.ts', 'ui/clarity/CandidatePicker.tsx'] },
  { kind: 'councilTask', label: 'Give a council seat its job', words: 'council task job week', at: ['borgata.council'], files: ['ui/borgata/CouncilSeats.tsx', 'ui/components/CrewList.tsx'] },
  { kind: 'policy', label: 'Set how a man earns (tax, earn, squeeze)', words: 'policy tax earn squeeze crew rule', at: ['borgata.capos', 'person'], files: ['ui/components/CrewList.tsx', 'ui/sheet/menuCatalog.ts'] },
  { kind: 'contract', label: 'Set a capo\'s cut', words: 'contract cut keep capo kick up percent', at: ['borgata.capos', 'person'], files: ['ui/components/CrewList.tsx', 'ui/borgata/Capos.tsx'] },
  { kind: 'edict', label: 'Lay down a rule for the whole family', words: 'edict rule law no junk standing order', at: ['borgata.orders'], files: ['ui/components/CrewList.tsx'] },
  { kind: 'order', label: 'Give a standing order', words: 'order shakedown expand lay low parish cops hit back clambake launder', at: ['borgata.orders', 'office'], files: ['ui/components/CrewTree.tsx', 'ui/office/BossOffice.tsx'] },
  { kind: 'hire', label: 'Hire a specialist or a young man', words: 'hire recruit specialist applicant', at: ['borgata.membership'], files: ['ui/components/CrewList.tsx'] },
  { kind: 'reassign', label: 'Move a man to another capo', words: 'reassign move crew capo transfer', at: ['person', 'borgata.chart'], files: ['ui/components/CharacterSheet.tsx', 'ui/sheet/menuCatalog.ts', 'ui/components/CrewTree.tsx'] },
  { kind: 'propose', label: 'Put a man up for membership', words: 'propose made membership books open vouch', at: ['person', 'borgata.membership'], files: ['ui/sheet/menuCatalog.ts'] },
  { kind: 'background', label: 'Check a man out', words: 'background check vet', at: ['person'], files: ['ui/components/CharacterSheet.tsx', 'ui/sheet/menuCatalog.ts'] },
  { kind: 'interact', label: 'Dinner, favors, promote, threaten, court…', words: 'dinner favor promote demote threaten whack bribe exile recruit make court affair marriage propose', at: ['person'], files: ['ui/sheet/menuCatalog.ts', 'ui/books/TheBooks.tsx'] },
  { kind: 'talk', ops: ['ask'], label: 'Talk to someone: business, advice, a meeting', words: 'talk discuss ask advice meeting sit down negotiate partner', at: ['person', 'place'], files: ['ui/sheet/menuCatalog.ts', 'ui/hood/WalkCard.tsx'] },
  { kind: 'talk', ops: ['answer'], label: 'Answer an offer someone made you', words: 'answer offer accept turn down', at: ['ops.missions'], files: ['ui/hood/MissionBoard.tsx'] },

  // ---- Jobs -----------------------------------------------------------------------------------
  { kind: 'scheme', label: 'Plan a job: a hit, a heist, an envoy, a plot', words: 'scheme plan hit murder heist score envoy befriend sway blackmail informant flip frame claim', at: ['ops.plan', 'person'], files: ['ui/components/Schemes.tsx'] },
  { kind: 'cancelScheme', label: 'Call off a job', words: 'cancel call off scheme', at: ['ops.progress'], files: ['ui/components/Schemes.tsx'] },
  { kind: 'mission', label: 'Decide a big case', words: 'mission case stage big case', at: ['ops.missions'], files: ['ui/hood/MissionBoard.tsx'] },

  // ---- The other families -----------------------------------------------------------------------
  { kind: 'declareWar', label: 'Go to war', words: 'war declare fight', at: ['diplomacy.table', 'person', 'map'], files: ['ui/components/TablePanel.tsx', 'ui/components/MapSide.tsx'] },
  { kind: 'raid', label: 'Hit their spot (in a war)', words: 'raid war attack', at: ['diplomacy.table', 'person'], files: ['ui/components/TablePanel.tsx'] },
  { kind: 'terms', label: 'Offer terms to end a war', words: 'terms peace end war tribute white', at: ['diplomacy.table', 'person'], files: ['ui/components/TablePanel.tsx'] },
  { kind: 'raiseDispute', label: 'Take a dispute to the Table', words: 'dispute table ruling reparations district', at: ['diplomacy.table', 'person'], files: ['ui/components/TablePanel.tsx'] },
  { kind: 'lobby', label: 'Lobby a Table member', words: 'lobby table member vote', at: ['diplomacy.table', 'person'], files: ['ui/components/TablePanel.tsx'] },
  { kind: 'askPermission', label: 'Ask Philadelphia for permission in another city', words: 'permission philadelphia city expand', at: ['map'], files: ['ui/map/MapView.tsx'] },
  { kind: 'pushDistrict', label: 'Push into a district', words: 'push expand district influence move in', at: ['map'], files: ['ui/components/MapSide.tsx'] },

  // ---- Blood ------------------------------------------------------------------------------------
  { kind: 'dynasty', ops: ['marry', 'guardian'], label: 'Arrange a marriage; a child\'s schooling', words: 'marry match wedding marriage child school guardian education', at: ['house.marriages', 'person'], files: ['ui/family/MarriagePanel.tsx'] },
  { kind: 'dynasty', ops: ['host'], label: 'Host a dinner, a feast, an outing', words: 'host dinner feast clambake christening outing', at: ['house.activities'], files: ['ui/family/ActivitiesPanel.tsx'] },
  { kind: 'dynasty', ops: ['decision'], label: 'A big move for the house', words: 'house ambition decision', at: ['house.decisions'], files: ['ui/family/DecisionsPanel.tsx'] },
  { kind: 'dynasty', ops: ['standing'], label: 'Disinherit or shame one of the house (or take it back)', words: 'disinherit shame denounce line of succession restore forgive', at: ['person'], files: ['ui/sheet/AgingSection.tsx'] },
  { kind: 'dynasty', ops: ['legacy'], label: 'Spend renown on the house\'s legacy', words: 'legacy renown name', at: ['house.legacy'], files: ['ui/family/LegacyPanel.tsx'] },
  { kind: 'power', ops: ['designate', 'groom', 'stopGrooming', 'place', 'unplace', 'read', 'promise'], label: 'The heir: name him, groom him, read the men', words: 'heir succession designate groom protege promise read', at: ['house.succession', 'person'], files: ['ui/house/Succession.tsx', 'ui/power/PowerTab.tsx', 'ui/sheet/menuCatalog.ts'] },
  { kind: 'power', ops: ['shadow'], label: 'The underboss\'s court: test him, meet, reward, confront', words: 'shadow court underboss test reward confront retire', at: ['house.court'], files: ['ui/power/ShadowCourt.tsx'] },
  { kind: 'power', ops: ['amends', 'announce', 'prep', 'consult'], label: 'The crisis: make amends, announce, prepare', words: 'crisis amends announce prepare consult', at: ['house.succession'], files: ['ui/power/PowerTab.tsx'] },
  { kind: 'power', ops: ['blitz', 'mattresses', 'bodyguards'], label: 'Go to the mattresses, bodyguards, a blitz', words: 'mattresses bodyguards blitz safety', at: ['diplomacy.balance'], files: ['ui/power/PowerTab.tsx'] },
  { kind: 'power', ops: ['front', 'endFront'], label: 'Put up (or end) a front boss', words: 'front boss figurehead', at: ['diplomacy.front'], files: ['ui/power/PowerTab.tsx'] },
  { kind: 'power', ops: ['climb', 'takeover'], label: 'Climb, take over the family', words: 'climb takeover chair boss rise', at: ['you.character', 'person'], files: ['ui/power/PowerTab.tsx', 'ui/sheet/menuCatalog.ts'] },
  { kind: 'power', ops: ['audience'], label: 'Hear the people who come to see you', words: 'audience petition court office hours', at: ['you.court'], files: ['ui/power/AudiencePanel.tsx'] },
  { kind: 'bond', ops: ['date', 'anniversary', 'apologize', 'confess', 'deny', 'vacation', 'gift', 'kids', 'ambition', 'kidTime'], label: 'Your wife and kids: date night, the anniversary, apologize, the truth, a weekend away', words: 'wife marriage date night anniversary apologize sorry confess deny truth vacation weekend cape may kids children future ambition shop church gift your people', at: ['you.people'], files: ['engine/bonds.ts', 'ui/bonds/YourPeople.tsx'] },
  { kind: 'bond', ops: ['attention', 'reassure', 'ultimatum', 'baby', 'herFamily'], label: 'Your goomar: her evening, reassure her, her ultimatum, the baby, her family', words: 'goomar mistress girlfriend lover evening jealous ultimatum leave your wife baby pregnant her family your people', at: ['you.people'], files: ['engine/bonds.ts', 'ui/bonds/YourPeople.tsx'] },
  { kind: 'bond', ops: ['drink', 'fishing', 'cards', 'godfather', 'lend', 'settle', 'test', 'confide', 'peace'], label: 'Your friends and your men: a drink, fishing, cards, godfather, a loan, a beef, loyalty', words: 'friend friendship drink fishing cards pinochle godfather compare christening lend loan beef settle test loyalty confide enemy grudge peace your people', at: ['you.people'], files: ['engine/bonds.ts', 'ui/bonds/YourPeople.tsx'] },
  { kind: 'dating', ops: ['talk', 'invite', 'gift', 'steady', 'commit', 'reconcile', 'meet', 'paid', 'askOut'], label: 'Dating: ask her out, a date, going steady, company', words: 'dating date romance girlfriend ask out invite steady commit reconcile introduce company', at: ['you.dating', 'person'], files: ['engine/dating.ts', 'ui/dating/DatingPanel.tsx'] },

  // ---- Yourself ---------------------------------------------------------------------------------
  { kind: 'lifestyle', label: 'Choose how you rule', words: 'lifestyle focus how you rule style', at: ['you.lifestyle'], files: ['ui/components/Lifestyle.tsx'] },
  { kind: 'perk', label: 'Learn a perk', words: 'perk learn skill', at: ['you.lifestyle'], files: ['ui/components/Lifestyle.tsx'] },
  { kind: 'officeHours', label: 'Hold office hours', words: 'office hours court petitions', at: ['you.court', 'person'], files: ['ui/components/OfficePanel.tsx', 'ui/sheet/menuCatalog.ts'] },
  { kind: 'legal', label: 'Retain a lawyer, lie low', words: 'lawyer retainer lie low case trial fbi', at: ['town.case'], files: ['ui/components/LawPanel.tsx'] },
  { kind: 'travel', ops: ['trip', 'cancel', 'recall'], label: 'Plan a trip, call people home', words: 'trip travel vacation envoy city recall', at: ['ops.travel', 'person'], files: ['ui/travel/TripPlanner.tsx', 'ui/travel/Panels.tsx'] },
  { kind: 'nyc', ops: ['crew', 'racket', 'recall'], label: 'New York: open a crew, buy into a racket, bring the men home', words: 'new york nyc crew expand racket docks garment fish market airport cargo idlewild brooklyn harlem bronx map', at: ['map'], files: ['ui/nyc/NycPanel.tsx'] },
  { kind: 'nyc', ops: ['bless', 'tribute', 'sitdown'], label: 'New York: the families\' blessing, tribute, the Commission sit-down', words: 'new york nyc family blessing permission tribute commission sit-down reparations war', at: ['map'], files: ['ui/nyc/NycPanel.tsx'] },
  { kind: 'travel', ops: ['flee', 'surrender', 'comeHome', 'exile', 'hide'], label: 'Run for it, hide, come home, turn yourself in', words: 'flee run fugitive hide surrender come home exile', at: ['town.case', 'person', 'ops.travel'], files: ['ui/travel/FleePlanner.tsx', 'ui/travel/Panels.tsx', 'ui/sheet/menuCatalog.ts'] },

  // ---- The town ---------------------------------------------------------------------------------
  { kind: 'pol', ops: ['cultivate', 'payroll', 'dig', 'coerce', 'favor', 'recruit', 'groom'], label: 'Officials: cultivate, payroll, dirt, favors', words: 'politician official cultivate payroll dirt coerce favor city hall cop', at: ['town.cityhall', 'person'], files: ['ui/cityhall/CityHall.tsx', 'ui/sheet/menuCatalog.ts'] },
  { kind: 'pol', ops: ['fund', 'endorse', 'patronage', 'dirty', 'puppet', 'lobby', 'propose', 'enter', 'declare'], label: 'Elections and laws: fund, endorse, lobby, run', words: 'election campaign fund endorse law lobby propose run for office puppet patronage', at: ['town.cityhall'], files: ['ui/cityhall/CityHall.tsx'] },
  { kind: 'underbelly', label: 'Deal with the outfits that prey on people', words: 'underbelly investigate expose run out ally', at: ['town.underbelly'], files: ['ui/components/UnderbellyPanel.tsx'] },
  { kind: 'living', ops: ['ask', 'give'], label: 'Ask around about someone; help a family', words: 'ask around neighbor help family give', at: ['town.happening'], files: ['ui/town/Happening.tsx'] },
  { kind: 'ears', ops: ['ask', 'retain', 'protect', 'madamCall', 'madamCut', 'madamIntel', 'madamVenture', 'madamFavor'], label: 'The Ears and the Madam', words: 'ears madam night girls listen intel', at: ['town.night', 'person'], files: ['ui/ears/EarsPanel.tsx', 'ui/ears/earsMenu.ts', 'ui/ears/EarsPicker.tsx'] },
  { kind: 'nightlife', ops: ['payroll', 'release', 'promise', 'keep', 'deal', 'back'], label: 'Nightlife: payroll, promises of introductions, madams\' protection', words: 'nightlife escort call girl dancer stripper burlesque singer madam house payroll kickback promise introduction record producer film protection partner squeeze back', at: ['town.nightlife', 'person'], files: ['engine/nightlife.ts', 'ui/nightlife/NightlifePanel.tsx'] },
  { kind: 'nightlife', ops: ['invite', 'car', 'bold'], label: 'An evening with her (the release, the town, a getaway, the club), the car, a bold offer', words: 'evening date invite hotel office getaway trip companion night out club queen one night something haggle price car bold offer stay', at: ['person', 'town.nightlife'], files: ['engine/nightlife.ts', 'ui/nightlife/EveningFlow.tsx'] },
  { kind: 'nightlife', ops: ['partner', 'askMan'], label: 'Her husband or fella: ask around, pay him, warn him, the crew', words: 'husband boyfriend fella jealous partner warn pay off', at: ['person', 'town.nightlife'], files: ['engine/nightlife.ts'] },
  { kind: 'nightlife', ops: ['goomar', 'endGoomar'], label: 'Make her your goomar (mistress), or end it', words: 'goomar goomah mistress kept woman apartment allowance concubine', at: ['person', 'town.nightlife'], files: ['ui/sheet/menuCatalog.ts', 'engine/nightlife.ts'] },
  { kind: 'ears', ops: ['opDig', 'opRunoff', 'opExpose', 'opMadam'], label: 'Move on the men who exploit women', words: 'operator run off expose dig', at: ['town.night', 'person'], files: ['ui/ears/EarsPanel.tsx', 'ui/ears/earsMenu.ts'] },
];

/** Where an `at` goes, in words (Find… shows it). */
export const AT_LABEL: Record<string, string> = {
  person: 'a person: Deal with…',
  place: 'a place on the map',
  map: 'the map',
  office: 'the Office',
  event: 'a decision, when it comes up',
};
