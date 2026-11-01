/**
 * Serialized into the inspected page only after the user clicks Show on page.
 * It uses fixed selector strings, reads no new page data, and makes no requests.
 */
export function highlightOnPage(
  locators: { kind: 'heading' | 'image' | 'link'; nthIndex: number }[],
): void {
  const selectorByKind: Record<string, string> = {
    heading: 'h1,h2,h3,h4,h5,h6',
    image: 'img',
    link: 'a[href]',
  };
  const targets: Element[] = [];
  for (const locator of locators.slice(0, 50)) {
    const selector = selectorByKind[locator.kind];
    if (!selector || !Number.isInteger(locator.nthIndex) || locator.nthIndex < 0) continue;
    const element = document.querySelectorAll(selector).item(locator.nthIndex);
    if (element) targets.push(element);
  }

  const previousStyles = targets.map((element) => (element as HTMLElement).style.outline);
  targets.forEach((element) => {
    (element as HTMLElement).style.outline = '3px solid #7c3aed';
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText =
    'position:fixed;z-index:2147483647;right:16px;top:16px;max-width:320px;padding:14px;background:#fff;color:#111827;border:2px solid #6d28d9;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px #0004';
  const message = document.createElement('span');
  message.textContent = targets.length
    ? `Highlighted ${targets.length} element${targets.length === 1 ? '' : 's'}.`
    : 'Element no longer found — re-analyze this page.';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss page highlights');
  dismiss.style.cssText =
    'margin-left:12px;padding:4px 8px;background:#ede9fe;color:#312e81;border:1px solid #6d28d9;border-radius:4px;font:inherit;cursor:pointer';
  overlay.append(message, dismiss);
  document.documentElement.append(overlay);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    targets.forEach((element, index) => {
      (element as HTMLElement).style.outline = previousStyles[index] ?? '';
    });
    overlay.remove();
    window.removeEventListener('beforeunload', cleanup);
  };
  dismiss.addEventListener('click', cleanup, { once: true });
  window.addEventListener('beforeunload', cleanup, { once: true });
}
