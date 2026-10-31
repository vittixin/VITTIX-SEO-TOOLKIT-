import { useCallback, useEffect, useState } from 'react';
import type { AuditRecord, AuditSummary } from '@vittix/shared';
import {
  clearAllAudits,
  deleteAudit,
  getAudit,
  getLatestAudit,
  getPreviousAudit,
  listAuditSummaries,
} from '@/src/storage/audits';

/**
 * Dashboard data controller: summaries list, the currently loaded audit and
 * (when one exists) the previous audit of the same URL for comparison.
 */
export function useAudits() {
  const [summaries, setSummaries] = useState<AuditSummary[]>([]);
  const [current, setCurrent] = useState<AuditRecord | null>(null);
  const [previous, setPrevious] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setSummaries(await listAuditSummaries());
  }, []);

  const applyCurrent = useCallback(async (audit: AuditRecord | null) => {
    setCurrent(audit);
    setPrevious(audit === null ? null : await getPreviousAudit(audit.url, audit.analyzedAt));
  }, []);

  const loadLatest = useCallback(async () => {
    await applyCurrent(await getLatestAudit());
  }, [applyCurrent]);

  const loadAudit = useCallback(
    async (id: number) => {
      await applyCurrent(await getAudit(id));
    },
    [applyCurrent],
  );

  useEffect(() => {
    void (async () => {
      // Deep link support: dashboard.html#audit=12
      const match = /#audit=(\d+)/.exec(window.location.hash);
      if (match) {
        await loadAudit(Number(match[1]));
      } else {
        await loadLatest();
      }
      await refresh();
      setLoading(false);
    })();
  }, [loadAudit, loadLatest, refresh]);

  const remove = useCallback(
    async (id: number) => {
      await deleteAudit(id);
      if (current?.id === id) {
        await loadLatest();
      }
      await refresh();
    },
    [current, loadLatest, refresh],
  );

  const clearAll = useCallback(async () => {
    await clearAllAudits();
    await applyCurrent(null);
    await refresh();
  }, [applyCurrent, refresh]);

  return {
    summaries,
    current,
    previous,
    loading,
    refresh,
    loadAudit,
    loadLatest,
    remove,
    clearAll,
  };
}
