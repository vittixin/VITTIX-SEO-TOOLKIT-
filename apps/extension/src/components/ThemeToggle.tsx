import { useEffect, useState } from 'react';
import type { Settings } from '@vittix/shared';
import { getSettings, saveSettings } from '@/src/storage/settings';
import { t } from '@/src/i18n';

type Theme = Settings['theme'];

function applyTheme(theme: Theme) {
  localStorage.setItem('vittix-theme', theme);
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    void getSettings().then((settings) => {
      setTheme(settings.theme);
      applyTheme(settings.theme);
    });
  }, []);
  async function changeTheme(value: Theme) {
    setTheme(value);
    applyTheme(value);
    const current = await getSettings();
    await saveSettings({ ...current, theme: value });
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t('labelTheme')}</span>
      <select
        aria-label="Theme"
        value={theme}
        onChange={(event) => void changeTheme(event.target.value as Theme)}
      >
        {(['system', 'light', 'dark'] as const).map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}
