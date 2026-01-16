'use client';

import { createContext, useContext, useEffect, useMemo, useCallback, useSyncExternalStore, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'theme-preference';

// useSyncExternalStore subscriptions
function subscribeToNothing() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function getSystemThemeClient(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSystemThemeServer(): 'light' | 'dark' {
  return 'light';
}

function getStoredThemeClient(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored;
  }
  return 'system';
}

function getStoredThemeServer(): Theme {
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Use useSyncExternalStore to safely detect client-side mounting
  const isClient = useSyncExternalStore(subscribeToNothing, getClientSnapshot, getServerSnapshot);

  // Get initial values based on client/server
  const initialTheme = useSyncExternalStore(subscribeToNothing, getStoredThemeClient, getStoredThemeServer);
  const systemTheme = useSyncExternalStore(
    useCallback((callback: () => void) => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    }, []),
    getSystemThemeClient,
    getSystemThemeServer
  );

  // Track user-selected theme (can change from toggle)
  const [theme, setThemeInternal] = useState<Theme>(initialTheme);

  const resolvedTheme = useMemo(() => {
    return theme === 'system' ? systemTheme : theme;
  }, [theme, systemTheme]);

  // Apply theme class to document
  useEffect(() => {
    if (!isClient) return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme, isClient]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeInternal(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  // Prevent flash by not rendering until client-side
  if (!isClient) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
