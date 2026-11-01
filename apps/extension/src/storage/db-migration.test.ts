import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { VittixDatabase, db } from './db';
import { buildSnapshot } from '../../../../packages/seo-core/src/testing/fixtures.js';
import { analyzeSnapshot } from '@vittix/seo-core';
import { DEFAULT_SETTINGS } from '@vittix/shared';
import { clearAllLocalData, getAudit, pruneAudits } from './audits';
import { getSettings, saveSettings } from './settings';

const openDatabases: VittixDatabase[] = [];

afterEach(async () => {
  db.close();
  await db.delete();
  await Promise.all(
    openDatabases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

describe('Dexie v3 → current migration', () => {
  it('preserves legacy audit and keyword rows and creates current origin settings store', async () => {
    const name = `vittix-migration-${Date.now()}-${Math.random()}`;
    const previous = new VittixDatabase(name, 3);
    openDatabases.push(previous);
    await previous.open();
    const auditId = await previous.audits.add({
      url: 'https://legacy.example/page',
      title: 'Legacy title',
      analyzedAt: '2026-10-31T00:00:00.000Z',
      ruleSetVersion: '0.5.0',
      profileId: 'standard',
      snapshot: {} as never,
      result: {} as never,
    });
    await previous.targetKeywords.put({
      url: 'https://legacy.example/page',
      keyword: 'legacy phrase',
    });
    previous.close();

    const upgraded = new VittixDatabase(name);
    openDatabases.push(upgraded);
    await upgraded.open();
    expect(upgraded.verno).toBe(6);
    expect((await upgraded.audits.get(auditId))?.title).toBe('Legacy title');
    expect((await upgraded.targetKeywords.get('https://legacy.example/page'))?.keyword).toBe(
      'legacy phrase',
    );

    const originRow = {
      origin: 'https://legacy.example',
      profileId: 'standard' as const,
      ignoredRuleIds: [],
      unignoredRuleIds: [],
      severityOverrides: {},
    };
    await upgraded.originRuleSettings.put(originRow);
    expect(await upgraded.originRuleSettings.get(originRow.origin)).toEqual(originRow);
  });
});

describe('oldest supported Dexie v1 → current migration', () => {
  it('preserves legacy rows while adding every current store', async () => {
    const name = `vittix-oldest-${Date.now()}-${Math.random()}`;
    const previous = new VittixDatabase(name, 1);
    openDatabases.push(previous);
    await previous.open();
    const auditId = await previous.audits.add({
      url: 'https://v1.example/',
      title: 'V1 legacy row',
      analyzedAt: '2020-01-01T00:00:00.000Z',
      ruleSetVersion: '0.1.0',
      snapshot: { schemaVersion: 1, url: 'https://v1.example/', title: 'Legacy' },
      result: { findings: [], score: { total: 80 } },
    } as never);
    await previous.settings.put({ key: 'legacy-setting', value: { kept: true } });
    previous.close();

    const current = new VittixDatabase(name);
    openDatabases.push(current);
    await current.open();
    expect(current.verno).toBe(6);
    expect((await current.audits.get(auditId))?.title).toBe('V1 legacy row');
    expect(await current.settings.get('legacy-setting')).toEqual({
      key: 'legacy-setting',
      value: { kept: true },
    });
    await current.targetKeywords.put({ url: 'https://v1.example/', keyword: 'survives' });
    await current.originRuleSettings.put({
      origin: 'https://v1.example',
      profileId: 'standard',
      ignoredRuleIds: [],
      unignoredRuleIds: [],
      severityOverrides: {},
    });
    expect(await current.targetKeywords.get('https://v1.example/')).toBeDefined();
    expect(await current.originRuleSettings.get('https://v1.example')).toBeDefined();
  });
});

describe('Dexie v4 → v5 response-metadata migration', () => {
  it('preserves legacy site pages and validates new fields with safe defaults', async () => {
    const name = `vittix-response-migration-${Date.now()}-${Math.random()}`;
    const previous = new VittixDatabase(name, 4);
    openDatabases.push(previous);
    await previous.open();
    const pageId = await previous.sitePages.add({
      sessionId: 1,
      url: 'https://legacy.example/page',
      finalUrl: 'https://legacy.example/page',
      status: 'ok',
      depth: 0,
      httpStatus: 200,
      snapshot: { schemaVersion: 5 },
      result: { findings: [], score: { total: 80 } },
    } as never);
    previous.close();

    const upgraded = new VittixDatabase(name);
    openDatabases.push(upgraded);
    await upgraded.open();
    expect(upgraded.verno).toBe(6);
    const stored = await upgraded.sitePages.get(pageId);
    expect(stored?.url).toBe('https://legacy.example/page');
    const validated = (await import('@vittix/shared')).SitePageRecordSchema.parse(stored);
    expect(validated.responseMetadata).toBeNull();
    expect(validated.responseFindings).toEqual([]);
  });
});

describe('Dexie v5 → v6 sitemap migration', () => {
  it('preserves legacy site records and supplies empty sitemap defaults', async () => {
    const name = `vittix-sitemap-migration-${Date.now()}-${Math.random()}`;
    const previous = new VittixDatabase(name, 5);
    openDatabases.push(previous);
    await previous.open();
    const id = await previous.siteAudits.add({
      origin: 'https://legacy.example',
      status: 'completed',
      startedAt: '2025-01-01T00:00:00Z',
      maxPages: 20,
      maxDepth: 2,
      concurrency: 2,
      delayMs: 250,
    } as never);
    const pageId = await previous.sitePages.add({
      sessionId: id,
      url: 'https://legacy.example/',
      status: 'ok',
      depth: 0,
    } as never);
    previous.close();
    const current = new VittixDatabase(name);
    openDatabases.push(current);
    await current.open();
    expect(current.verno).toBe(6);
    expect((await current.sitePages.get(pageId))?.url).toBe('https://legacy.example/');
    const { SiteSessionSchema } = await import('@vittix/shared');
    expect(SiteSessionSchema.parse(await current.siteAudits.get(id))).toMatchObject({
      sitemap: { entries: [], fullyRead: false },
      seedFromSitemap: false,
    });
  });
});

function storedAudit(url: string, analyzedAt = new Date().toISOString()) {
  const snapshot = buildSnapshot({
    textSummary: {
      sentenceCount: 2,
      paragraphCount: 1,
      keywords: [],
      sampleHash: '0'.repeat(16),
      syllableCount: 8,
      leadText: 'A private local excerpt used by retention tests.',
    },
  });
  const result = analyzeSnapshot(snapshot);
  return {
    url,
    title: snapshot.title,
    analyzedAt,
    ruleSetVersion: result.ruleSetVersion,
    profileId: 'standard' as const,
    snapshot,
    result,
  };
}

const savedBranding = {
  agencyName: 'Local Studio',
  accentColor: '#3157d5',
  logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
};

describe('stored sensitive export data housekeeping', () => {
  it('clear all data removes audits, excerpts, target keywords, site data and branding image', async () => {
    await db.open();
    const url = 'https://clear.example/page';
    const id = await db.audits.add(storedAudit(url));
    await db.targetKeywords.put({ url, keyword: 'private keyword' });
    await db.settings.put({
      key: 'app-settings',
      value: { ...DEFAULT_SETTINGS, exportBranding: savedBranding },
    });
    await db.siteAudits.add({
      origin: 'https://clear.example',
      status: 'completed',
      startedAt: new Date().toISOString(),
      maxPages: 20,
      maxDepth: 2,
      concurrency: 2,
      delayMs: 250,
    });
    await db.originRuleSettings.put({
      origin: 'https://clear.example',
      profileId: 'standard',
      ignoredRuleIds: [],
      unignoredRuleIds: [],
      severityOverrides: {},
    });

    await clearAllLocalData();

    expect(await getAudit(id!)).toBeNull();
    expect(await db.targetKeywords.count()).toBe(0);
    expect(await db.siteAudits.count()).toBe(0);
    expect(await db.sitePages.count()).toBe(0);
    expect(await db.originRuleSettings.count()).toBe(0);
    expect((await getSettings()).exportBranding.logoDataUri).toBeNull();
  });

  it('retention pruning removes pruned excerpts, orphan keywords and stored logo data', async () => {
    await db.open();
    const url = 'https://prune.example/page';
    const id = await db.audits.add(storedAudit(url, '2020-01-01T00:00:00.000Z'));
    await db.targetKeywords.put({ url, keyword: 'private keyword' });
    await saveSettings({ ...DEFAULT_SETTINGS, exportBranding: savedBranding });

    await pruneAudits({ ...DEFAULT_SETTINGS, historyRetentionDays: 1 });

    expect(await getAudit(id!)).toBeNull();
    expect(await db.targetKeywords.get(url)).toBeUndefined();
    expect((await getSettings()).exportBranding.logoDataUri).toBeNull();
  });
});
