import { db } from './db';

/** Target terms are persisted only in this extension's IndexedDB. */
export async function getTargetKeyword(url: string): Promise<string> {
  return (await db.targetKeywords.get(url))?.keyword ?? '';
}

export async function saveTargetKeyword(url: string, keyword: string): Promise<void> {
  const clean = keyword.trim().slice(0, 200);
  if (clean === '') await db.targetKeywords.delete(url);
  else await db.targetKeywords.put({ url, keyword: clean });
}
