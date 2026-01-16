import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import ContactEmail from "@/components/ContactEmail";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flowery Branch Informed Citizen Dashboard",
  description: "Stay informed about what your local government is doing in Flowery Branch, Georgia. Track meetings, ordinances, permits, and more.",
  keywords: ["Flowery Branch", "Georgia", "city council", "local government", "civic engagement", "transparency"],
  openGraph: {
    title: "Flowery Branch Informed Citizen Dashboard",
    description: "Making local government understandable, not overwhelming.",
    type: "website",
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
          <Header />
          <main id="main-content">{children}</main>
          <footer className="bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 py-8 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid md:grid-cols-4 gap-8">
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">About This Dashboard</h3>
                  <p className="text-sm">
                    An independent civic project making Flowery Branch local government
                    understandable, not overwhelming. All data sourced from official public records.
                  </p>
                </div>
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">Data Sources</h3>
                  <ul className="text-sm space-y-1">
                    <li><a href="https://flowerybranchga.portal.civicclerk.com" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">CivicClerk Portal</a></li>
                    <li><a href="https://www.flowerybranchga.org" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">City Website</a></li>
                    <li><a href="https://library.municode.com/ga/flowery_branch" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">Municode</a></li>
                    <li><a href="https://cleargov.com/georgia/hall/city/flowery-branch" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline">ClearGov</a></li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">Disclaimer</h3>
                  <p className="text-sm">
                    This is not an official city resource. AI-generated summaries are for
                    convenience only. Always verify information with official sources.
                  </p>
                </div>
                <div>
                  <h3 className="text-slate-800 dark:text-slate-200 font-semibold mb-3">Contact</h3>
                  <p className="text-sm mb-2">
                    Notice an error or have a suggestion?
                  </p>
                  <ContactEmail />
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 mt-8 pt-6 text-center text-sm">
                <p>Made with care for the Flowery Branch community</p>
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
