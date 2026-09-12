import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'smartroad.theme';

const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [resolved, setResolved] = useState(() =>
    readStored() === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : readStored(),
  );

  useEffect(() => {
    const apply = () => {
      const next = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
      setResolved(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.style.colorScheme = next;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', next === 'dark' ? '#0b1220' : '#f5f7fa');
    };

    apply();
    if (theme !== 'system') return undefined;

    // Follow the OS while the user has not made an explicit choice.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Storage unavailable: the choice still applies for this session. */
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setTheme],
  );

  const value = useMemo(
    () => ({ theme, resolved, isDark: resolved === 'dark', setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
