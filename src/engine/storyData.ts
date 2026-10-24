/**
 * LITTLE LAS VEGAS — EVENT CONTENT PACK
 *
 * The schema (PackEvent, Trigger, RoleSpec, Fx, Option, ChainInfo ...) is
 * defined in ./schema.ts and re-exported here first, so importing this one
 * file gives an integrator both the types and the data.
 *
 *   import { EVENTS, CHAINS, EVENTS_BY_ID } from 'content-pack/events';
 *
 * See README.md for how each Fx maps onto the engine's Effect union.
 */
// Explicit re-exports (vite-node can deadlock on `export *` from a module other importers load concurrently).
export { gateLabel } from './storyDataSchema';
export type { Category, ChainInfo, Fx, Gate, Option, PackEvent, RoleSpec, Spawn, Trigger } from './storyDataSchema';

import type { ChainInfo, PackEvent } from './storyDataSchema';
import { CHAINS_A } from './storyDataChainsA';
import { CHAINS_B } from './storyDataChainsB';
import { CHAINS_C } from './storyDataChainsC';
import { CHAINS_D } from './storyDataChainsD';
import { STANDALONE_1 } from './storyDataStandalone1';
import { STANDALONE_2 } from './storyDataStandalone2';

export const EVENTS: PackEvent[] = [
  ...CHAINS_A,
  ...CHAINS_B,
  ...CHAINS_C,
  ...CHAINS_D,
  ...STANDALONE_1,
  ...STANDALONE_2,
];

export const EVENTS_BY_ID: Record<string, PackEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** The storylines. Part 1 of each fires from the random pool; later parts only via `followup`. */
export const CHAINS: ChainInfo[] = [
  { id: 'long_goodbye', title: 'The Long Goodbye', summary: 'An Ambitious capo is seen lunching with Manno\'s florist; light envelopes, a box of carnations with his handwriting in it, and a Sunday dinner where he holds your youngest.', events: ['lg_1', 'lg_2', 'lg_3', 'lg_4'] },
  { id: 'vig', title: 'Five Points a Week', summary: 'A Gambler soldier owes Kessler\'s shylock Hughie Shea; a Studebaker outside his mother\'s bungalow, a robbed card game, and 3 a.m. eggs with Danny Kessler.', events: ['vig_1', 'vig_2', 'vig_3', 'vig_4'] },
  { id: 'ink', title: 'Ink', summary: 'Peg Donnelly of the Philadelphia Inquirer digs through deeds and runs "Who Owns the Shore?"; she offers to write about real villains instead, if you become her source. Branches on part 5.', events: ['ink_1', 'ink_2', 'ink_3', 'ink_4', 'ink_5', 'ink_5b'] },
  { id: 'gargano', title: 'The Gargano Boy', summary: 'The son of a man you had killed in 1956 wants to know who drove; a pawnshop .38, his mother at Tuesday Mass, and a midnight meeting by the last tram car.', events: ['garg_1', 'garg_2', 'garg_3', 'garg_4'] },
  { id: 'ash_wednesday', title: 'Ash Wednesday', summary: 'The March 1962 nor\'easter: five high tides, disaster money, Kessler\'s safe in your marsh, and the race to open by Memorial Day.', events: ['ash_1', 'ash_2', 'ash_3', 'ash_4'] },
  { id: 'new_dance', title: 'The New Dance', summary: 'Summer 1960: the Twist debuts at the Rainbow Club on Pacific; rock-and-roll vs the supper club, a payola envelope, a teen curfew, and Philadelphia\'s distaste for children.', events: ['nd_1', 'nd_2', 'nd_3', 'nd_4'] },
  { id: 'carnival', title: 'The Parish Carnival', summary: 'Father Quinlan asks you to keep the carnival wheel straight; your soldier robs the rectory; the prosecutor subpoenas a priest about a confession.', events: ['car_1', 'car_2', 'car_3'] },
  { id: 'election', title: 'The Commission Race', summary: 'An honest pharmacist runs for city commissioner; absentee ballots from dead men, a ballot box in a pickup truck, and whichever commissioner you end up owning. Branches on part 4.', events: ['el_1', 'el_2', 'el_3', 'el_4', 'el_4b'] },
  { id: 'desert_money', title: 'Desert Money', summary: 'Feldstein brings Nevada money looking for oceanfront; laundering through Room 14, Philadelphia\'s 25 percent, and points in a desert casino with a suitcase attached.', events: ['ds_1', 'ds_2', 'ds_3', 'ds_4'] },
  { id: 'nephew', title: 'Home From Fort Dix', summary: 'Your sister\'s son comes home from the Army: crew, cop, or phone company. Whatever you choose, two men in a Ford Falcon come for him. Branches on part 2.', events: ['nep_1', 'nep_2a', 'nep_2b', 'nep_3', 'nep_4', 'nep_5'] },
  { id: 'ice_men', title: 'The Ice Men', summary: 'Gentleman burglars from Miami Beach want your fence; Sal\'s mistress\'s brooch turns up in the haul; their kid gets pinched; one last score at a jewelers\' convention.', events: ['ice_1', 'ice_2', 'ice_3', 'ice_4'] },
  { id: 'skee_ball', title: 'Skee-Ball', summary: 'Non-explicit summer romance: your heir and Danny Kessler\'s daughter. Two fathers on the phone, a Labor Day proposal, and either a two-parish wedding or a postcard from Maryland.', events: ['rom_1', 'rom_2', 'rom_3', 'rom_4', 'rom_4b'] },
  { id: 'canary', title: 'The Canary', summary: 'The game is raided the night it moved; three suspects, a trap, a mortgage paid by Manno\'s bank, a dawn boat ride, and grand jury week.', events: ['can_1', 'can_2', 'can_3', 'can_4', 'can_5'] },
  { id: 'valachi', title: 'The Valachi Autumn', summary: 'Autumn 1963: the televised Senate testimony, Philadelphia closing the doors, and your square on the government\'s chart.', events: ['val_1', 'val_2', 'val_3'] },
  { id: 'convention', title: 'Convention Week', summary: 'August 1964: the Democratic National Convention in Atlantic City; overflow money, a delegate with a marker, federal men in wool on the Boardwalk, and Manno\'s crews who stay.', events: ['con_1', 'con_2', 'con_3', 'con_4'] },
  { id: 'expressway', title: 'The Expressway', summary: 'The Atlantic City Expressway puts Philadelphia an hour from AC; interchange land, a blueberry farmer who won\'t sell, and Manno\'s gold-embossed invitation.', events: ['exp_1', 'exp_2', 'exp_3'] },
  { id: 'atomic_age', title: 'Atomic Age', summary: 'A builder wants to put a neon rocket ship on a Crest motel; Manno\'s cement trucks stop coming; you get to name the future.', events: ['dw_1', 'dw_2', 'dw_3'] },
  { id: 'sals_ledger', title: 'Sal\'s Ledger', summary: 'Philadelphia\'s South Jersey capo is skimming Philadelphia through your envelope; an old man with a cane asks for round numbers; Sal hides a suitcase in your basement; a new bagman.', events: ['sl_1', 'sl_2', 'sl_3', 'sl_4'] },
  { id: 'keough_congress', title: 'Keough for Congress', summary: '1962: the prosecutor runs for Congress and needs a headline; who do you feed him, who do you fund, and which way do two Wildwood precincts go.', events: ['kc_1', 'kc_2', 'kc_3'] },
  { id: 'powder', title: 'White Powder', summary: 'Manno offers a share of heroin through the bay docks. The player can only refuse, report, or be tempted toward ruin; Philadelphia asks one question at the end.', events: ['pw_1', 'pw_2', 'pw_3'] },
  { id: 'spicer', title: 'The House on Spicer Avenue', summary: 'Underbelly (villain only): a rooming house that steals teenage summer workers\' wages and bus tickets, owned through Manno. Investigate, expose, buy them out, send the kids home paid.', events: ['sp_1', 'sp_2', 'sp_3'] },
];
