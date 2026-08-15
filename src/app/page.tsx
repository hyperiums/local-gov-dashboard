import Link from 'next/link';
import CityUpdates from '@/components/city-updates';
import QuickLinks from '@/components/QuickLinks';
import {
  cityName,
  cityAddress,
  cityPhone,
  meetingSchedule,
} from '@/lib/city-config-client';

// CityUpdates reads civic data from SQLite at render time. Without this, Next.js
// statically renders the home page at build, so scraper DB updates don't appear
// until the image is rebuilt. force-dynamic keeps the landing page live.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section with How It Works */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
          Stay Informed About {cityName}
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-4">
          Understand what your local government is doing, why it matters, and how decisions
          connect over time — using only official, public information.
        </p>

        {/* The homepage is where someone decides how much to trust what follows,
            so the two caveats that matter most are stated here rather than left
            to the per-item badges further down the page. */}
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-8">
          Records are collected automatically, and the summaries are written by a language model.
          Check the official source before you rely on one.{' '}
          <Link href="/about" className="underline hover:text-slate-700 dark:hover:text-slate-300">
            How this site works
          </Link>
        </p>

        {/* Meeting Info Banner */}
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-6 max-w-lg mx-auto">
          <p className="text-emerald-800 dark:text-emerald-300 font-medium text-sm sm:text-base">
            City Council meets {meetingSchedule}
          </p>
          <p className="text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm mt-1">
            City Hall, {cityAddress} &bull; <a href={`tel:${cityPhone}`} className="underline hover:text-emerald-800 dark:hover:text-emerald-300">{cityPhone}</a>
          </p>
        </div>
      </div>

      {/* City Updates - The main content */}
      <div className="mb-8">
        <CityUpdates />
      </div>

      {/* Official Sources */}
      <QuickLinks />
    </div>
  );
}
