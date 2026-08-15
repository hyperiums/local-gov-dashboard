import Link from 'next/link';
import { Info } from 'lucide-react';
import { operatorDisclosure } from '@/lib/city-config-client';

// The site aggregates one city's records and carries that city's name, so the
// default reading is that the city publishes it. This strip sits above the
// masthead on every page so the correction arrives before the impression does,
// while the reader is still deciding what they are looking at.
export default function DisclosureBar() {
  return (
    <div className="bg-slate-900 dark:bg-slate-950 text-slate-200 border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        {/* The icon is inline rather than a flex sibling so it never takes a
            line of its own on a narrow screen. */}
        <p className="text-xs sm:text-sm">
          <Info className="inline align-text-bottom w-4 h-4 mr-1.5 text-slate-400" aria-hidden="true" />
          {operatorDisclosure}{' '}
          <Link
            href="/about"
            data-umami-event="disclosure-about-click"
            className="underline underline-offset-2 text-emerald-300 hover:text-emerald-200 whitespace-nowrap"
          >
            About this site
          </Link>
        </p>
      </div>
    </div>
  );
}
