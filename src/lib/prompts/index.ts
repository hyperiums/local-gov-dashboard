export { TONE_GUIDELINES } from './tone-guidelines';
export { ordinancePrompt } from './ordinance';
export { permitPrompt } from './permit';
export { businessPrompt } from './business';
export { meetingPrompt } from './meeting';
export { agendaPrompt } from './agenda';
export { budgetPrompt } from './budget';
export { auditPrompt } from './audit';
export { splostPrompt } from './splost';
export { noticePrompt } from './notice';
export { strategicPrompt } from './strategic';
export { waterQualityPrompt } from './water-quality';
export { generalPrompt } from './general';

import { ordinancePrompt } from './ordinance';
import { permitPrompt } from './permit';
import { businessPrompt } from './business';
import { meetingPrompt } from './meeting';
import { agendaPrompt } from './agenda';
import { budgetPrompt } from './budget';
import { auditPrompt } from './audit';
import { splostPrompt } from './splost';
import { noticePrompt } from './notice';
import { strategicPrompt } from './strategic';
import { waterQualityPrompt } from './water-quality';
import { generalPrompt } from './general';

export const PDF_ANALYSIS_PROMPTS: Record<string, string> = {
  ordinance: ordinancePrompt,
  permit: permitPrompt,
  business: businessPrompt,
  meeting: meetingPrompt,
  minutes: meetingPrompt,
  agenda: agendaPrompt,
  budget: budgetPrompt,
  audit: auditPrompt,
  splost: splostPrompt,
  notice: noticePrompt,
  strategic: strategicPrompt,
  'water-quality': waterQualityPrompt,
  general: generalPrompt,
};
