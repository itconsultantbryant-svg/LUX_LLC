import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const folder = fileURLToPath(new URL('../../drizzle/', import.meta.url));
const journal = JSON.parse(readFileSync(`${folder}meta/_journal.json`, 'utf8')) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe('migration history', () => {
  it('does not recreate tables or enum types introduced by an earlier migration', () => {
    const created = new Set<string>();
    for (const entry of journal.entries) {
      const sql = readFileSync(`${folder}${entry.tag}.sql`, 'utf8');
      for (const match of sql.matchAll(
        /CREATE\s+(TABLE|TYPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"([^"]+)"/g,
      )) {
        const key = `${match[1]}:${match[2]}`;
        expect(created.has(key), `${entry.tag} recreates ${key}`).toBe(false);
        created.add(key);
      }
    }
    expect(created.has('TABLE:users')).toBe(true);
    expect(created.has('TABLE:auth_sessions')).toBe(true);
  });
  it('keeps snapshots chained and consistent with tables introduced by SQL', () => {
    let previousId = '00000000-0000-0000-0000-000000000000';
    const tables = new Set<string>();
    for (const entry of journal.entries) {
      const sql = readFileSync(`${folder}${entry.tag}.sql`, 'utf8');
      for (const match of sql.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"([^"]+)"/g,
      ))
        tables.add(`public.${match[1]}`);
      const snapshot = JSON.parse(
        readFileSync(`${folder}meta/${String(entry.idx).padStart(4, '0')}_snapshot.json`, 'utf8'),
      );
      expect(snapshot.prevId).toBe(previousId);
      expect(Object.keys(snapshot.tables).sort()).toEqual([...tables].sort());
      previousId = snapshot.id;
    }
  });
});
