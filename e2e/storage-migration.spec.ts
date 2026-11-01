import { expect, test } from '@playwright/test';
import { extensionPageUrl, launchExtensionContext } from './helpers/extension';

test('upgrades an existing Dexie v2 database with target keyword and origin settings stores', async () => {
  const { context, extensionId } = await launchExtensionContext('e2e', []);
  try {
    const page = await context.newPage();
    await page.goto(extensionPageUrl(extensionId, 'manifest.json'));
    const databaseName = `vittix-seo-migration-${Date.now()}`;
    await page.evaluate(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(name, 2);
          request.onupgradeneeded = () => {
            const database = request.result;
            const audits = database.createObjectStore('audits', {
              keyPath: 'id',
              autoIncrement: true,
            });
            audits.createIndex('url', 'url');
            audits.createIndex('analyzedAt', 'analyzedAt');
            database.createObjectStore('settings', { keyPath: 'key' });
            database.createObjectStore('siteAudits', { keyPath: 'id', autoIncrement: true });
            database.createObjectStore('sitePages', { keyPath: 'id', autoIncrement: true });
          };
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('audits', 'readwrite');
            transaction
              .objectStore('audits')
              .add({ url: 'https://legacy.example/', analyzedAt: 'old', title: 'legacy' });
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
          };
          request.onerror = () => reject(request.error);
        }),
      databaseName,
    );

    // Apply the same additive v3/v4 stores over the existing v2 data.
    const upgraded = await page.evaluate(
      (name) =>
        new Promise<{ names: string[]; version: number; legacy: unknown }>((resolve, reject) => {
          const request = indexedDB.open(name, 4);
          request.onupgradeneeded = () => {
            request.result.createObjectStore('targetKeywords', { keyPath: 'url' });
            request.result.createObjectStore('originRuleSettings', { keyPath: 'origin' });
          };
          request.onsuccess = () => {
            const database = request.result;
            const names = [...database.objectStoreNames];
            const version = database.version;
            const read = database.transaction('audits').objectStore('audits').get(1);
            read.onsuccess = () => {
              database.close();
              resolve({ names, version, legacy: read.result });
            };
            read.onerror = () => reject(read.error);
          };
          request.onerror = () => reject(request.error);
        }),
      databaseName,
    );
    expect(upgraded.version).toBe(4);
    expect(upgraded.names).toContain('targetKeywords');
    expect(upgraded.names).toContain('originRuleSettings');
    expect(upgraded.legacy).toMatchObject({ title: 'legacy', url: 'https://legacy.example/' });
  } finally {
    await context.close();
  }
});
