// AI-powered summarization using OpenAI API
import OpenAI from 'openai';
import { getSummary, saveSummary } from './db';

// Shared guidelines for all AI summaries - positive, factual, helpful
const TONE_GUIDELINES = `
CRITICAL ANTI-HALLUCINATION RULES:
- ONLY include information that is EXPLICITLY stated in the provided document
- NEVER invent, fabricate, or make up ANY information - not names, numbers, dates, or details
- NEVER use placeholder text like "[information needed]" or "[list items here]"
- If data is not visible or readable, say "not visible in document" - do NOT guess
- If you cannot read the document or it appears empty/corrupted, say so clearly
- Count items carefully - do not estimate or round numbers
- Quote exact figures from the document - never approximate

TONE GUIDELINES:
- Assume good faith and positive intentions from city officials and residents
- Present information in a constructive, helpful manner
- Focus on facts and what decisions mean for residents
- Use welcoming, inclusive language
- Highlight community benefits where applicable
- Never make accusations, suggest impropriety, or editorialize
- Always attribute information to official sources`;

// Initialize OpenAI client (requires OPENAI_API_KEY env var)
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAI({ apiKey });
}

// Summarize a meeting agenda
export async function summarizeMeetingAgenda(
  meetingId: string,
  agendaText: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  // Check cache first
  if (!options?.forceRefresh) {
    const cached = getSummary('meeting', meetingId, 'agenda');
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: `You are summarizing city council meeting agendas for residents of Flowery Branch, Georgia.
Your goal is to help citizens understand what their local government is considering, in plain language.

Rules:
- Be concise and factual
- Explain any jargon or technical terms
- Highlight items that directly affect residents (zoning, taxes, utilities, public safety)
- Note any public hearings where residents can participate
- Do NOT make political judgments or recommendations
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Meeting Agenda:
${agendaText}

Provide a brief summary (2-3 paragraphs) of what this meeting will cover and why residents might care.`,
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';

  // Cache the result
  saveSummary('meeting', meetingId, 'agenda', summary);

  return summary;
}

// Summarize meeting minutes (what actually happened)
export async function summarizeMeetingMinutes(
  meetingId: string,
  minutesText: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = getSummary('meeting', meetingId, 'minutes');
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: `You are summarizing city council meeting minutes for residents of Flowery Branch, Georgia.
Your goal is to help citizens understand what decisions were made, in plain language.

Rules:
- Focus on decisions and outcomes, not procedural details
- Clearly state what was approved, denied, or tabled
- Explain the practical impact of decisions on residents
- Note any upcoming actions or follow-ups
- Be factual and neutral
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Meeting Minutes:
${minutesText}

Provide a summary of:
1. Key decisions made (what passed/failed)
2. What this means for residents
3. Any items to watch for in future meetings`,
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';
  saveSummary('meeting', meetingId, 'minutes', summary);

  return summary;
}

// Explain an ordinance in plain language
export async function explainOrdinance(
  ordinanceId: string,
  ordinanceText: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = getSummary('ordinance', ordinanceId, 'explanation');
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: `You are explaining a city ordinance to residents of Flowery Branch, Georgia.
Your goal is to help citizens understand what this law does and how it affects them.

Rules:
- Use simple, everyday language
- Explain WHO this affects
- Explain WHAT changes or is required
- Explain WHY this matters
- Note any penalties or enforcement
- Be factual and neutral
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Ordinance Text:
${ordinanceText}

Provide:
1. A one-sentence summary of what this ordinance does
2. Who is affected
3. What residents need to know or do
4. Why the city is implementing this (if clear from the text)`,
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';
  saveSummary('ordinance', ordinanceId, 'explanation', summary);

  return summary;
}

// Generate a "This Week in Flowery Branch" summary
export async function generateWeeklySummary(
  weekData: {
    meetings: { title: string; date: string; summary?: string }[];
    newBusinesses: { name: string; address?: string }[];
    permitCount: number;
    ordinances: { number: string; title: string; status: string }[];
  },
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const weekId = new Date().toISOString().split('T')[0];

  if (!options?.forceRefresh) {
    const cached = getSummary('week', weekId, 'summary');
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: `You are writing a friendly, informative weekly update for residents of Flowery Branch, Georgia.
Your goal is to help citizens stay informed about their local government in 2 minutes or less.
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Data for this week:

MEETINGS:
${weekData.meetings.map(m => `- ${m.date}: ${m.title}${m.summary ? `\n  Summary: ${m.summary}` : ''}`).join('\n') || 'No meetings this week'}

NEW BUSINESSES:
${weekData.newBusinesses.map(b => `- ${b.name}${b.address ? ` (${b.address})` : ''}`).join('\n') || 'None reported'}

PERMITS ISSUED: ${weekData.permitCount}

ORDINANCE ACTIVITY:
${weekData.ordinances.map(o => `- Ordinance ${o.number}: ${o.title} (${o.status})`).join('\n') || 'No ordinance changes'}

Write a brief, engaging weekly summary that:
1. Highlights the most important news
2. Welcomes new businesses to town
3. Notes any upcoming opportunities for public input
4. Is written in a warm but professional tone
5. Takes about 2 minutes to read

Format with clear sections. Do not add information not provided above.`,
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';
  saveSummary('week', weekId, 'summary', summary);

  return summary;
}

// Extract key decisions from meeting text
export async function extractKeyDecisions(
  meetingText: string
): Promise<{ decision: string; outcome: string; impact: string }[]> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: `Extract key decisions from city council meeting text.
Respond only in JSON format as an array.
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `For each decision, provide:
1. What was decided
2. The outcome (approved/denied/tabled)
3. Potential impact on residents

Meeting Text:
${meetingText}

Respond in JSON format:
[
  {
    "decision": "Brief description of what was voted on",
    "outcome": "approved|denied|tabled|discussed",
    "impact": "One sentence on how this affects residents"
  }
]

Only include substantive decisions, not procedural votes.`,
      },
    ],
  });

  const responseText = response.choices[0]?.message?.content || '[]';

  try {
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error('Failed to parse key decisions JSON');
  }

  return [];
}

// Summarize monthly permit activity
export async function summarizePermitActivity(
  month: string,
  permitText: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = getSummary('permits', month, 'summary');
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content: `You are summarizing monthly building permit activity for Flowery Branch, Georgia.
Your goal is to help residents understand development trends in their community.
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Permit data for ${month}:
${permitText}

Summarize development trends objectively, noting both growth and any patterns residents should be aware of:
1. Note the types and volume of permits issued
2. Highlight new construction or renovation activity
3. Identify which neighborhoods or areas are seeing the most activity
Keep it to 2-3 sentences.`,
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';
  saveSummary('permits', month, 'summary', summary);

  return summary;
}

// Welcome new businesses with a friendly summary
export async function welcomeNewBusinesses(
  month: string,
  businessList: { name: string; address?: string; type?: string }[]
): Promise<string> {
  if (businessList.length === 0) {
    return 'No new business registrations were recorded this month.';
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: `You are providing civic context about new business registrations in Flowery Branch, Georgia.
Your goal is to help residents understand what business registration means and what new businesses are opening.
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `New businesses in ${month}:
${businessList.map(b => `- ${b.name}${b.address ? ` at ${b.address}` : ''}${b.type ? ` (${b.type})` : ''}`).join('\n')}

Provide a brief, informative summary that:
1. Lists the new business registrations
2. Notes if any businesses are in sectors that directly serve residents (restaurants, retail, services, healthcare, childcare)
3. Briefly explains what business registration means (the business has registered with the city and obtained required licenses to operate)
4. Welcomes new businesses to the community
Keep it factual and helpful, 3-4 sentences.`,
      },
    ],
  });

  return response.choices[0]?.message?.content || '';
}

// Generate a simple, friendly explanation of an ordinance (without full text)
export async function explainOrdinanceSimple(
  ordinanceNumber: string,
  ordinanceTitle: string,
  year: string
): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 400,
    messages: [
      {
        role: 'system',
        content: `You are providing brief context about a city ordinance.
Since you don't have the full ordinance text, provide only what can be reasonably inferred from the title.
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Ordinance: ${ordinanceNumber}
Title: ${ordinanceTitle}
Year: ${year}

Based ONLY on the title, provide:
1. A one-sentence guess at what this ordinance might address
2. A note that residents should click the link to read the full official text on Municode

Be clear you're inferring from the title only. If the title isn't descriptive, say so.`,
      },
    ],
  });

  return response.choices[0]?.message?.content || 'Click the link to view this ordinance on Municode.';
}

// Analyze any PDF document using GPT-4o
// OpenAI supports direct PDF input - we send the PDF as base64
export async function analyzePdf(
  documentId: string,
  documentType: 'ordinance' | 'permit' | 'business' | 'meeting' | 'minutes' | 'agenda' | 'budget' | 'audit' | 'splost' | 'notice' | 'strategic' | 'water-quality' | 'resolution' | 'general',
  pdfBase64: string, // Base64-encoded PDF data (without data URL prefix)
  options?: { forceRefresh?: boolean; metadata?: Record<string, unknown>; model?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo'; customPrompt?: string }
): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = getSummary(documentType, documentId, 'pdf-analysis');
    if (cached) return cached.content;
  }

  // Validate pdfBase64 is present and looks valid
  if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length < 100) {
    throw new Error(`Invalid PDF data for ${documentType} ${documentId}: PDF data is missing or too short`);
  }

  // Strip data URL prefix if accidentally included (defensive coding)
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  const client = getClient();

  // Customize prompt based on document type
  const prompts: Record<string, string> = {
    ordinance: `Analyze this ordinance and provide a structured summary. Do NOT include any preamble like "Certainly!" or "Here is the analysis" - just provide the content directly.

**What it does**: A clear 2-3 sentence summary of what this ordinance accomplishes

**Who it affects**: Which residents, businesses, or areas are impacted

**Key details**: Any important dates, requirements, or changes

**Why it matters**: Why the city implemented this (if stated in WHEREAS clauses)

**What You Can Do**: If this ordinance is proposed (not yet adopted), note whether a public hearing is required before adoption. If a hearing is scheduled or required, emphasize that residents can attend and provide input before the final vote. If the ordinance has already been adopted, this section can be omitted.

Read the document carefully and only include information that is actually in the text.`,
    permit: `Analyze this Flowery Branch monthly permit report PDF.

CRITICAL: If the PDF is empty, corrupted, or unreadable, respond with: "Unable to read permit data from this document."

The table columns are: Permit #, Permit Type, Primary Contractor, Parcel #, Parcel Address, City, Lot, Subdivision, Work Class.

Work Class values: "New" = new construction, "ADDITION" or "REPLACE/CHANGE OUT" = renovation/improvement

Provide a summary with these sections:

**Summary**
State the exact total number of permits issued this month (count every row in the table across all pages). Briefly describe the mix of new construction vs improvements.

**New Construction**
List the exact count of new homes and which subdivisions they are in. List the builder/contractor names visible in the document.

**Home Improvements**
List permit types (electrical, plumbing, HVAC, pools, fences, etc.) with exact counts for each.

**Growing Neighborhoods**
Name the subdivisions with the most permit activity this month.

RULES:
- Count EVERY row in the table - check page numbers at the bottom
- Only include subdivisions and builders actually named in the document
- If a field is blank or unreadable, omit it - do NOT make up names`,
    business: `Analyze this Flowery Branch new business registration listing PDF.

CRITICAL: If the PDF is empty, corrupted, or unreadable, respond with: "Unable to read business data from this document."

This is an UNOFFICIAL summary for informational purposes only. Do NOT speak as if you represent the city.

Extract and list each new business registration. Do NOT include street addresses (some may be home businesses).

Format your response as:

**New Business Registrations**

For each business found in the document, list:
• Business Name - Phone number (if shown)

End with the exact total count of businesses listed in the document.

RULES:
- Only list businesses actually shown in the document
- Include phone numbers only if they appear in the document
- Do NOT fabricate business names or details
- Keep it factual - no welcome messages or commentary`,
    meeting: `Summarize these meeting minutes. Do NOT include any preamble - start directly with the content.

Format your response as:
**Decisions Made**
• [List 2-4 key decisions with outcomes - approved/denied/tabled]

**What It Means for Residents**
• [1-2 bullet points on practical impact]

Keep it scannable and concise. Skip procedural items like roll call.`,
    minutes: `Summarize these meeting minutes. Do NOT include any preamble - start directly with the content.

Format your response as:
**Decisions Made**
• [List 2-4 key decisions with outcomes - approved/denied/tabled]

**What It Means for Residents**
• [1-2 bullet points on practical impact]

Keep it scannable and concise. Skip procedural items like roll call.`,
    agenda: `Summarize this meeting agenda. Do NOT include any preamble - start directly with the content.

Format your response as:
**Topics on the Agenda**
• [List 3-5 main discussion items in plain language]

**Public Hearings** (if any)
• [List opportunities for residents to speak]

**What You Can Do**
• Public comment periods: Note when residents can address the council (typically at the beginning of the meeting or during specific agenda items)
• If the agenda includes public hearings, emphasize that this is the residents' opportunity to voice support, concerns, or ask questions before a decision is made

**Meeting Details**
[Date, time, location - one line]

Keep it scannable and concise. Skip routine items like pledge of allegiance.`,
    general: `Analyze this document and provide a structured, citizen-friendly summary.

**Key Points**
- What is this document about? (2-3 bullet points)

**Who It Affects**
- Which residents, businesses, or areas are impacted?

**What Residents Should Know**
- Important details, requirements, or changes

**Deadlines or Actions Required** (if any)
- Any dates, deadlines, or steps residents need to take
- Contact information for questions (if provided)

If any of these sections don't apply to this document, skip them. Keep the summary concise and factual.`,
    budget: `Analyze this city budget document and provide a citizen-friendly summary.

**Budget Overview**
• Total budget amount for this fiscal year
• Major spending categories with approximate percentages or amounts

**Key Highlights**
• Notable new investments, projects, or initiatives
• Significant changes from previous year (if mentioned)
• Major capital projects or infrastructure spending

**What This Means for Residents**
• Key services being funded (police, fire, parks, utilities, etc.)
• Any tax or fee changes mentioned
• Infrastructure or quality of life improvements

Keep it factual and concise. Focus on what residents would want to know about how their tax dollars are being spent. Do NOT include preamble like "Here is the analysis" - start directly with the content.`,
    audit: `Analyze this Annual Comprehensive Financial Report (ACFR) or audit report and provide a citizen-friendly summary.

**Financial Health Overview**
• Total revenues and expenditures for the fiscal year
• Did the city end the year with a surplus or deficit?
• Fund balance / reserves status

**Key Financial Highlights**
• Major sources of revenue (property tax, sales tax, grants, etc.)
• Largest spending areas
• Notable financial achievements or concerns mentioned in the auditor's letter

**What This Means for Residents**
• Is the city in good financial standing?
• Any significant changes from previous years
• Impact on services or future planning

**Auditor's Opinion**
• What opinion did the auditors give? (unmodified/clean is best)
• Any findings or recommendations noted

Keep it factual and accessible. This is a retrospective report showing what actually happened during the fiscal year. Do NOT include preamble - start directly with the content.`,
    splost: `Analyze this SPLOST (Special Purpose Local Option Sales Tax) report and provide a citizen-friendly summary.

IMPORTANT: Only include dollar amounts that are explicitly stated in the document. Double-check that any totals you report match the sum of individual items. If numbers don't add up or are unclear, note the discrepancy.

**Title:** [Extract the official document title/heading from the document, e.g., "SPLOST VII Annual Report - December 31, 2022" or "City of Flowery Branch SPLOST Requirements Report"]

**Document Date:** [Extract the reporting period end date or report date. Format as YYYY-MM-DD (e.g., 2022-12-31 for a report ending December 31, 2022). If only a year is stated, use YYYY-01-01]

**Fund Status**
• Total SPLOST funds allocated (exact figure from document)
• Total funds spent to date (exact figure from document)
• Current fund balance (if stated)

**Projects Funded**
For each project, include:
• Project name
• Budgeted/estimated cost (exact figure)
• Amount spent to date (exact figure)
• Status: completed, in progress, or planned

**What This Means for Residents**
• Brief summary of how these projects benefit the community

Keep it factual. Only report numbers that appear in the document. Do NOT include preamble - start directly with the content.`,
    notice: `Analyze this public notice and provide a citizen-friendly summary.

IMPORTANT: Quote dates, times, locations, and deadlines exactly as written in the document. These details are legally significant.

**Title:** [Extract the official notice title/subject from the document header]

**Document Date:** [Extract the date this notice was issued, posted, or the primary date it refers to. Format as YYYY-MM-DD if possible (e.g., 2025-11-25). If no date is found, write "Not specified"]

**What's Happening**
• One sentence summary of what this notice is about

**Key Details**
• Date and time (quote exactly as written)
• Location/address (quote exactly as written)
• Who this affects

**Important Deadlines**
• List any deadlines prominently (comment periods, response deadlines, hearing dates)
• Make these stand out - they are often time-sensitive

**What You Can Do**
• What residents can or should do in response
• How to submit comments or objections (if applicable)
• Contact information for questions - include name, phone, email, and address if provided

Keep it brief and actionable. Do NOT include preamble - start directly with the content.`,
    strategic: `Analyze this city strategic plan and provide a citizen-friendly summary.

**Title:** [Extract the official document title, e.g., "City of Flowery Branch Strategic Plan FY2025"]

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

Keep it forward-looking and accessible. This is about what the city plans to accomplish. Do NOT include preamble - start directly with the content.`,
    'water-quality': `Analyze this water quality report (Consumer Confidence Report / CCR) and provide a citizen-friendly summary.

**Title:** [Extract the official document title/heading, e.g., "2024 Annual Water Quality Report" or "Consumer Confidence Report 2024"]

**Document Date:** [Extract the year this report covers. Format as YYYY-01-01 (e.g., 2024-01-01 for the 2024 water quality report)]

**Overall Water Quality**
• Does the water meet all federal and state standards?
• Source of the city's water supply

**Key Test Results**
• Any contaminants detected (even if within limits)
• How results compare to allowed levels

**What This Means for Residents**
• Is the water safe to drink?
• Any special considerations for sensitive groups (infants, elderly, immunocompromised)

**Contact Information**
• Who to call with water quality questions

Keep it reassuring but honest. Residents want to know their water is safe. Do NOT include preamble - start directly with the content.`
  };

  const selectedModel = options?.model || 'gpt-4o-mini';
  const response = await client.chat.completions.create({
    model: selectedModel,
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: `You are analyzing an official document for residents of Flowery Branch, Georgia.
Your goal is to read the document carefully and provide an accurate, helpful summary.

ACCURACY IS CRITICAL:
- Only include facts that are explicitly stated in the document
- Quote exact numbers, dates, and addresses - do not approximate
- If something is unclear or you're uncertain, say so rather than guessing
- Never invent or infer information that isn't in the document

${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: options?.customPrompt || prompts[documentType] || prompts.general
          },
          {
            type: 'file',
            file: {
              filename: `document-${documentId}.pdf`,
              file_data: `data:application/pdf;base64,${cleanBase64}`,
            }
          } as unknown as { type: 'text'; text: string } // Type workaround for file input
        ],
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';
  saveSummary(documentType, documentId, 'pdf-analysis', summary, {
    ...options?.metadata,
    model: selectedModel
  });

  return summary;
}

// Legacy function name for backwards compatibility
export async function analyzeOrdinancePdf(
  ordinanceNumber: string,
  pdfBase64: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  return analyzePdf(ordinanceNumber, 'ordinance', pdfBase64, options);
}

// Analyze ordinance from images using GPT-4 Vision (fallback for scanned docs)
export async function analyzeOrdinanceImage(
  ordinanceNumber: string,
  imageUrls: string[], // Base64 data URLs or public URLs of PDF page images
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = getSummary('ordinance', ordinanceNumber, 'vision-analysis');
    if (cached) return cached.content;
  }

  const client = getClient();

  // Prepare image content for the API
  const imageContent = imageUrls.map(url => ({
    type: 'image_url' as const,
    image_url: { url, detail: 'high' as const }
  }));

  const response = await client.chat.completions.create({
    model: 'gpt-4o', // GPT-4o has vision capabilities
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: `You are analyzing a scanned city ordinance document for residents of Flowery Branch, Georgia.
Your goal is to read the document and provide a clear, helpful summary.
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please analyze this ordinance (${ordinanceNumber}) and provide:

1. **What it does**: A clear 2-3 sentence summary of what this ordinance accomplishes
2. **Who it affects**: Which residents, businesses, or areas are impacted
3. **Key details**: Any important dates, requirements, or changes
4. **Why it matters**: Why the city implemented this (if stated in WHEREAS clauses)

Read the document carefully and only include information that is actually in the text. If something is unclear or not visible, say so.`
          },
          ...imageContent
        ],
      },
    ],
  });

  const summary = response.choices[0]?.message?.content || '';
  saveSummary('ordinance', ordinanceNumber, 'vision-analysis', summary);

  return summary;
}

// Fetch PDF from URL and return as base64
export async function fetchPdfAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch PDF: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return base64;
  } catch (error) {
    console.error('Error fetching PDF:', error);
    return null;
  }
}

// Summary level types
export type SummaryLevel = 'headline' | 'brief' | 'detailed';

// Generate a headline (1 sentence) from an existing detailed summary
export async function generateHeadline(
  entityType: string,
  entityId: string,
  fullSummary: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const summaryType = 'headline';

  if (!options?.forceRefresh) {
    const cached = getSummary(entityType, entityId, summaryType);
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini', // Using cheaper model for condensing
    max_tokens: 100,
    messages: [
      {
        role: 'system',
        content: `You are condensing a civic document summary into a single headline sentence.
Your goal is to capture the most important point for residents of Flowery Branch, Georgia.

Rules:
- Write exactly ONE sentence
- Focus on the most impactful decision, announcement, or finding
- Use active voice and clear language
- Keep it under 20 words if possible
- Do NOT include prefixes like "Headline:" or "Summary:"
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Condense this summary into a single headline sentence:

${fullSummary}`,
      },
    ],
  });

  const headline = response.choices[0]?.message?.content || '';
  saveSummary(entityType, entityId, summaryType, headline);

  return headline;
}

// Generate a brief summary (150 words) from an existing detailed summary
export async function generateBriefSummary(
  entityType: string,
  entityId: string,
  fullSummary: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const summaryType = 'brief';

  if (!options?.forceRefresh) {
    const cached = getSummary(entityType, entityId, summaryType);
    if (cached) return cached.content;
  }

  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini', // Using cheaper model for condensing
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content: `You are condensing a civic document summary into a brief overview.
Your goal is to provide key points for residents of Flowery Branch, Georgia.

Rules:
- Keep the summary to approximately 150 words
- Include 2-4 key points that matter most to residents
- Use bullet points for clarity
- Explain why this matters to the community
- Do NOT include prefixes like "Brief Summary:"
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Condense this detailed summary into a brief overview (about 150 words):

${fullSummary}`,
      },
    ],
  });

  const brief = response.choices[0]?.message?.content || '';
  saveSummary(entityType, entityId, summaryType, brief);

  return brief;
}

// Generate all summary levels from a detailed summary
export async function generateAllSummaryLevels(
  entityType: string,
  entityId: string,
  detailedSummary: string,
  options?: { forceRefresh?: boolean }
): Promise<{ headline: string; brief: string; detailed: string }> {
  // The detailed summary is already stored with 'pdf-analysis' type
  // We need to also store it as 'detailed' for consistency
  if (options?.forceRefresh || !getSummary(entityType, entityId, 'detailed')) {
    saveSummary(entityType, entityId, 'detailed', detailedSummary);
  }

  // Generate headline and brief in parallel
  const [headline, brief] = await Promise.all([
    generateHeadline(entityType, entityId, detailedSummary, options),
    generateBriefSummary(entityType, entityId, detailedSummary, options),
  ]);

  return {
    headline,
    brief,
    detailed: detailedSummary,
  };
}

// Backfill summary levels for existing detailed summaries
export async function backfillSummaryLevels(
  entityType: string,
  entityId: string,
  options?: { forceRefresh?: boolean }
): Promise<{ headline: string; brief: string; detailed: string } | null> {
  // First, check if we have a detailed summary (stored as 'pdf-analysis')
  const existing = getSummary(entityType, entityId, 'pdf-analysis');
  if (!existing) {
    console.log(`No detailed summary found for ${entityType}/${entityId}`);
    return null;
  }

  return generateAllSummaryLevels(entityType, entityId, existing.content, options);
}

// Interface for extracted agenda items
export interface ExtractedAgendaItem {
  orderNum: number;
  title: string;
  type: 'ordinance' | 'resolution' | 'public_hearing' | 'consent' | 'new_business' | 'report' | 'other';
  referenceNumber?: string;
}

// Extract structured agenda items from a PDF using OpenAI
// Used when the CivicClerk sidebar doesn't have itemized agenda data (pre-2025 meetings)
export async function extractAgendaItemsFromPdf(
  pdfBase64: string
): Promise<ExtractedAgendaItem[]> {
  const client = getClient();

  // Clean the base64 string (remove any data URL prefix if present)
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini', // Using cheaper model for extraction
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are extracting structured agenda items from a city council meeting agenda PDF.
Your task is to identify all substantive agenda items and return them as a JSON array.

Return ONLY a JSON object with this structure:
{
  "items": [
    {
      "orderNum": 1,
      "title": "Full text of the agenda item",
      "type": "ordinance|resolution|public_hearing|consent|new_business|report|other",
      "referenceNumber": "765" // Optional - only if an ordinance/resolution number is mentioned
    }
  ]
}

Classification rules:
- "ordinance": Items mentioning an Ordinance or Ordinance number
- "resolution": Items mentioning a Resolution or Resolution number
- "public_hearing": Items explicitly labeled as public hearings
- "consent": Items in a consent agenda or routine approvals (minutes, bills, etc.)
- "new_business": Items starting with "Consider" or new proposals
- "report": Staff reports, department updates, presentations
- "other": Everything else that's substantive

SKIP these procedural items (do NOT include):
- Call to Order, Roll Call, Pledge of Allegiance
- Invocation, Adjournment
- Agenda modifications
- Executive session announcements (unless they describe a topic)

For referenceNumber:
- Extract "765" from "Ordinance 765" or "Ordinance No. 765"
- Extract "25-012" from "Resolution 25-012" or "Resolution No. 25-012"
- Leave undefined if no number is present

ACCURACY IS CRITICAL: Only extract items that are clearly in the document.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all substantive agenda items from this city council meeting agenda:'
          },
          {
            type: 'file',
            file: {
              filename: 'agenda.pdf',
              file_data: `data:application/pdf;base64,${cleanBase64}`,
            }
          } as unknown as { type: 'text'; text: string } // Type workaround for file input
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    const items = parsed.items || [];

    // Validate and clean the items
    return items.map((item: { orderNum?: number; title?: string; type?: string; referenceNumber?: string }, index: number) => ({
      orderNum: item.orderNum || index + 1,
      title: item.title || '',
      type: ['ordinance', 'resolution', 'public_hearing', 'consent', 'new_business', 'report', 'other'].includes(item.type || '')
        ? item.type as ExtractedAgendaItem['type']
        : 'other',
      referenceNumber: item.referenceNumber,
    })).filter((item: ExtractedAgendaItem) => item.title.length > 0);
  } catch (error) {
    console.error('Failed to parse agenda items JSON:', error);
    return [];
  }
}

// Interface for extracted resolution details
export interface ExtractedResolutionDetails {
  found: boolean;
  rawText?: string;  // Exact text from the PDF (WHEREAS clauses + resolution text)
}

// Extract exact resolution text from an agenda PDF
// Used for older meetings where separate resolution PDFs aren't available
export async function extractResolutionFromAgendaPdf(
  pdfBase64: string,
  resolutionNumber: string
): Promise<ExtractedResolutionDetails> {
  const client = getClient();
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 3000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are extracting the EXACT text of a specific resolution from a city council agenda PDF.

CRITICAL RULES - DO NOT HALLUCINATE:
- Find Resolution ${resolutionNumber} in this document
- Extract the EXACT text as written - do NOT paraphrase or summarize
- Include WHEREAS clauses and the resolution action (BE IT RESOLVED)
- If the resolution is not found in the document, return found: false
- If you cannot read the document clearly, return found: false
- NEVER make up or fabricate resolution text

Return a JSON object:
{
  "found": true/false,
  "rawText": "WHEREAS... BE IT RESOLVED..." // Only if found=true
}

If found=false, do NOT include rawText field.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Find Resolution ${resolutionNumber} in this agenda PDF and extract its exact text. If you cannot find it, return {"found": false}.`
          },
          {
            type: 'file',
            file: {
              filename: 'agenda.pdf',
              file_data: `data:application/pdf;base64,${cleanBase64}`,
            }
          } as unknown as { type: 'text'; text: string }
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    return {
      found: parsed.found === true,
      rawText: parsed.found ? parsed.rawText : undefined,
    };
  } catch (error) {
    console.error('Failed to parse resolution extraction JSON:', error);
    return { found: false };
  }
}

// Generate a resolution summary from extracted text (same format as PDF analysis)
export async function generateResolutionSummaryFromText(
  resolutionNumber: string,
  resolutionTitle: string,
  rawText: string,
  status: 'proposed' | 'adopted' | 'rejected' | 'tabled' = 'adopted'
): Promise<string> {
  const client = getClient();
  const isProposed = status === 'proposed';

  const proposedNote = `
Note: This is a draft document. Signature lines are templates, not endorsements.
Describe what this resolution would do IF adopted. Do not attribute positions to officials.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: `You are summarizing a city council resolution for residents of Flowery Branch, Georgia.
Your goal is to explain what this resolution does in plain language.

${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Resolution ${resolutionNumber}: "${resolutionTitle}"
Status: ${status.toUpperCase()}${isProposed ? ' (not yet voted on)' : ''}
${isProposed ? proposedNote : ''}
Resolution Text:
${rawText}

Provide a structured summary:

**What it does**: A clear 2-3 sentence summary of what this resolution ${isProposed ? 'would accomplish if adopted' : 'accomplishes'}

**Key details**: Any important specifics (amounts, locations, parties involved)

**Background**: Why this resolution was ${isProposed ? 'proposed' : 'needed'} (from WHEREAS clauses)

**Impact**: How this ${isProposed ? 'would affect' : 'affects'} residents or the community

Keep the summary concise (2-3 paragraphs). Use plain language that a resident would understand.`,
      },
    ],
  });

  return response.choices[0]?.message?.content || '';
}

// Interface for extracted ordinance details
export interface ExtractedOrdinanceDetails {
  found: boolean;
  rawText?: string;  // Exact text from the PDF
}

// Extract exact ordinance text from an agenda PDF
// Used for older meetings where ordinance is only in the agenda packet
export async function extractOrdinanceFromAgendaPdf(
  pdfBase64: string,
  ordinanceNumber: string
): Promise<ExtractedOrdinanceDetails> {
  const client = getClient();
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 3000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are extracting the EXACT text of a specific ordinance from a city council agenda PDF.

CRITICAL RULES - DO NOT HALLUCINATE:
- Find Ordinance ${ordinanceNumber} in this document
- Extract the EXACT text as written - do NOT paraphrase or summarize
- Include the full ordinance text with any WHEREAS clauses
- If the ordinance is not found in the document, return found: false
- If you cannot read the document clearly, return found: false
- NEVER make up or fabricate ordinance text

Return a JSON object:
{
  "found": true/false,
  "rawText": "AN ORDINANCE..." // Only if found=true
}

If found=false, do NOT include rawText field.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Find Ordinance ${ordinanceNumber} in this agenda PDF and extract its exact text. If you cannot find it, return {"found": false}.`
          },
          {
            type: 'file',
            file: {
              filename: 'agenda.pdf',
              file_data: `data:application/pdf;base64,${cleanBase64}`,
            }
          } as unknown as { type: 'text'; text: string }
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    return {
      found: parsed.found === true,
      rawText: parsed.found ? parsed.rawText : undefined,
    };
  } catch (error) {
    console.error('Failed to parse ordinance extraction JSON:', error);
    return { found: false };
  }
}

// Generate an ordinance summary from extracted text (same format as PDF analysis)
export async function generateOrdinanceSummaryFromText(
  ordinanceNumber: string,
  ordinanceTitle: string,
  rawText: string
): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: `You are summarizing a city ordinance for residents of Flowery Branch, Georgia.
Your goal is to explain what this ordinance does in plain language.

${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: `Ordinance ${ordinanceNumber}: "${ordinanceTitle}"

Ordinance Text:
${rawText}

Provide a structured summary:

**What it does**: A clear 2-3 sentence summary of what this ordinance accomplishes

**Who it affects**: Which residents, businesses, or areas are impacted

**Key details**: Any important dates, requirements, or changes

**Why it matters**: Why the city implemented this (if stated in WHEREAS clauses)

Keep the summary concise and use plain language that a resident would understand.`,
      },
    ],
  });

  return response.choices[0]?.message?.content || '';
}
