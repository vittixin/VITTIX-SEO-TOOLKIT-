// @ts-check
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

/**
 * Workspace lint rules.
 *
 * Architecture boundary enforced here (dependency direction extension -> seo-core -> shared):
 * - packages/shared and packages/seo-core must stay free of React, Chrome/WXT APIs and Dexie.
 * - packages/shared additionally must not depend on other workspace packages.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/dist/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'apps/extension/public/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // seo-core and shared are platform-independent packages.
    files: ['packages/seo-core/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'This package must stay UI-free.' },
            { name: 'react-dom', message: 'This package must stay UI-free.' },
            { name: 'dexie', message: 'Persistence lives in apps/extension.' },
            { name: 'wxt/browser', message: 'Browser APIs live in apps/extension.' },
          ],
          patterns: [
            {
              group: ['wxt/*', '@wxt-dev/*', 'chrome', '@vittix/extension*'],
              message: 'This package must not depend on the browser or the extension app.',
            },
          ],
        },
      ],
    },
  },
  {
    // shared is the bottom of the dependency graph.
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'This package must stay UI-free.' },
            { name: 'react-dom', message: 'This package must stay UI-free.' },
            { name: 'dexie', message: 'Persistence lives in apps/extension.' },
            { name: 'wxt/browser', message: 'Browser APIs live in apps/extension.' },
          ],
          patterns: [
            {
              group: ['wxt/*', '@wxt-dev/*', 'chrome', '@vittix/*'],
              message: '@vittix/shared must not depend on other workspace packages.',
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
);
