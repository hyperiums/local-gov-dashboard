# Months recovered from scans

January and February 2023 are the only permit reports the city published as
scanned images rather than digital documents. They carry no text layer at all —
`unpdf` extracts 4 and 3 characters respectively — so the scraper cannot read
them and records them as `not_machine_readable`. Left alone, the dashboard
would show two permanently empty months in the middle of otherwise complete
history, with nothing to say why.

These files are the transcription that fills them, kept as reviewable data
rather than hidden inside a script. Anyone can check a row against the source
PDF without running anything.

## How the rows were produced

Each page was read twice, independently, and only agreeing values were kept:

1. **macOS Vision OCR** — `ocr.swift` in this directory. It renders each page
   at 3× and reconstructs table rows from text-fragment geometry, because
   Vision's own reading order emits a dense table column by column and would
   otherwise decouple a permit number from the address printed beside it. Pages
   are rotated to whichever orientation yields the most text; January was
   scanned sideways.
2. **A person reading the rendered pages**, which preserves row alignment
   directly.

The two disagreed once, on January's address: `Moondancer Cir` by eye,
`Moondancer Ct` by OCR. The scan supports `Ct`, which is what is recorded.

Counts are checked against the totals each report prints itself — "Total
Records: 21" for January, "Total Records: 19" for February. February numbers its
permits 45 down to 26 with 32 absent, which is the city's own gap; January runs
25 down to 5 with none.

**Check the file's page count before trusting a footer.** January's PDF is four
pages holding two different reports: an electrical-only "PERMITS ISSUED BY TYPE"
view on pages 1-2, then the month's actual "Permit Report" on pages 3-4. The
first report's footer reads "Page 2 of 2", which describes that report and not
the file. Reading only those two pages produced a first transcription of 2
permits for a month that issued 21 — caught when the AI summary generated from
the same PDF cited a total the database disagreed with. January 2023 is the
month the city switched formats, which is why both appear at all; the
transcription keeps the Permit Report, since that is the whole month and matches
how every other month is recorded.

## Why these are not parsed like every other month

They cannot be. There is no text to parse. Every other month in the database
comes from `parsePermitPdfText` reading an embedded text layer; these two come
from optical character recognition of a scan plus human review. That is a
weaker provenance and it is recorded as such — the import writes a
`scrape_runs` row with `channel: "ocr-transcription"`, so the collection log
shows how they arrived rather than implying they were scraped.

If the city ever republishes either month as a digital document, delete the
corresponding rows and let `bulk-permits` collect it normally.

## Rebuilding or verifying

```bash
# OCR a source PDF (requires macOS; Vision and PDFKit are system frameworks)
swiftc -O scripts/scanned-months/ocr.swift -o /tmp/ocr
curl -sL -o /tmp/feb2023.pdf "https://www.flowerybranchga.org/Documents/Departments/Community%20Development/Monthly%20Permit%20Statistics/2023/feb2023permitlisting.pdf"
/tmp/ocr /tmp/feb2023.pdf

# Load the transcriptions into the local database
node scripts/scanned-months/import.mjs

# Then push to production the same way as any other month
bash scripts/push-permits.sh 2023-01 2023-02
```
