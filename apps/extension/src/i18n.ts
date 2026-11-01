export const I18N_KEYS = [
  'navOverview',
  'navMetadata',
  'navHeadings',
  'navImages',
  'navLinks',
  'navFindings',
  'navHistory',
  'navSite',
  'navPreviews',
  'navContent',
  'navExport',
  'navSettings',
  'buttonAnalyze',
  'buttonShowOnPage',
  'headingSiteConsent',
  'headingAppearance',
  'labelTheme',
  'siteConsentRedirect',
] as const;
export type I18nKey = (typeof I18N_KEYS)[number];

export function t(key: I18nKey): string {
  return browser.i18n.getMessage(key as never) || key;
}
import { browser } from 'wxt/browser';
