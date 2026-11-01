import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { VittixDatabase } from './db';

const openDatabases: VittixDatabase[] = [];

afterEach(async () => {
  await Promise.all(
    openDatabases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

describe('Dexie v3 → v4 migration', () => {
  it('preserves legacy audit and keyword rows and creates the production origin settings store', async () => {
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
    expect(upgraded.verno).toBe(4);
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
