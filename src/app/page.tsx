import { Database, Sparkles, Link2 } from 'lucide-react';
import CityUpdates from '@/components/CityUpdates';
import QuickLinks from '@/components/QuickLinks';

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section with How It Works */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-slate-900 mb-3">
          Stay Informed About Flowery Branch
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
          Understand what your local government is doing, why it matters, and how decisions
          connect over time — using only official, public information.
        </p>

        {/* Condensed How It Works */}
        <div className="flex flex-wrap justify-center items-center gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <Database className="w-4 h-4 text-emerald-600" />
            </div>
            <span>Collects public data</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">→</span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </div>
            <span>Summarizes in plain language</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">→</span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <Link2 className="w-4 h-4 text-emerald-600" />
            </div>
            <span>Links to official sources</span>
          </div>
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
