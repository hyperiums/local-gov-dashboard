---
name: scrape-guide
description: Guide for running the Flowery Branch data scraping pipeline. Use this when the user wants to scrape data, refresh the database, run the pipeline, or asks about scraping operations.
---

# Flowery Branch Scraping Pipeline Guide

This skill guides you through the data scraping operations for the Flowery Branch civic transparency dashboard.

## API Endpoint

All scraping operations go through:

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type": "OPERATION_TYPE", "params": {...}}'
```

## Operation Reference

| Operation | Description | Key Parameters |
|-----------|-------------|----------------|
| `discover-meetings` | Find meeting URLs from CivicClerk portal | `minYear`, `limit` |
| `bulk-meetings-with-agenda` | Scrape meetings AND their agenda items | `minYear`, `limit` |
| `ordinances` | Scrape ordinances from Municode | `limit` |
| `sync-municode-supplements` | Sync ordinance supplements from Municode | - |
| `extract-resolutions` | Extract resolutions from agenda items | - |
| `link-ordinances` | Link ordinances to meetings via agenda references | - |
| `backfill-resolution-outcomes` | Update resolution outcomes from minutes | - |
| `generate-meeting-summaries` | Generate AI summaries for meetings | `limit`, `regenerate` |
| `generate-ordinance-summaries` | Generate AI summaries for ordinances | `limit`, `regenerate` |
| `bulk-permits` | Scrape permit reports for a month | `year`, `month` |

## Workflows

### Initial Setup (Fresh Database)

Run these in order for a complete database population:

```
1. bulk-meetings-with-agenda    # minYear: 2020 (or desired start)
2. ordinances                   # Get all Municode ordinances
3. sync-municode-supplements    # Get ordinance full text
4. extract-resolutions          # Parse resolutions from agenda items
5. link-ordinances              # Connect ordinances to meetings
6. generate-meeting-summaries   # AI summaries for meetings
7. generate-ordinance-summaries # AI summaries for ordinances
```

### Monthly Refresh

Run these periodically to keep data current:

```
1. bulk-meetings-with-agenda    # minYear: current year (auto-generates summaries, updates vote outcomes)
2. link-ordinances              # Link any new ordinances
3. bulk-permits                 # year/month for current month
```

Note: `bulk-meetings-with-agenda` now handles meeting summaries automatically - agenda summaries for upcoming meetings, plus agenda and minutes summaries for past meetings.

### Quick Refresh (Just Meetings)

For a quick update of recent meetings:

```
1. bulk-meetings-with-agenda    # minYear: current year, limit: 10
```

## Dependencies & Warnings

- **link-ordinances** requires both meetings AND ordinances to exist first
- **extract-resolutions** requires agenda items (from bulk-meetings-with-agenda)
- **bulk-meetings-with-agenda** automatically:
  - Updates vote outcomes for past meetings with pending items
  - Generates agenda summaries for upcoming meetings (agendas are published before meetings)
  - Generates both agenda and minutes summaries for past meetings
- **generate-*-summaries** requires OPENAI_API_KEY to be set
- Large scrapes can take significant time; consider using limits for testing

## Example Commands

**Scrape recent meetings:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type": "bulk-meetings-with-agenda", "params": {"minYear": 2024, "limit": 10}}'
```

**Generate summaries for unsummarized meetings:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type": "generate-meeting-summaries", "params": {"limit": 20}}'
```

**Scrape permits for a specific month:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type": "bulk-permits", "params": {"year": 2024, "month": 12}}'
```

## Troubleshooting

- **401 Unauthorized**: Check ADMIN_SECRET environment variable
- **Timeout errors**: Use smaller limits, or increase timeout
- **Missing summaries**: Verify OPENAI_API_KEY is set
- **No data returned**: Check minYear isn't in the future

## Execution Protocol

When running a workflow, follow this pattern for EVERY step:

### Before Each Step
Announce: "Step X: Running {operation}... This will {description}."

### After Each Step
Report the API response, specifically:
- Number of items processed/created
- Any errors or warnings
- Key data points from the response

### Track Progress
Keep a running tally throughout the workflow:
- Meetings scraped: X
- Agenda items found: Y
- Ordinances: Z
- Resolutions: X
- Summaries generated: Y

## Verification (Run After Workflow)

After completing a workflow, run these verification queries against the database:

### Quick Stats Check
```sql
SELECT
  (SELECT COUNT(*) FROM meetings) as meetings,
  (SELECT COUNT(*) FROM agenda_items) as agenda_items,
  (SELECT COUNT(*) FROM ordinances) as ordinances,
  (SELECT COUNT(*) FROM resolutions) as resolutions,
  (SELECT COUNT(*) FROM permits) as permits,
  (SELECT COUNT(*) FROM summaries) as summaries;
```

### Data Quality Check
```sql
-- Recent meetings with content
SELECT date, title,
  CASE WHEN agenda_url IS NOT NULL THEN '✓' ELSE '✗' END as agenda,
  CASE WHEN minutes_url IS NOT NULL THEN '✓' ELSE '✗' END as minutes
FROM meetings ORDER BY date DESC LIMIT 5;
```

### Summary Coverage
```sql
SELECT entity_type, COUNT(DISTINCT entity_id) as entities
FROM summaries GROUP BY entity_type;
```

## Final Summary

After verification, report using this template:

**Workflow: {workflow_name}**
**Completed:** {timestamp}

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Meetings | X | Y | +Z |
| Agenda Items | X | Y | +Z |
| Ordinances | X | Y | +Z |
| Summaries | X | Y | +Z |

**Verification Status:**
- [ ] All API calls succeeded
- [ ] Record counts increased as expected
- [ ] No orphaned records found
- [ ] Recent data has expected content