import { cityName } from '../city-config-client';

export const splostPrompt = `Analyze this SPLOST (Special Purpose Local Option Sales Tax) report and provide a citizen-friendly summary.

IMPORTANT: Only include dollar amounts that are explicitly stated in the document. Double-check that any totals you report match the sum of individual items. If numbers don't add up or are unclear, note the discrepancy.

**Title:** [Extract the official document title/heading from the document, e.g., "SPLOST VII Annual Report - December 31, 2022" or "City of ${cityName} SPLOST Requirements Report"]

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

Keep it factual. Only report numbers that appear in the document. Do NOT include preamble - start directly with the content.`;
