export interface Meeting {
  id: string;
  date: string;
  title: string;
  location?: string;
  status: string;
  agenda_url?: string;
  minutes_url?: string;
  packet_url?: string;
  summary?: string;
  agenda_summary?: string;
  minutes_summary?: string;
}

export interface OrdinanceWithAction {
  id: string;
  number: string;
  title: string;
  action: string | null;
  municode_url: string | null;
}

export interface ResolutionWithMeeting {
  id: string;
  number: string;
  title: string;
  status: string;
  summary: string | null;
  adopted_date: string | null;
}
