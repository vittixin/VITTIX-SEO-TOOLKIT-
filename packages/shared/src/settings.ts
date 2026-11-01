import { z } from 'zod';
import { SITE_LIMITS } from './site.js';

const MAX_LOGO_DATA_URI_CHARS = 136_600;
const MAX_LOGO_BYTES = 100 * 1024;

export const ExportBrandingSchema = z.object({
  agencyName: z.string().max(80).default(''),
  accentColor: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .default('#3157d5'),
  /** Raster only. SVG is deliberately unsupported to avoid active SVG content. */
  logoDataUri: z
    .string()
    .max(MAX_LOGO_DATA_URI_CHARS)
    .regex(
      /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/,
    )
    .refine((value) => {
      const [mediaType, payload] = value.slice(5).split(';base64,');
      if (!payload) return false;
      if (mediaType === 'image/png') return payload.startsWith('iVBORw0KGgo');
      if (mediaType === 'image/jpeg') return payload.startsWith('/9j/');
      if (mediaType === 'image/webp') return payload.startsWith('UklGR');
      return false;
    }, 'Logo bytes must match PNG, JPEG or WebP')
    .refine((value) => {
      const encoded = value.slice(value.indexOf(',') + 1);
      const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
      return Math.floor((encoded.length * 3) / 4) - padding <= MAX_LOGO_BYTES;
    }, 'Logo must be at most 100 KB')
    .nullable()
    .default(null),
});
export type ExportBranding = z.infer<typeof ExportBrandingSchema>;
export const DEFAULT_EXPORT_BRANDING: ExportBranding = {
  agencyName: '',
  accentColor: '#3157d5',
  logoDataUri: null,
};

/**
 * Settings are stored locally in IndexedDB. No cloud, no sync.
 * Site-audit fields are optional-with-defaults so pre-Phase-3 rows parse.
 */
export const SettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  /** Days to keep audits. 0 = keep forever. */
  historyRetentionDays: z.number().int().min(0).max(3650),
  /** Hard cap on stored audits (oldest pruned first). */
  maxStoredAudits: z.number().int().min(10).max(5000),
  /** Site mode: pages per audit (hard-capped at SITE_LIMITS.maxPagesCap). */
  siteAuditMaxPages: z
    .number()
    .int()
    .min(1)
    .max(SITE_LIMITS.maxPagesCap)
    .default(SITE_LIMITS.maxPagesDefault),
  /** Site mode: minimum interval between request starts. */
  siteAuditDelayMs: z
    .number()
    .int()
    .min(SITE_LIMITS.delayMsFloor)
    .max(10_000)
    .default(SITE_LIMITS.delayMsDefault),
  exportBranding: ExportBrandingSchema.default(DEFAULT_EXPORT_BRANDING),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  historyRetentionDays: 90,
  maxStoredAudits: 200,
  siteAuditMaxPages: SITE_LIMITS.maxPagesDefault,
  siteAuditDelayMs: SITE_LIMITS.delayMsDefault,
  exportBranding: DEFAULT_EXPORT_BRANDING,
};

/** Key used for the settings row in the Dexie `settings` table. */
export const SETTINGS_KEY = 'app-settings';
