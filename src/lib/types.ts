// Core data types for Flowery Branch Civic Dashboard

export interface Meeting {
  id: string;
  date: string; // ISO date
  title: string;
  type: 'city_council' | 'planning' | 'other';
  location: string;
  agendaUrl?: string;
  minutesUrl?: string;
  packetUrl?: string;
  status: 'upcoming' | 'past';
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  orderNum: number;
  title: string;
  description?: string;
  type: 'ordinance' | 'resolution' | 'public_hearing' | 'new_business' | 'report' | 'other';
  referenceNumber?: string; // e.g., "Ordinance 772", "Resolution 25-013"
  attachments: Attachment[];
  outcome?: 'approved' | 'denied' | 'tabled' | 'discussed' | 'pending';
  summary?: string;
}

export interface Attachment {
  id: string;
  itemId: string;
  name: string;
  url: string;
  type: 'pdf' | 'image' | 'other';
}

export interface Permit {
  id: string;
  month: string; // YYYY-MM
  type: 'residential' | 'commercial' | 'other';
  address?: string;
  description?: string;
  value?: number;
  sourceUrl: string;
  createdAt: string;
}

export interface Business {
  id: string;
  month: string; // YYYY-MM
  name: string;
  address?: string;
  type?: string;
  sourceUrl: string;
  createdAt: string;
}

export interface Ordinance {
  id: string;
  number: string; // e.g., "772"
  title: string;
  description?: string;
  status: 'proposed' | 'first_reading' | 'second_reading' | 'adopted' | 'rejected';
  introducedDate?: string;
  adoptedDate?: string;
  municodeUrl?: string;
  meetingIds: string[]; // Track which meetings discussed this
  summary?: string;
}

export interface FinancialReport {
  id: string;
  fiscalYear: string;
  type: 'budget' | 'audit' | 'monthly';
  title: string;
  url: string;
  summary?: string;
  createdAt: string;
}

// Dashboard display types
export interface WeekSummary {
  weekOf: string;
  meetings: MeetingSummary[];
  newOrdinances: OrdinanceSummary[];
  newBusinesses: number;
  permitsIssued: number;
  highlights: string[];
}

export interface MeetingSummary {
  id: string;
  date: string;
  title: string;
  keyDecisions: string[];
  upcomingItems?: string[];
}

export interface OrdinanceSummary {
  number: string;
  title: string;
  status: string;
  whatItMeans: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: 'meeting' | 'ordinance' | 'permit' | 'business' | 'budget';
  title: string;
  description: string;
  relatedIds?: string[];
  sourceUrl?: string;
}

// Data source configuration
export const DATA_SOURCES = {
  civicClerk: {
    baseUrl: 'https://flowerybranchga.portal.civicclerk.com',
    eventUrl: (id: number) => `https://flowerybranchga.portal.civicclerk.com/event/${id}/files`,
  },
  cityWebsite: {
    baseUrl: 'https://www.flowerybranchga.org',
    permits: (month: string, year: string) =>
      `https://www.flowerybranchga.org/${month}${year}permitlisting.pdf`,
    business: (month: string, year: string) =>
      `https://www.flowerybranchga.org/${month}${year}businesslisting.pdf`,
    financialReports: 'https://www.flowerybranchga.org/departments/finance/financial_reports.php',
    splostReports: 'https://www.flowerybranchga.org/departments/finance/splost_reports.php',
    publicNotices: 'https://www.flowerybranchga.org/government/public_notices/index.php',
    strategicPlan: 'https://www.flowerybranchga.org/departments/finance/fy2025_strategic_plan.php',
    waterQualityReports: 'https://www.flowerybranchga.org/departments/water__wastewater/water_quality_reports.php',
  },
  municode: {
    baseUrl: 'https://library.municode.com/ga/flowery_branch/codes/code_of_ordinances',
  },
  clearGov: {
    budget: 'https://city-flowery-branch-ga-budget-book.cleargov.com/5302/introduction/transmittal-letter',
    spending: 'https://cleargov.com/georgia/hall/city/flowery-branch/2025/native/expenditures',
  },
} as const;
