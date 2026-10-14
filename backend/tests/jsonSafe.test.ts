import { describe, expect, it } from 'vitest';
import { isJsonSafe, jsonSafeCss, jsonSafeMarkup, jsonSafeScript } from '../src/render/jsonSafe';
import { exportRuntime } from '../src/render/runtime';

/** The published HTML must read the same inside a JSON response, so gyftr.com never sees escapes. */
describe('HTML that reads the same inside JSON', () => {
  it('markup: attributes in single quotes, quotes and backslashes in text as entities, one line', () => {
    const markup = '<div class="occ-a" title="it\'s &quot;ok&quot;" hidden="">He said "hi" \\o/\n<p>line two</p>\t</div>';
    const safe = jsonSafeMarkup(markup);
    expect(safe).toBe("<div class='occ-a' title='it&#39;s &quot;ok&quot;' hidden=''>He said &quot;hi&quot; &#92;o/ <p>line two</p> </div>");
    expect(isJsonSafe(safe)).toBe(true);
  });

  it('styles: one line, single-quoted strings, quotes inside data: URLs percent-encoded', () => {
    const css = `.a{font-family:system-ui, "Segoe UI", sans-serif}\n.b{background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E");\n  color: red}`;
    const safe = jsonSafeCss(css);
    expect(safe).toBe(".a{font-family:system-ui, 'Segoe UI', sans-serif} .b{background-image: url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27%3E%3C/svg%3E'); color: red}");
    expect(isJsonSafe(safe)).toBe(true);
  });

  it('the page script is one line and still valid JavaScript', () => {
    const js = jsonSafeScript(exportRuntime('occ-'));
    expect(isJsonSafe(js)).toBe(true);
    expect(() => new Function(js)).not.toThrow();
    expect(() => jsonSafeScript('var a = "x";')).toThrow(/double quotes/);
    expect(() => jsonSafeScript('// comment\nvar a = 1;')).toThrow(/comments/);
  });
});
