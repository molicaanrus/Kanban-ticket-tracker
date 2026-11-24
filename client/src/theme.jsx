import { useEffect, useState } from 'react';

const KEY = 'tt.theme';

// Light or dark look. Stored only as a per-browser convenience (not data).
export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* storage may be unavailable */ }
  return 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}

export function ThemeToggle({ className = 'btn small' }) {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" className={className} onClick={toggle} aria-label="Switch colour theme">
      {theme === 'dark' ? '☀ Light theme' : '☾ Dark theme'}
    </button>
  );
}

// Always visible switch for the header: sun on the left, moon on the right, the thumb slides to the active one.
export function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button" role="switch" aria-checked={dark}
      className={`theme-switch ${dark ? 'is-dark' : ''}`}
      onClick={toggle}
      aria-label="Dark theme" title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span className="theme-thumb" aria-hidden="true" />
      <svg className="ts-icon ts-sun" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className="ts-icon ts-moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
