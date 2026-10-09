import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';

/** Every key path, e.g. "admin.login.title". */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** {{placeholders}} used by each key. */
function placeholders(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') result[path] = (node.match(/{{\s*\w+\s*}}/g) ?? []).sort();
    else if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(value, '');
  return result;
}

describe('translations', () => {
  it('have the same keys in English and Spanish', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it('use the same placeholders in both languages', () => {
    expect(placeholders(es)).toEqual(placeholders(en));
  });

  it('have no empty strings', () => {
    for (const file of [en, es]) expect(JSON.stringify(file)).not.toContain('""');
  });
});
