/**
 * Clarity: the "why" layer. Reusable pieces for every screen:
 *
 *   <WhyPanel s action />                  verdict + purpose, opens to gains/costs/risks/best-when
 *   <ChoiceWhy a />                        under a decision option (use compareChoices(s, ev.choices))
 *   <CandidatePicker s role />             side-by-side people for any pick (queues the winner's order)
 *   <PickerModal s role onClose />         the same in a modal; or useClarity().openPicker(role)
 *   <AdvisorQuotes s ranking />            the consigliere's / underboss's (partial) advice
 *   <Tip term="heat.local">…</Tip>         hover help from the glossary, or <Tip text="…">
 *   <WhatToDoPanel s />                    ranked opportunities and threats + the "This week" list
 *   <GlossaryOverlay /> <HelpButton />     the "?" help
 *   <TaskAdvice s seat />                  which council task is most pressing now
 *   <HeirCompare/> <OfficialPicker/> <KeeperPicker/> <BonesPicker/> <TripWhy/>   ready-made pickers (Pickers.tsx)
 *
 * Engine side: explainAction, explainChoice, compareChoices, taskAdvice (advice.ts),
 * rankCandidates (candidates.ts), advisorAdvice (advisors.ts), whatShouldIDo,
 * weekChecklist (opportunities.ts), GLOSSARY/statHelp/effectHelp (glossary.ts).
 */
export { Tip } from './Tip';
export { ChoiceWhy, VerdictTag, WhyBody, WhyPanel } from './WhyPanel';
export { CandidateCard, CandidatePicker, PickerModal } from './CandidatePicker';
export { AdvisorQuotes } from './AdvisorQuote';
export { WhatToDoModal, WhatToDoPanel } from './WhatToDo';
export { GlossaryOverlay, HelpButton } from './Glossary';
export { TaskAdvice } from './TaskAdvice';
export { BonesPicker, HeirCompare, KeeperPicker, OfficialPicker, TripWhy } from './Pickers';
export { ClarityContext, useClarity, type ClarityApi } from './context';
