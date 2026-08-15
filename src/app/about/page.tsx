import type { Metadata } from 'next';
import QuickLinks from '@/components/QuickLinks';
import ContactEmail from '@/components/ContactEmail';
import { getOperatorAboutHtml } from '@/lib/operator-about';
import { cityName, contactEmail, operatorName, repoUrl } from '@/lib/city-config-client';

export const metadata: Metadata = {
  title: 'About this site',
  description: `Who runs this ${cityName} civic dashboard, where the information comes from, and why it is not a city website.`,
};

// Two kinds of content share this page, and the split is the point.
//
// The disclosures below are properties of the software: the city didn't publish
// it, the collection is automated, the summaries are machine-written, the
// originals govern. They are true of every deployment, so they live in code
// where a fork can't drop them by editing text.
//
// Who the operator is, why they built it, and what conflicts they carry are
// properties of the person. Those come from content/about.md, so adopting this
// project for another city never means editing a component to remove somebody
// else's biography.
export default function AboutPage() {
  const operatorAbout = getOperatorAboutHtml();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-6">About this site</h1>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <p className="text-lg text-slate-800 dark:text-slate-200">
          <strong>This is not a City of {cityName} website.</strong> The city did not build it,
          does not run it, and has not reviewed anything on it. It is built and maintained by{' '}
          {operatorName}.
        </p>
        <p className="text-lg text-slate-800 dark:text-slate-200 mt-4">
          It also runs mostly on its own. Records are collected automatically, and the summaries
          are written by a language model, so treat what you read here as a shortcut to the
          official record rather than a replacement for it.
        </p>
      </div>

      <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
        <div dangerouslySetInnerHTML={{ __html: operatorAbout }} />

        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">What it is, and what it isn&apos;t</h2>
          <p className="mb-3">
            Everything here comes from public records the city or its vendors already publish, and
            every item links back to where it came from. Those originals are the source of truth.
            When this site and an official record disagree, the official record is right.
          </p>
          <p>
            Nothing here is an official notice, and nothing here has been reviewed or approved by
            the city. For a deadline, a hearing date, or anything with legal weight, use the city&apos;s
            own sources. They&apos;re linked at the bottom of this page and on every page of this site.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">How the summaries are made</h2>
          <p className="mb-3">
            They&apos;re written by a language model. A scheduled job collects new records, and the
            plain-language summaries on the meetings, ordinances, permits, and budget pages are
            generated from those documents without anyone reading them first.
          </p>
          <p className="mb-3">
            Models are very good at sounding confident, which is risky in a civic context, so the
            instructions are deliberately conservative: summarize only what&apos;s explicitly stated, say
            &ldquo;not visible&rdquo; or &ldquo;not specified&rdquo; when something isn&apos;t clear, never infer intent, and
            never approximate numbers. You can read those rules yourself, since{' '}
            <a
              href={`${repoUrl}/tree/main/src/lib/prompts`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              they are open source
            </a>
            .
          </p>
          <p>
            That helps. It isn&apos;t the same as being right. Treat every summary here as a pointer to
            the real document, and read that document before you act on it, quote it, or repeat it
            at a meeting.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">Reporting an error</h2>
          <p className="mb-3">
            A wrong date, a summary that misreads a document, a link that goes somewhere it
            shouldn&apos;t. Say what page you were on and what looked off.
          </p>
          <div className="mb-3">
            <ContactEmail email={contactEmail} />
          </div>
          <p>
            The whole thing is{' '}
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              open source
            </a>
            , so you can see exactly how the information is collected and summarized, disagree with
            any of it, or run it for your own city.
          </p>
        </section>

        <div className="mt-8">
          <QuickLinks />
        </div>
      </div>
    </div>
  );
}
