import { getCityUpdatesData, type RecentDecision, type PendingLegislation } from '@/lib/cityUpdates';

export type { RecentDecision, PendingLegislation };

export type CityUpdatesData = ReturnType<typeof getCityUpdatesData>;
export type NextMeeting = NonNullable<CityUpdatesData['nextMeeting']>;
export type MonthlyStats = NonNullable<CityUpdatesData['monthlyStats']>;
export type Freshness = CityUpdatesData['freshness'];
