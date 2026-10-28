/**
 * PROTECTION & INTELLIGENCE: the fixed tables (labels, wages, coverage, the
 * children's events). The rules live in protect.ts.
 */

/** What kind of protection an assignment is. */
export type ProtKind = 'bodyguard' | 'driver' | 'residence' | 'event' | 'family' | 'escort';
/** When the man is on duty. */
export type Shift = 'day' | 'night' | 'around';
/** What an investigation is for. */
export type InvPurpose = 'money' | 'loyalty' | 'story' | 'personal' | 'threat' | 'romance';
/** What a guard reports: only what touches the person's safety, or her private life too. */
export type Remit = 'safety' | 'monitor';

export const KIND_INFO: Record<ProtKind, { name: string; suits: string; text: string; cover: number }> = {
  bodyguard: { name: 'Personal bodyguard', suits: 'You, a capo, a partner', text: 'Goes where the person goes and steps in when something is wrong.', cover: 1 },
  driver: { name: 'Driver and escort', suits: 'Family, officers', text: 'Drives, waits outside, and is there between one place and the next.', cover: 0.65 },
  residence: { name: 'Residential security', suits: 'A home', text: 'A man on the house while the family comes and goes.', cover: 0.5 },
  event: { name: 'Event protection', suits: 'A wedding, a funeral, a meeting', text: 'Cover for one gathering, then it ends.', cover: 0.9 },
  family: { name: 'Family protection detail', suits: 'Wife, children, relatives', text: 'One arrangement for several people: thinner on each, but nobody is alone.', cover: 0.75 },
  escort: { name: 'Temporary protective escort', suits: 'Someone facing a specific threat', text: 'A short assignment that ends or gets reviewed when the threat passes.', cover: 0.9 },
};
export const PROT_KINDS = Object.keys(KIND_INFO) as ProtKind[];

export const SHIFT_INFO: Record<Shift, { name: string; day: number; night: number; wage: number }> = {
  day: { name: 'Days', day: 1, night: 0, wage: 1 },
  night: { name: 'Nights', day: 0, night: 1, wage: 1.15 },
  around: { name: 'Around the clock', day: 1, night: 1, wage: 1.75 },
};
export const SHIFTS = Object.keys(SHIFT_INFO) as Shift[];

export const PURPOSE_INFO: Record<InvPurpose, { name: string; finds: string; ask: string }> = {
  money: { name: 'Check a financial discrepancy', finds: 'Hidden debt, unexplained spending, an accounting mistake', ask: 'where the money went' },
  loyalty: { name: 'Look into divided loyalties', finds: 'Rival meetings, an innocent friendship, a false accusation', ask: 'who he has been meeting' },
  story: { name: 'Verify someone\'s story', finds: 'Confirmation, contradictions, not enough to say', ask: 'whether the story holds up' },
  personal: { name: 'A personal concern', finds: 'A private relationship, family trouble, nothing relevant', ask: 'what is going on at home' },
  threat: { name: 'Assess a threat', finds: 'A genuine dispute, exaggerated rumors, mistaken identity', ask: 'whether anyone means harm' },
  romance: { name: 'Romantic interest', finds: 'Where she works and who she sees. Nothing about how she feels.', ask: 'about her' },
};
export const PURPOSES = Object.keys(PURPOSE_INFO) as InvPurpose[];

/** A man's weekly wage on an assignment, by rank (before the shift). */
export const RANK_WAGE: Record<string, number> = { associate: 45, soldier: 70, capo: 150, underboss: 200, consigliere: 200 };

/** Protection never makes anyone safe: the most it takes off a risk. */
export const MAX_CUT = 0.6;

/** Hours the boss spends on each order. */
export const PROTECT_HOURS: Record<string, number> = { guard: 0.5, investigate: 0.5, renew: 0.25, end: 0.25 };

/**
 * What a guard does with a child: walks, waits, drives, notices a car. Nothing
 * else ever happens on a child's detail ({g} the guard, {k} the child).
 */
export const KID_LINES: readonly string[] = [
  '{g} walked {k} to school and waited by the gate until the bell.',
  '{g} sat in the back row at {k}\'s school recital and clapped too loud.',
  '{g} taught {k} to ride a bicycle on the Boardwalk before the crowds came.',
  '{g} drove {k} to the dentist on Pacific Avenue and bought a comic book after.',
  'A strange car parked near the school; {g} wrote down the plate. It was a salesman.',
  '{g} made sure {k} was home from the beach before the streetlights came on.',
];
export const TEEN_LINES: readonly string[] = [
  '{g} drove {k} home from the movies at the Strand, and waited outside.',
  '{g} sat in the car outside the dance at the school gym until it let out.',
  '{g} picked {k} up from practice and said nothing the whole way home, which suited them both.',
];

/** What a guard's weeks look like with an adult ({g} the guard, {p} the person). */
export const GUARD_LINES: readonly string[] = [
  '{g} drove {p} everywhere this week and noticed nothing worth a word.',
  '{g} turned a drunk around at the door before {p} ever saw him.',
  '{g} waited outside the church, the market and the beauty parlor. A quiet week.',
  '{g} checked the house every night and the car every morning.',
];
