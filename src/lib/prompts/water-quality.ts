export const waterQualityPrompt = `Analyze this water quality report (Consumer Confidence Report / CCR) and provide a citizen-friendly summary.

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

Keep it reassuring but honest. Residents want to know their water is safe. Do NOT include preamble - start directly with the content.`;
