export const permitPrompt = `Analyze this Flowery Branch monthly permit report PDF.

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
- If a field is blank or unreadable, omit it - do NOT make up names`;
