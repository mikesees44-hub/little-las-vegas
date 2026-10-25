/**
 * LITTLE LAS VEGAS — EVENT CONTENT PACK 2 (partial: its writer was interrupted)
 *
 * Copied from /home/claude/content-pack-2 (same neutral schema as pack 1):
 * the women of the family, extended kin, show business and the wider world.
 * 34 chains, 137 events. The pack's own CHAINS index was never written, so it
 * is derived here from each event's `chain` tag (parts in order). The empty
 * "Season One" file was not copied (those seeds are written in storyData3).
 */
import type { ChainInfo, PackEvent } from './storyDataSchema';
import { WOMEN_1 } from './storyData2Women1';
import { WOMEN_2 } from './storyData2Women2';
import { KIN } from './storyData2Kin';
import { SHOWBIZ } from './storyData2Showbiz';
import { WORLD } from './storyData2World';

export const EVENTS_2: PackEvent[] = [...WOMEN_1, ...WOMEN_2, ...KIN, ...SHOWBIZ, ...WORLD];

const TITLES: Record<string, string> = {
  p2_uncle: "Zio Tano Says",
  p2_cousins: "Two Cousins",
  p2_nonno: "The Man From Calabria",
  p2_will: "Zia Rosaria's Will",
  p2_wedding: "The Wedding of the Year",
  p2_godson: "The Godson",
  p2_kincaid: "The Kincaid Subpoena",
  p2_sandettes: "The Sandettes",
  p2_marlowe: "Vic Marlowe's Marker",
  p2_picture: "Low Tide",
  p2_seashell: "Seashell Records",
  p2_candy: "Sunset on Ocean Avenue",
  p2_wall: "The Wall Behind the Furnace",
  p2_altar: "The Altar Society",
  p2_wrongboy: "The Captain's Boy",
  p2_marlin: "The Marlin",
  p2_counselor: "Counselor",
  p2_nonna: "Nonna's Table",
  p2_widow: "The Widow's Book",
  p2_sandpiper: "The Sandpiper",
  p2_carbon: "Carbon Copies",
  p2_gloria: "Gloria",
  p2_capowife: "The Capo's Wife",
  p2_hanlon: "Madam Council President",
  p2_stroke: "The Fist Opens",
  p2_newark: "The Men From Down Neck",
  p2_lot: "The Dorchester Burns",
  p2_strike: "Kitchen Strike",
  p2_fbo: "The Office Above the Pharmacy",
  p2_pwar: "The Bridge War",
  p2_casino: "The Gaming Question",
  p2_supersede: "Superseded",
  p2_rico: "Racketeer Influenced",
  p2_bank: "Run on the Shore Savings",
};

function deriveChains(events: PackEvent[]): ChainInfo[] {
  const by = new Map<string, PackEvent[]>();
  for (const e of events) if (e.chain) by.set(e.chain.id, [...(by.get(e.chain.id) ?? []), e]);
  return [...by.entries()].map(([id, es]) => {
    const parts = es.slice().sort((a, b) => a.chain!.part - b.chain!.part);
    return { id, title: TITLES[id] ?? parts[0].title, summary: parts[0].title, events: parts.map((e) => e.id) };
  });
}

export const CHAINS_2: ChainInfo[] = deriveChains(EVENTS_2);
