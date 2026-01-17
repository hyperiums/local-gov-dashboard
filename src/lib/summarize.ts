// AI-powered summarization using OpenAI API
import OpenAI from 'openai';
import { getSummary, saveSummary } from './db';
import { TONE_GUIDELINES, PDF_ANALYSIS_PROMPTS } from './prompts';
import { cityName, cityState } from './city-config-client';

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
        content: `You are summarizing city council meeting agendas for residents of ${cityName}, ${cityState}.
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
        content: `You are summarizing city council meeting minutes for residents of ${cityName}, ${cityState}.
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
        content: `You are explaining a city ordinance to residents of ${cityName}, ${cityState}.
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

// Generate a weekly summary for the city
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
        content: `You are writing a friendly, informative weekly update for residents of ${cityName}, ${cityState}.
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
        content: `You are summarizing monthly building permit activity for ${cityName}, ${cityState}.
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
        content: `You are providing civic context about new business registrations in ${cityName}, ${cityState}.
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
  options?: { forceRefresh?: boolean; metadata?: Record<string, unknown>; model?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo'; customPrompt?: string; dryRun?: boolean }
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

  const selectedModel = options?.model || 'gpt-4o-mini';
  const response = await client.chat.completions.create({
    model: selectedModel,
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: `You are analyzing an official document for residents of ${cityName}, ${cityState}.
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
            text: options?.customPrompt || PDF_ANALYSIS_PROMPTS[documentType] || PDF_ANALYSIS_PROMPTS.general
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
  if (!options?.dryRun) {
    saveSummary(documentType, documentId, 'pdf-analysis', summary, {
      ...options?.metadata,
      model: selectedModel
    });
  }

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
        content: `You are analyzing a scanned city ordinance document for residents of ${cityName}, ${cityState}.
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

// Check if URL is safe to fetch (prevent SSRF attacks)
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges
    // 10.0.0.0/8
    if (/^10\./.test(hostname)) return false;
    // 172.16.0.0/12
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return false;
    // 192.168.0.0/16
    if (/^192\.168\./.test(hostname)) return false;
    // 169.254.0.0/16 (link-local)
    if (/^169\.254\./.test(hostname)) return false;

    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Fetch PDF from URL and return as base64
export async function fetchPdfAsBase64(url: string): Promise<string | null> {
  try {
    // SSRF protection: validate URL before fetching
    if (!isAllowedUrl(url)) {
      console.error(`Blocked fetch to disallowed URL: ${url}`);
      return null;
    }

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
Your goal is to capture the most important point for residents of ${cityName}, ${cityState}.

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
Your goal is to provide key points for residents of ${cityName}, ${cityState}.

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
        content: `You are summarizing a city council resolution for residents of ${cityName}, ${cityState}.
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
        content: `You are summarizing a city ordinance for residents of ${cityName}, ${cityState}.
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

// Interface for voting outcome extraction
export interface VotingOutcome {
  reference: string;  // Resolution/Ordinance number (e.g., "25-015", "767")
  title: string;      // Item title for matching
  outcome: 'adopted' | 'rejected' | 'tabled';
  voteDetails?: {
    motion?: string;
    second?: string;
    ayes?: string[];
    nays?: string[];
  };
}

// Extract voting outcomes from meeting minutes PDF
// This is the authoritative source for resolution/ordinance status
export async function extractOutcomesFromMinutesPdf(
  pdfBase64: string,
  agendaItems: { reference: string; title: string }[]
): Promise<VotingOutcome[]> {
  const client = getClient();
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  // Build a list of items to look for
  const itemsToFind = agendaItems.map(item =>
    `- ${item.reference ? `${item.reference}: ` : ''}${item.title}`
  ).join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o',  // Using GPT-4o for better accuracy on structured extraction
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are extracting voting outcomes from official city council meeting minutes.

CRITICAL ACCURACY RULES:
- Only extract outcomes that are EXPLICITLY stated in the minutes
- Look for voting records that follow the pattern:
  Motion: [name]
  Second: [name]
  Ayes: [list of names]
  Nays: [list of names or "None"]
  Result: passed/approved/adopted OR failed/rejected/denied OR tabled
- Match items by their reference number (Resolution 25-015, Ordinance 767) or by title
- If an item is not mentioned or has no vote recorded, do NOT include it in results
- NEVER guess or infer outcomes - only report what is explicitly stated

Return a JSON object with this structure:
{
  "outcomes": [
    {
      "reference": "25-015",
      "title": "Accept Public Right-of-Way at Pod Knutson",
      "outcome": "adopted",
      "voteDetails": {
        "motion": "Council Member Name",
        "second": "Council Member Name",
        "ayes": ["Name1", "Name2", "Name3"],
        "nays": []
      }
    }
  ]
}

Valid outcome values: "adopted" (passed/approved), "rejected" (failed/denied), "tabled"
${TONE_GUIDELINES}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract voting outcomes for these agenda items from the meeting minutes:

${itemsToFind}

Search the minutes document for each item and extract the official voting result. Only include items that have a recorded vote.`
          },
          {
            type: 'file',
            file: {
              filename: 'minutes.pdf',
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
    const outcomes = parsed.outcomes || [];

    // Validate and clean the outcomes
    return outcomes
      .filter((o: { outcome?: string }) =>
        o.outcome && ['adopted', 'rejected', 'tabled'].includes(o.outcome)
      )
      .map((o: { reference?: string; title?: string; outcome: string; voteDetails?: { motion?: string; second?: string; ayes?: string[]; nays?: string[] } }) => ({
        reference: o.reference || '',
        title: o.title || '',
        outcome: o.outcome as 'adopted' | 'rejected' | 'tabled',
        voteDetails: o.voteDetails,
      }));
  } catch (error) {
    console.error('Failed to parse voting outcomes JSON:', error);
    return [];
  }
}
