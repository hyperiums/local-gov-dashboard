// Meeting discovery from CivicClerk's public Events API (OData).
// The portal is a React app, and reading each event's date from its rendered
// page dropped any event whose page hadn't rendered in time (event 281, the
// October 17, 2026 special called meeting). The API carries the date as data.
import { civicClerkApiUrl, civicClerkUrl, cityAddress } from '../city-config-client';

export interface CivicClerkMeeting {
  eventId: number;
  date: string;
  title: string;
  location: string;
  type: string;
  agendaUrl: string;
  minutesUrl?: string;
  mediaUrl?: string;
  agendaText?: string;
}

export interface CivicClerkApiEvent {
  id: number;
  eventName: string;
  startDateTime: string;
  categoryName: string;
  isDeleted: boolean;
  publishedFiles: { type: string }[];
}

interface CivicClerkEventsPage {
  value?: CivicClerkApiEvent[];
  '@odata.nextLink'?: string;
}

// The city can see who reads its systems; every request this project makes
// identifies itself the same way (see CLAUDE.md, Data Refresh).
const REQUEST_HEADERS = {
  'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
  Accept: 'application/json',
};

// CivicClerk returns 15 events a page; 100 pages is far beyond the city's
// whole history, so hitting it means the server is handing back nextLinks
// forever, not that there is more to read.
const MAX_PAGES = 100;

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}T/;

export function civicClerkEventsUrl(minYear?: number): string {
  const query = ['$orderby=startDateTime'];
  if (minYear !== undefined) {
    query.unshift(`$filter=${encodeURIComponent(`startDateTime ge ${minYear}-01-01T00:00:00Z`)}`);
  }
  return `${civicClerkApiUrl}/v1/Events?${query.join('&')}`;
}

export function civicClerkEventToMeeting(event: CivicClerkApiEvent): CivicClerkMeeting {
  // CivicClerk writes the city's wall-clock time with a Z suffix (6 PM
  // meetings come back as T18:00:00Z), so the calendar date is the text before
  // the T. Converting it as a UTC instant would move late meetings a day.
  if (!DATE_PREFIX.test(event.startDateTime)) {
    throw new Error(
      `CivicClerk event ${event.id} has an unreadable startDateTime: ${JSON.stringify(event.startDateTime)}`
    );
  }
  const date = event.startDateTime.slice(0, 10);

  const nameText = `${event.eventName} ${event.categoryName}`.toLowerCase();
  let type = 'other';
  let title = 'City Meeting';
  if (nameText.includes('city council')) {
    type = 'city_council';
    title = 'City Council Meeting';
  } else if (nameText.includes('planning')) {
    type = 'planning';
    title = 'Planning Commission Meeting';
  } else if (nameText.includes('work session')) {
    type = 'work_session';
    title = 'Work Session';
  }

  const filesUrl = `${civicClerkUrl}/event/${event.id}/files`;
  const hasMinutes = event.publishedFiles.some(file => file.type === 'Minutes');

  return {
    eventId: event.id,
    date,
    title,
    location: cityAddress,
    type,
    agendaUrl: filesUrl,
    minutesUrl: hasMinutes ? filesUrl : undefined,
    mediaUrl: `${civicClerkUrl}/event/${event.id}/media`,
  };
}

export async function fetchCivicClerkMeetings(options?: { minYear?: number }): Promise<CivicClerkMeeting[]> {
  const meetings: CivicClerkMeeting[] = [];
  let url: string | undefined = civicClerkEventsUrl(options?.minYear);
  let pagesRead = 0;

  while (url) {
    if (pagesRead === MAX_PAGES) {
      throw new Error(`CivicClerk Events API was still paging after ${MAX_PAGES} pages`);
    }
    const response = await fetch(url, { headers: REQUEST_HEADERS });
    if (!response.ok) {
      throw new Error(`CivicClerk Events API returned ${response.status} for ${url}`);
    }
    const page = (await response.json()) as CivicClerkEventsPage;
    if (!Array.isArray(page.value)) {
      throw new Error(`CivicClerk Events API returned no event list for ${url}`);
    }
    pagesRead++;

    for (const event of page.value) {
      if (event.isDeleted) {
        console.log(`  Event ${event.id}: deleted in CivicClerk, not imported`);
        continue;
      }
      meetings.push(civicClerkEventToMeeting(event));
    }
    url = page['@odata.nextLink'];
  }

  console.log(`Read ${meetings.length} meetings from CivicClerk's Events API (${pagesRead} pages)`);
  return meetings.sort((a, b) => b.date.localeCompare(a.date));
}
