export const noticePrompt = `Analyze this public notice and provide a citizen-friendly summary.

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

Keep it brief and actionable. Do NOT include preamble - start directly with the content.`;
