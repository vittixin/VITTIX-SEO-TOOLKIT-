import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { I18N_KEYS } from './i18n';

describe('English message catalog', () => {
  it('contains exactly the typed translation keys', () => {
    const messages = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'apps/extension/public/_locales/en/messages.json'),
        'utf8',
      ),
    ) as Record<string, { message: string }>;
    expect(Object.keys(messages).sort()).toEqual([...I18N_KEYS].sort());
    expect(Object.values(messages).every((entry) => entry.message.trim().length > 0)).toBe(true);
  });
});
