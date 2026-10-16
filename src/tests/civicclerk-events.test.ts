import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  civicClerkEventToMeeting,
  civicClerkEventsUrl,
  fetchCivicClerkMeetings,
  type CivicClerkApiEvent,
} from '@/lib/scraper/civicclerk-events';

// The portal-page scrape read each meeting's date from a React page that had
// 1.5 seconds to render. On 2026-10-16 it logged "Could not parse date" for
// event 281, the October 17 special called meeting, and dropped it. The
// Events API carries the date as data. These pages were recorded from it on
// 2026-10-15.

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/tests/fixtures', name), 'utf-8'));
const page1 = fixture('civicclerk-events-page1.json');
const page2 = fixture('civicclerk-events-page2.json');

const FIRST_PAGE_2025 =
  'https://flowerybranchga.api.civicclerk.com/v1/Events?$filter=startDateTime%20ge%202025-01-01T00%3A00%3A00Z&$orderby=startDateTime';
const ALL_EVENTS = 'https://flowerybranchga.api.civicclerk.com/v1/Events?$orderby=startDateTime';
const PORTAL = 'https://flowerybranchga.portal.civicclerk.com';
const REQUEST_INIT = {
  headers: {
    'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
    Accept: 'application/json',
  },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(pages: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (!(url in pages)) throw new Error(`unexpected fetch ${url}`);
    return jsonResponse(pages[url]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const recorded = (id: number): CivicClerkApiEvent =>
  [...page1.value, ...page2.value].find((e: CivicClerkApiEvent) => e.id === id);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('civicClerkEventsUrl', () => {
  it('filters on the first day of minYear and orders by start time', () => {
    expect(civicClerkEventsUrl(2025)).toBe(FIRST_PAGE_2025);
  });

  it('asks for every event when no minYear is given', () => {
    expect(civicClerkEventsUrl()).toBe(ALL_EVENTS);
  });
});

describe('fetchCivicClerkMeetings', () => {
  it('follows @odata.nextLink and keeps every event, newest first', async () => {
    const fetchMock = stubFetch({
      [FIRST_PAGE_2025]: page1,
      [page1['@odata.nextLink']]: page2,
    });

    const meetings = await fetchCivicClerkMeetings({ minYear: 2025 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, FIRST_PAGE_2025, REQUEST_INIT);
    expect(fetchMock).toHaveBeenNthCalledWith(2, page1['@odata.nextLink'], REQUEST_INIT);
    expect(meetings.map(m => [m.eventId, m.date])).toEqual([
      [281, '2026-10-17'],
      [86, '2026-10-15'],
      [61, '2026-09-17'],
      [97, '2025-01-02'],
    ]);
  });

  it('reads a single page when there is no nextLink', async () => {
    stubFetch({ [ALL_EVENTS]: page2 });

    const meetings = await fetchCivicClerkMeetings();

    expect(meetings.map(m => m.eventId)).toEqual([281, 86]);
  });

  it('fails loudly when the API refuses, instead of reporting no meetings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)));

    await expect(fetchCivicClerkMeetings({ minYear: 2025 })).rejects.toThrow(
      'CivicClerk Events API returned 503'
    );
  });

  it('fails loudly on a response without an event list', async () => {
    stubFetch({ [ALL_EVENTS]: { '@odata.context': page2['@odata.context'] } });

    await expect(fetchCivicClerkMeetings()).rejects.toThrow('CivicClerk Events API returned no event list');
  });

  it('leaves out an event CivicClerk marks deleted', async () => {
    stubFetch({ [ALL_EVENTS]: { value: [{ ...recorded(61), isDeleted: true }] } });

    expect(await fetchCivicClerkMeetings()).toEqual([]);
  });
});

describe('civicClerkEventToMeeting', () => {
  it('maps the October 17 special called meeting to the existing meeting shape', () => {
    expect(civicClerkEventToMeeting(recorded(281))).toEqual({
      eventId: 281,
      date: '2026-10-17',
      title: 'City Council Meeting',
      location: '5410 Pine Street, Flowery Branch, GA 30542',
      type: 'city_council',
      agendaUrl: `${PORTAL}/event/281/files`,
      minutesUrl: undefined,
      mediaUrl: `${PORTAL}/event/281/media`,
    });
  });

  it('takes the date from the text of startDateTime, never a time-zone conversion', () => {
    // CivicClerk writes local wall-clock time with a Z. Converting this to
    // Eastern would move it to October 15.
    expect(civicClerkEventToMeeting({ ...recorded(86), startDateTime: '2026-10-16T01:00:00Z' }).date).toBe(
      '2026-10-16'
    );
    expect(civicClerkEventToMeeting(recorded(86)).date).toBe('2026-10-15');
  });

  it('links minutes when CivicClerk has published a Minutes file', () => {
    expect(civicClerkEventToMeeting(recorded(97)).minutesUrl).toBe(`${PORTAL}/event/97/files`);
    expect(civicClerkEventToMeeting(recorded(86)).minutesUrl).toBeUndefined();
  });

  it('imports the canceled September 17 meeting like any council meeting', () => {
    const meeting = civicClerkEventToMeeting(recorded(61));
    expect(meeting).toMatchObject({ eventId: 61, date: '2026-09-17', title: 'City Council Meeting', type: 'city_council' });
    expect(meeting.minutesUrl).toBeUndefined();
  });

  it('derives planning, work session and other types from the name and category', () => {
    const base = recorded(86);
    expect(
      civicClerkEventToMeeting({ ...base, eventName: 'Planning Commission Meeting', categoryName: 'Planning Commission' })
    ).toMatchObject({ type: 'planning', title: 'Planning Commission Meeting' });
    expect(
      civicClerkEventToMeeting({ ...base, eventName: 'Work Session', categoryName: 'Work Session' })
    ).toMatchObject({ type: 'work_session', title: 'Work Session' });
    expect(
      civicClerkEventToMeeting({ ...base, eventName: 'Ribbon Cutting', categoryName: 'Community Events' })
    ).toMatchObject({ type: 'other', title: 'City Meeting' });
  });

  it('types by the event name before the category, which is City Council for every event', () => {
    const base = { ...recorded(86), categoryName: 'City Council' };
    expect(
      civicClerkEventToMeeting({ ...base, eventName: 'October 20, 2026 Work Session' })
    ).toMatchObject({ type: 'work_session', title: 'Work Session' });
    expect(
      civicClerkEventToMeeting({ ...base, eventName: 'Budget Hearing' })
    ).toMatchObject({ type: 'city_council', title: 'City Council Meeting' });
  });

  it('refuses an event whose startDateTime has no date', () => {
    expect(() => civicClerkEventToMeeting({ ...recorded(86), startDateTime: '' })).toThrow(
      'CivicClerk event 86 has an unreadable startDateTime'
    );
  });
});
