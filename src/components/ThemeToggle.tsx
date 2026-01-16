'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const currentIndex = order.indexOf(theme);
    const nextTheme = order[(currentIndex + 1) % order.length];
    setTheme(nextTheme);
  };

  const getAriaLabel = () => {
    switch (theme) {
      case 'system':
        return `Theme: System (${resolvedTheme}). Click to switch to light mode.`;
      case 'light':
        return 'Theme: Light. Click to switch to dark mode.';
      case 'dark':
        return 'Theme: Dark. Click to switch to system preference.';
    }
  };

  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <button
      onClick={cycleTheme}
      aria-label={getAriaLabel()}
      className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
