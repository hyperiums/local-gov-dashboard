'use client';

import { Suspense } from 'react';
import MeetingsLoading from './MeetingsLoading';
import MeetingsContent from './MeetingsContent';

export default function MeetingsPage() {
  return (
    <Suspense fallback={<MeetingsLoading />}>
      <MeetingsContent />
    </Suspense>
  );
}
