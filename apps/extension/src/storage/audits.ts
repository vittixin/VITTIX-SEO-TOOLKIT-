import type { AuditRecord, AuditSummary, NewAuditRecord, Settings } from '@vittix/shared';
import {
  AuditRecordSchema,
  DEFAULT_EXPORT_BRANDING,
  countSeverities,
  SETTINGS_KEY,
} from '@vittix/shared';
import { db } from './db';
import { getSettings, saveSettings } from './settings';

/**
 * Rows are validated at the read boundary: malformed or corrupt entries
 * (e.g. from an interrupted write or a future schema) are skipped with a
 * console warning instead of crashing the UI. Legacy v1 snapshots remain
 * readable because the schema accepts versions 1 and 2.
 */
export function validateAuditRow(row: unknown, context: string): AuditRecord | null {
  const parsed = AuditRecordSchema.safeParse(row);
  if (parsed.success) return parsed.data;
  console.warn(
    `[vittix] skipping malformed audit record (${context}):`,
    parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; '),
  );
  return null;
}

function toSummary(audit: AuditRecord): AuditSummary {
  return {
    id: audit.id ?? -1,
    url: audit.url,
    title: audit.title,
    analyzedAt: audit.analyzedAt,
    score: audit.result.score,
    counts: countSeverities(audit.result.findings),
  };
}

export async function saveAudit(record: NewAuditRecord): Promise<number> {
  const id = await db.audits.add(record as AuditRecord);
  return id as number;
}

export async function getAudit(id: number): Promise<AuditRecord | null> {
  const row = await db.audits.get(id);
  return row === undefined ? null : (validateAuditRow(row, `id ${id}`) ?? null);
}

export async function getLatestAudit(): Promise<AuditRecord | null> {
  const [latest] = await db.audits.orderBy('analyzedAt').reverse().limit(1).toArray();
  return latest === undefined ? null : (validateAuditRow(latest, 'latest') ?? null);
}

/**
 * The most recent earlier audit of the same URL, for the dashboard's
 * side-by-side comparison. Returns null when no earlier run exists.
 */
export async function getPreviousAudit(
  url: string,
  analyzedAt: string,
): Promise<AuditRecord | null> {
  const rows = await db.audits
    .where('url')
    .equals(url)
    .and((row) => row.analyzedAt < analyzedAt)
    .reverse()
    .sortBy('analyzedAt');
  const previous = rows[0];
  return previous === undefined ? null : (validateAuditRow(previous, 'previous') ?? null);
}

export async function listAuditSummaries(limit = 200): Promise<AuditSummary[]> {
  const rows = await db.audits.orderBy('analyzedAt').reverse().limit(limit).toArray();
  return rows
    .map((row) => validateAuditRow(row, 'list'))
    .filter((row): row is AuditRecord => row !== null)
    .map(toSummary);
}

export async function deleteAudit(id: number): Promise<void> {
  const audit = await db.audits.get(id);
  await db.audits.delete(id);
  if (audit && !(await db.audits.where('url').equals(audit.url).count()))
    await db.targetKeywords.delete(audit.url);
}

export async function clearAllAudits(): Promise<void> {
  await db.audits.clear();
}

/** Wipe user analysis data while preserving retention preferences and resetting branding. */
export async function clearAllLocalData(): Promise<void> {
  const settings = await getSettings();
  await db.transaction(
    'rw',
    [db.audits, db.siteAudits, db.sitePages, db.targetKeywords, db.originRuleSettings, db.settings],
    async () => {
      await Promise.all([
        db.audits.clear(),
        db.sitePages.clear(),
        db.siteAudits.clear(),
        db.targetKeywords.clear(),
        db.originRuleSettings.clear(),
      ]);
      await db.settings.put({
        key: SETTINGS_KEY,
        value: { ...settings, exportBranding: DEFAULT_EXPORT_BRANDING },
      });
    },
  );
}

/**
 * Retention: delete audits older than the configured window, then cap the
 * total count (oldest pruned first). ISO timestamps compare correctly as
 * strings. Best-effort — failures are swallowed by callers.
 */
export async function pruneAudits(settings: Settings): Promise<void> {
  const countBefore = await db.audits.count();
  if (settings.historyRetentionDays > 0) {
    const cutoffIso = new Date(
      Date.now() - settings.historyRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    await db.audits.where('analyzedAt').below(cutoffIso).delete();
  }

  const count = await db.audits.count();
  if (count > settings.maxStoredAudits) {
    const excess = count - settings.maxStoredAudits;
    const oldestKeys = await db.audits.orderBy('analyzedAt').limit(excess).primaryKeys();
    await db.audits.bulkDelete(oldestKeys);
  }

  if ((await db.audits.count()) < countBefore) {
    const rows = await db.audits.toArray();
    const retainedUrls = new Set(rows.map((row) => row.url));
    const keywords = await db.targetKeywords.toArray();
    await db.targetKeywords.bulkDelete(
      keywords.filter((row) => !retainedUrls.has(row.url)).map((row) => row.url),
    );
    const current = await getSettings();
    if (current.exportBranding.logoDataUri !== null)
      await saveSettings({
        ...current,
        exportBranding: { ...current.exportBranding, logoDataUri: null },
      });
  }
}
