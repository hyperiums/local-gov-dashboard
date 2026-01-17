import { cityName } from '../city-config-client';

export const businessPrompt = `Analyze this ${cityName} new business registration listing PDF.

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
- Keep it factual - no welcome messages or commentary`;
