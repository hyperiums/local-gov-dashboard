'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, FileText, Building2, Scale, BarChart3, Clock, ChevronDown, Gavel, X, Menu } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export default function Header() {
  const [legislationDropdownOpen, setLegislationDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);

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

  // Handle keyboard navigation for dropdown
  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setLegislationDropdownOpen(false);
      dropdownButtonRef.current?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setLegislationDropdownOpen(!legislationDropdownOpen);
    } else if (e.key === 'ArrowDown' && legislationDropdownOpen) {
      e.preventDefault();
      const firstLink = dropdownRef.current?.querySelector('a');
      firstLink?.focus();
    }
  };

  // Handle arrow key navigation within dropdown
  const handleDropdownItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Escape') {
      setLegislationDropdownOpen(false);
      dropdownButtonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const links = dropdownRef.current?.querySelectorAll('a');
      if (links && index < links.length - 1) {
        (links[index + 1] as HTMLElement).focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const links = dropdownRef.current?.querySelectorAll('a');
      if (links && index > 0) {
        (links[index - 1] as HTMLElement).focus();
      } else {
        dropdownButtonRef.current?.focus();
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLegislationDropdownOpen(false);
      }
    };

    if (legislationDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [legislationDropdownOpen]);

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
              <span className="text-lg font-semibold block">Flowery Branch</span>
              <span className="text-xs text-emerald-100">Informed Citizen Dashboard</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6" aria-label="Main navigation">
            <Link
              href="/timeline"
              className="flex items-center space-x-1 text-white hover:text-white/80 transition"
            >
              <Clock className="w-4 h-4" />
              <span>Timeline</span>
            </Link>
            <Link
              href="/meetings"
              className="flex items-center space-x-1 text-white hover:text-white/80 transition"
            >
              <Calendar className="w-4 h-4" />
              <span>Meetings</span>
            </Link>

            {/* Legislation Dropdown */}
            <div
              className="relative"
              ref={dropdownRef}
              onMouseEnter={() => setLegislationDropdownOpen(true)}
              onMouseLeave={() => setLegislationDropdownOpen(false)}
            >
              <button
                ref={dropdownButtonRef}
                onClick={() => setLegislationDropdownOpen(!legislationDropdownOpen)}
                onKeyDown={handleDropdownKeyDown}
                aria-expanded={legislationDropdownOpen}
                aria-haspopup="true"
                className="flex items-center space-x-1 text-white hover:text-white/80 transition py-2"
              >
                <Gavel className="w-4 h-4" />
                <span>Legislation</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${legislationDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {legislationDropdownOpen && (
                <div className="absolute top-full left-0 pt-1 z-50" role="menu">
                  <div className="w-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg py-1">
                    {legislationLinks.map((link, index) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        role="menuitem"
                        onKeyDown={(e) => handleDropdownItemKeyDown(e, index)}
                        className="flex items-center space-x-2 px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-700 transition"
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
              className="flex items-center space-x-1 text-white hover:text-white/80 transition"
            >
              <Building2 className="w-4 h-4" />
              <span>Development</span>
            </Link>
            <Link
              href="/budget"
              className="flex items-center space-x-1 text-white hover:text-white/80 transition"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Budget</span>
            </Link>
            <Link
              href="/documents"
              className="flex items-center space-x-1 text-white hover:text-white/80 transition"
            >
              <FileText className="w-4 h-4" />
              <span>Documents</span>
            </Link>

            {/* Theme Toggle */}
            <div className="ml-2 bg-white/10 rounded-lg">
              <ThemeToggle />
            </div>
          </nav>

          {/* Mobile menu button */}
          <div className="flex items-center space-x-2 md:hidden">
            <div className="bg-white/10 rounded-lg">
              <ThemeToggle />
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="p-2 rounded-md text-white hover:bg-emerald-600"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 border-t border-emerald-500/30 pt-4" aria-label="Mobile navigation">
            <div className="flex flex-col space-y-1">
              {navLinks.slice(0, 2).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg text-white hover:bg-emerald-600/50 transition"
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
                      className="flex items-center space-x-2 px-3 py-1.5 rounded-lg text-white hover:bg-emerald-600/50 transition"
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
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg text-white hover:bg-emerald-600/50 transition"
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
