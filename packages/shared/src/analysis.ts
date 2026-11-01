import { z } from 'zod';
import { FindingSchema, type SeverityCounts } from './finding.js';
import { PageSnapshotSchema } from './snapshot.js';

/**
 * Scores are explicitly marked preliminary while the rule set is young.
 * `preliminary` is a literal `true` so UI code cannot forget the label.
 * `capReason` is set when a blocking issue (noindex, missing title/h1,
 * invalid canonical) caps the total — nullable/defaulted so stored records
 * from earlier rule sets still validate.
 */
export const ScoreSchema = z.object({
  total: z.number().min(0).max(100),
  label: z.string().min(1),
  preliminary: z.literal(true),
  capReason: z.string().nullable().default(null),
  categories: z.array(
    z.object({
      category: z.enum([
        'metadata',
        'headings',
        'images',
        'links',
        'content',
        'social',
        'technical',
      ]),
      score: z.number().min(0).max(100),
    }),
  ),
});
export type Score = z.infer<typeof ScoreSchema>;

export const AnalysisResultSchema = z.object({
  ruleSetVersion: z.string().min(1),
  findings: z.array(FindingSchema),
  score: ScoreSchema,
  /**
   * True when the page exceeded extraction caps (collections truncated).
   * Scores computed on partial data are still deterministic but may
   * undercount. Defaults to false so Phase 0 records stay readable.
   */
  truncated: z.boolean().default(false),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** A stored audit: snapshot + result + bookkeeping. Persisted via Dexie. */
export const AuditRecordSchema = z.object({
  id: z.number().int().positive().optional(),
  url: z.string().min(1),
  title: z.string(),
  analyzedAt: z.string().min(1),
  ruleSetVersion: z.string().min(1),
  profileId: z
    .enum(['standard', 'content-site', 'e-commerce', 'developer-staging'])
    .default('standard'),
  snapshot: PageSnapshotSchema,
  result: AnalysisResultSchema,
});
export type AuditRecord = z.infer<typeof AuditRecordSchema>;

/** Audit record before the database assigns an id. */
export type NewAuditRecord = Omit<AuditRecord, 'id'>;

export type AuditSummary = {
  id: number;
  url: string;
  title: string;
  analyzedAt: string;
  score: Score;
  counts: SeverityCounts;
};
