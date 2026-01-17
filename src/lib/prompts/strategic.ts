import { cityName } from '../city-config-client';

export const strategicPrompt = `Analyze this city strategic plan and provide a citizen-friendly summary.

**Title:** [Extract the official document title, e.g., "City of ${cityName} Strategic Plan FY2025"]

**Vision & Goals**
• What is the city working toward?
• Top 3-5 strategic priorities

**Key Initiatives**
• Major projects or programs planned
• Timeline for implementation (if mentioned)

**What This Means for Residents**
• How the city plans to improve quality of life
• Any new services or improvements to expect

**Measuring Success**
• How will the city track progress? (metrics or milestones if mentioned)

Keep it forward-looking and accessible. This is about what the city plans to accomplish. Do NOT include preamble - start directly with the content.`;
