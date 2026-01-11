'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, FileText, Building2, Scale, BarChart3, Clock, ChevronDown, Gavel, X, Menu } from 'lucide-react';

export default function Header() {
  const [legislationDropdownOpen, setLegislationDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/timeline', label: 'Timeline', icon: Clock },
    { href: '/meetings', label: 'Meetings', icon: Calendar },
    { href: '/development', label: 'Development', icon: Building2 },
    { href: '/budget', label: 'Budget', icon: BarChart3 },
    { href: '/documents', label: 'Documents', icon: FileText },
  ];

  const legislationLinks = [
    { href: '/ordinances', label: 'Ordinances', icon: Scale, color: 'text-emerald-600' },
    { href: '/resolutions', label: 'Resolutions', icon: FileText, color: 'text-purple-600' },
  ];

  return (
    <header className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center border border-white/30">
              <span className="text-xl font-bold">FB</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Flowery Branch</h1>
              <p className="text-xs text-emerald-100">Informed Citizen Dashboard</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/timeline"
              className="flex items-center space-x-1 text-emerald-100 hover:text-white transition"
            >
              <Clock className="w-4 h-4" />
              <span>Timeline</span>
            </Link>
            <Link
              href="/meetings"
              className="flex items-center space-x-1 text-emerald-100 hover:text-white transition"
            >
              <Calendar className="w-4 h-4" />
              <span>Meetings</span>
            </Link>

            {/* Legislation Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setLegislationDropdownOpen(true)}
              onMouseLeave={() => setLegislationDropdownOpen(false)}
            >
              <button className="flex items-center space-x-1 text-emerald-100 hover:text-white transition py-2">
                <Gavel className="w-4 h-4" />
                <span>Legislation</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${legislationDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {legislationDropdownOpen && (
                <div className="absolute top-full left-0 pt-1 z-50">
                  <div className="w-40 bg-white rounded-lg shadow-lg py-1">
                    {legislationLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="flex items-center space-x-2 px-4 py-2 text-slate-700 hover:bg-emerald-50 transition"
                      >
                        <link.icon className={`w-4 h-4 ${link.color}`} />
                        <span>{link.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/development"
              className="flex items-center space-x-1 text-emerald-100 hover:text-white transition"
            >
              <Building2 className="w-4 h-4" />
              <span>Development</span>
            </Link>
            <Link
              href="/budget"
              className="flex items-center space-x-1 text-emerald-100 hover:text-white transition"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Budget</span>
            </Link>
            <Link
              href="/documents"
              className="flex items-center space-x-1 text-emerald-100 hover:text-white transition"
            >
              <FileText className="w-4 h-4" />
              <span>Documents</span>
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-emerald-100 hover:text-white hover:bg-emerald-600"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 border-t border-emerald-500/30 pt-4">
            <div className="flex flex-col space-y-1">
              {navLinks.slice(0, 2).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-600/50 transition"
                >
                  <link.icon className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              ))}

              {/* Legislation section */}
              <div className="px-3 py-2">
                <div className="flex items-center space-x-3 text-emerald-200 text-sm font-medium mb-1">
                  <Gavel className="w-4 h-4" />
                  <span>Legislation</span>
                </div>
                <div className="ml-7 flex flex-col space-y-1">
                  {legislationLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center space-x-2 px-3 py-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-600/50 transition"
                    >
                      <link.icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {navLinks.slice(2).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-600/50 transition"
                >
                  <link.icon className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
