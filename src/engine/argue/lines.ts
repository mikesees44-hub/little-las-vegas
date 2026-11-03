import type { ArgEnd, ArgKind, Posture, Reply, Voice } from './types';

/**
 * WHAT THEY SAY. Scripted lines, picked on the arguments' own dice, filled
 * with names: {me} the man, {x} the other man it is about, {m} the man asked
 * to step in, {w} a witness. Period Jersey Shore talk, nobody real, nothing
 * quoted. Claude may reword a line in the window (optional flavor, see
 * prompt.ts); the rules never come from the words.
 */

type Pool = string[];

/** His first answer, by what was done to him and how he carries it. */
export const OPEN: Record<ArgKind, Record<Posture, Pool>> = {
  insult: {
    hot: [
      'In front of them? You do this to me in front of them? I was holding this family together when you were still parking cars.',
      'Say it again. Go ahead, say it again, so everybody hears it twice.',
      'You want to talk to me like that, we do it behind a closed door. Not here. Never here.',
    ],
    cold: [
      'Okay. You said it. Everybody heard it. I hope it was worth it.',
      'Fine. I\'ll remember the tone. I remember everything, you know that about me.',
      'You\'re the boss. I\'m just the guy who gets talked to like a busboy, apparently.',
    ],
    hurt: [
      'Twenty years. Twenty years, and that\'s what I get, in front of these two.',
      'I never once made you look bad. Not once. You couldn\'t give me the same?',
    ],
    scared: [
      'Okay, okay. I hear you. I didn\'t mean nothing by it.',
      'You\'re right, you\'re right. I got it. No need to say it twice.',
    ],
    smiling: [
      'Hey. You\'re right. I had it coming. Let\'s not make a thing of it.',
      'No, no, you\'re absolutely right. I needed to hear that. Thank you.',
    ],
  },
  refuse: {
    hot: [
      'I\'ve been bleeding for this family for years and you can\'t find me a few hundred? You find it for the Philadelphia envelope fast enough.',
      'That\'s it? No? My kid needs a doctor and I get a no and a pat on the head?',
    ],
    cold: [
      'Okay. Good to know where I stand. Real good to know.',
      'I asked once. I won\'t ask again. Not for anything.',
    ],
    hurt: [
      'I never asked you for nothing. Not once. The one time I ask.',
      'I thought I was family here. My mistake, I guess.',
    ],
    scared: [
      'Sure, sure. I shouldn\'t have asked. Forget I said it.',
      'No, it\'s fine, boss. I\'ll figure something out. I always do.',
    ],
    smiling: [
      'Hey, I understand. Times are tight. Don\'t worry about me.',
      'No problem at all. I shouldn\'t have brought it to you.',
    ],
  },
  passover: {
    hot: [
      '{x}? {x}! I was running numbers on the boardwalk when that kid was in short pants.',
      'You give it to {x}, you\'re telling every man in this room that years don\'t count for nothing.',
    ],
    cold: [
      'Congratulations to {x}. I hope he knows what he\'s doing. I hope you do.',
      'Fine. {x} gets it. I\'ll make sure I send him a card.',
    ],
    hurt: [
      'I waited. I did everything right and I waited, and you hand it to {x}.',
      'What did I do wrong? Tell me what I did wrong so I understand.',
    ],
    scared: [
      '{x}, sure. Good choice. He\'s a good kid.',
      'Whatever you think is best. I\'m with you. You know I\'m with you.',
    ],
    smiling: [
      '{x}? Great. Great choice. I\'ll help him any way I can.',
      'You know what, it\'s right. The kid\'s got energy. I\'ll back him all the way.',
    ],
  },
  accuse: {
    hot: [
      'A rat? Me? Say that outside, where it\'s just you and me, and see what happens.',
      'Who told you that? Give me a name. Give me the name right now.',
    ],
    cold: [
      'So that\'s what you think. All these years, and that\'s what you think.',
      'You believe that, you do what you have to do. I won\'t beg.',
    ],
    hurt: [
      'I took a pinch for you in fifty-eight and kept my mouth shut. And you look at me like this?',
      'My mother, my kids, they know me. You don\'t know me? After all this?',
    ],
    scared: [
      'No. No, boss, I swear to God. I swear on my kids. It\'s not me.',
      'Somebody\'s setting me up. You gotta believe me. Somebody is setting me up.',
    ],
    smiling: [
      'Boss, come on. Me? Ask anybody. I\'m the last guy.',
      'I get it, you gotta ask everybody. Ask me anything you want.',
    ],
  },
  affair: {
    hot: [
      'Who are you to tell me how to live? Everybody in this family has something. Everybody.',
      'You want to talk about who sleeps where? Let\'s talk about it. Let\'s talk about all of it.',
    ],
    cold: [
      'It\'s my business. It stays my business.',
      'You found out. Fine. Now what? You\'re gonna tell me what to do in my own house?',
    ],
    hurt: [
      'You don\'t know what it\'s been like at home. You don\'t know anything about it.',
      'I never wanted you to find out like this. Not from somebody else.',
    ],
    scared: [
      'Please. Don\'t tell {x}. I\'ll end it. I swear I\'ll end it tonight.',
      'It\'s over. It was nothing. It\'s already over.',
    ],
    smiling: [
      'It was a mistake. A stupid mistake, and it\'s finished. You have my word.',
      'You\'re right. It\'s done. Nobody needs to hear about it.',
    ],
  },
  decline: {
    hot: [
      'I bring you money on a plate and you send it back? Somebody else will eat it. You know that.',
      'You didn\'t even read it. You decided before I walked in.',
    ],
    cold: [
      'Okay. Your call. I\'ll let you know who ends up making the money on it.',
      'Fine. I won\'t waste your time with ideas anymore.',
    ],
    hurt: [
      'I worked on that for a month. A month. Two minutes, you\'re done with it.',
      'I thought you wanted us to bring you things. That\'s what you always say.',
    ],
    scared: [
      'Sure, boss. Bad idea. Forget it.',
      'You\'re right. I didn\'t think it through. My fault.',
    ],
    smiling: [
      'No problem. You know best. I\'ll find something else.',
      'Totally fair. I\'ll sit on it. Maybe another time.',
    ],
  },
};

/** What the boss says, by situation (one label, one line). */
export const REPLY_LABEL: Record<ArgKind, Record<Reply, string>> = {
  insult: { apologize: 'Apologize', double: 'Double down', threaten: 'Threaten him', dismiss: 'Dismiss him', mediate: 'Ask {m} to step in' },
  refuse: { apologize: 'Soften it', double: 'Hold the line', threaten: 'Warn him off', dismiss: 'Send him away', mediate: 'Let {m} handle it' },
  passover: { apologize: 'Explain it to him', double: 'It\'s decided', threaten: 'Threaten him', dismiss: 'Dismiss him', mediate: 'Ask {m} to step in' },
  accuse: { apologize: 'Take it back', double: 'Press him', threaten: 'Threaten him', dismiss: 'Send him out', mediate: 'Let {m} ask him' },
  affair: { apologize: 'Hear him out', double: 'Lay down the law', threaten: 'Threaten him', dismiss: 'Out of my sight', mediate: 'Let {m} talk to him' },
  decline: { apologize: 'Soften it', double: 'It\'s no', threaten: 'Warn him off', dismiss: 'Dismiss him', mediate: 'Ask {m} to step in' },
};

export const BOSS: Record<Reply, Pool> = {
  apologize: [
    'Look. I went too far. That\'s on me.',
    'All right. I said it wrong. You didn\'t deserve it like that.',
    'Sit down. Sit. I was hot, and I took it out on you.',
  ],
  double: [
    'I meant every word. And I\'ll say it again if I have to.',
    'You heard me the first time. Nothing changes.',
    'You want to make this bigger? Go ahead. It\'s still my decision.',
  ],
  threaten: [
    'Think very carefully about the next thing that comes out of your mouth.',
    'You remember what happened to the last guy who talked to me like this? Neither does anybody else.',
    'Keep going. See where it gets you.',
  ],
  dismiss: [
    'We\'re done. Go home.',
    'That\'s enough. Get out of here, we\'ll talk when you cool off.',
    'Go. I don\'t want to look at you right now.',
  ],
  mediate: [
    '{m}, talk to him. I\'m done talking.',
    '{m}. You handle this.',
  ],
};

/** His answer to the boss's reply: landed (ok) or not, by how he carries himself. */
export const ANSWER: Record<Reply, { ok: Partial<Record<Posture, Pool>> & { any: Pool }; no: Partial<Record<Posture, Pool>> & { any: Pool } }> = {
  apologize: {
    ok: {
      any: ['...All right. All right. I appreciate you saying it.', 'Okay. That means something. It does.', 'Forget it. We\'re good. We\'re good.'],
      hurt: ['That\'s all I wanted. That\'s all I ever wanted, a little respect.'],
      hot: ['Fine. Fine! You said it. Let\'s move on before I change my mind.'],
    },
    no: {
      any: ['Sorry? Now you\'re sorry? Everybody already heard it.', 'Words are cheap in this room, boss.', 'You think that fixes it? That doesn\'t fix it.'],
      cold: ['Sure. Sorry. Okay.'],
    },
  },
  double: {
    ok: {
      any: ['...Okay. You\'re the boss.', 'Fine. I hear you. I don\'t like it, but I hear you.', 'All right. It\'s your call. It\'s always your call.'],
      scared: ['Okay! Okay. I\'m not arguing. I\'m not.'],
    },
    no: {
      any: ['No. No, I\'m not gonna sit here and take this.', 'You keep pushing, I keep pushing back. That\'s how this goes now?', 'Then say it again. Louder. Let the whole club hear it.'],
      hot: ['You know what? You can go to hell. With respect. You can go to hell.'],
    },
  },
  threaten: {
    ok: {
      any: ['...Okay. I hear you. Loud and clear.', 'Easy. Easy. Nobody needs to go there.', 'All right. I\'m done. I\'m done.'],
      scared: ['Okay, boss. Okay. I didn\'t mean anything. I swear.'],
    },
    no: {
      any: ['You\'re threatening me? Me? In front of my friends?', 'Go ahead. I\'m not scared of you. I was never scared of you.', 'That\'s how it is now? Then that\'s how it is.'],
      hot: ['Do it, then. Do it right here. I\'m waiting.'],
    },
  },
  dismiss: {
    ok: {
      any: ['Fine. I\'m going.', 'Yeah. I\'ll go. Better I go.', 'Okay. We\'ll talk.'],
    },
    no: {
      any: ['Don\'t you send me out like a kid. I\'ll go when I\'m ready.', 'Oh, I\'m going. And I\'m not coming back to this table.', 'Sure, throw me out. Everybody saw it.'],
    },
  },
  mediate: {
    ok: {
      any: ['...Okay. For {m}, okay.', 'All right. {m}\'s right. Maybe I got hot too.', 'I hear you, {m}. I hear you.'],
    },
    no: {
      any: ['Stay out of it, {m}. This is between me and him.', '{m}, with respect, this doesn\'t concern you.', 'You\'re his guy, {m}. Of course you say that.'],
    },
  },
};

/** The masked man's answers: whatever the boss does, he agrees, a little too easily. */
export const MASK: Pool = [
  'You\'re right. You\'re a hundred percent right. Forget the whole thing.',
  'No hard feelings, boss. Honestly. Water under the bridge.',
  'Sure, sure. Whatever you say. We\'re good.',
  'I appreciate you being straight with me. I do.',
];

/** What the mediator says. */
export const MEDIATOR: { ok: Pool; no: Pool } = {
  ok: [
    'Come on, {me}. Sit down. We all said things. Have a drink with me.',
    '{me}, look at me. Nobody here wants this. Let\'s take a walk.',
    'Both of you, enough. {me}, he didn\'t mean it like that, and you know it.',
  ],
  no: [
    '{me}, listen to me. Listen. ...Okay, he\'s not listening.',
    'Fellas, come on. Fellas.',
  ],
};

/** The room speaks up on its own. */
export const VOICES: Record<Voice, Pool> = {
  peacemaker: [
    'Hey. Hey. We\'re all friends here. Let\'s everybody take a breath.',
    'It\'s late, everybody\'s tired. Nobody means half of this.',
    'Come on. We\'ve been through worse than this together.',
  ],
  opportunist: [
    '{w} says nothing. He is listening to every word.',
    '{w} looks at his drink and smiles a little.',
    '{w} catches your eye, then {me}\'s, and files it away.',
  ],
  hothead: [
    'He\'s right, and you know he\'s right! {me} doesn\'t deserve this.',
    'You talk to him like that, you talk to me like that.',
    'Easy with him. That\'s my friend you\'re talking to.',
  ],
  loyalist: [
    'Show some respect, {me}. You\'re talking to the boss.',
    'Watch yourself, {me}. Watch how you talk at this table.',
  ],
};

/** The narrator: a beat between lines. */
export const NARR = {
  walk: ['{me} gets up. The chair scrapes. He does not look back.', '{me} takes his hat and walks out. The door rattles in its frame.'],
  split: ['{me} walks out, and the room watches him go. Nobody follows him. Not yet.', '{me} leaves in front of everybody. By Sunday the whole Shore will know.'],
  hug: ['{me} stands, and after a second, takes your hand. Then the hug, the slap on the back.', 'Somebody pours. {me} drinks. It is over, for now.'],
  truce: ['{me} nods once. Nobody smiles.', 'It goes quiet. Nobody is happy, and nobody leaves.'],
  plot: ['{me} smiles and shakes your hand. It is a very good smile.', '{me} nods and says all the right things, and the room relaxes. Most of it.'],
  tell: ['Something about that smile sits wrong with you.'],
};

/** "Done" lines, by how it ended. */
export const DONE: Record<ArgEnd, Pool> = {
  reconciled: ['You made it right with {me}, face to face.', '{me} took your hand. It is settled between you.'],
  truce: ['{me} let it drop. He did not forget it.', 'A truce with {me}. Nobody won.'],
  walkout: ['{me} walked out on you.', '{me} left before you were finished with him.'],
  split: ['{me} broke with you in front of the room.', '{me} walked out on you in public.'],
  plot: ['{me} agreed with everything. Easily.', '{me} swallowed it and said thank you.'],
};

export function fillLine(t: string, names: { me?: string; x?: string; m?: string; w?: string }): string {
  return t.replace(/\{(me|x|m|w)\}/g, (_, k: 'me' | 'x' | 'm' | 'w') => names[k] ?? 'him');
}
