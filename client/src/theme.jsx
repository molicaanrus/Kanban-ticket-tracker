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
