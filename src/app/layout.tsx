import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import DisclosureBar from "@/components/DisclosureBar";
import ContactEmail from "@/components/ContactEmail";
import { ThemeProvider } from "@/components/ThemeProvider";
import {
  cityName,
  cityLocation,
  siteUrl,
  civicClerkUrl,
  cityWebsiteUrl,
  municodeUrl,
  clearGovSpendingBaseUrl,
  contactEmail,
  operatorName,
  operatorDisclosure,
} from "@/lib/city-config-client";

const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// A tab, a search result, and a shared link are all read without the page in
// front of you, so none of them may lead with the city as publisher. Every one
// of them opens on "independent," and the descriptions carry the operator's
// name rather than an institutional voice.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `An Independent Civic Dashboard for ${cityLocation}`,
    template: `%s · Independent ${cityName} Civic Dashboard`,
  },
  description: `${operatorDisclosure} It gathers the city's public records in one place: meetings, ordinances, permits, and budget documents, each linked back to the official source.`,
  keywords: [cityName, "city council", "local government", "civic engagement", "transparency", "independent"],
  openGraph: {
    title: `An Independent Civic Dashboard for ${cityLocation}`,
    description: operatorDisclosure,
    siteName: `Independent ${cityName} Civic Dashboard`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `An Independent Civic Dashboard for ${cityLocation}`,
    description: operatorDisclosure,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 dark:bg-slate-900 min-h-screen`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <DisclosureBar />
          <Header />
          <main id="main-content">{children}</main>
          <footer className="bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 py-8 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid md:grid-cols-4 gap-8">
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">About This Dashboard</h3>
                  <p className="text-sm">
                    {operatorDisclosure} It makes {cityName} local government
                    understandable, not overwhelming. All data sourced from official public records.
                  </p>
                  <p className="text-sm mt-2">
                    <Link href="/about" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">
                      Who runs this site
                    </Link>
                  </p>
                </div>
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">Data Sources</h3>
                  <ul className="text-sm space-y-1">
                    <li><a href={civicClerkUrl} target="_blank" rel="noopener noreferrer" data-umami-event="source-click" data-umami-event-source="civicclerk" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">CivicClerk Portal</a></li>
                    <li><a href={cityWebsiteUrl} target="_blank" rel="noopener noreferrer" data-umami-event="source-click" data-umami-event-source="city-website" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">City Website</a></li>
                    <li><a href={municodeUrl} target="_blank" rel="noopener noreferrer" data-umami-event="source-click" data-umami-event-source="municode" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">Municode</a></li>
                    <li><a href={clearGovSpendingBaseUrl} target="_blank" rel="noopener noreferrer" data-umami-event="source-click" data-umami-event-source="cleargov" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">ClearGov</a></li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">Disclaimer</h3>
                  <p className="text-sm">
                    This is not an official city resource. AI-generated summaries are for
                    convenience only. Always verify information with official sources.
                  </p>
                  {umamiSrc && umamiWebsiteId && (
                    <p className="text-sm mt-2">
                      Page visits are counted with privacy-friendly, cookie-free analytics.
                      Nothing that identifies you is stored or shared.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">Contact</h3>
                  <p className="text-sm mb-2">
                    Notice an error or have a suggestion?
                  </p>
                  <ContactEmail email={contactEmail} />
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 mt-8 pt-6 text-center text-sm">
                <p>Made with care for the {cityName} community by {operatorName}</p>
              </div>
            </div>
          </footer>
          {umamiSrc && umamiWebsiteId && (
            <Script src={umamiSrc} data-website-id={umamiWebsiteId} strategy="afterInteractive" />
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
