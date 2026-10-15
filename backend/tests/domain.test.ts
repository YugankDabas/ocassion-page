import { describe, expect, it } from 'vitest';
import { isSafeHref, pageContentSchema } from '../src/contracts';
import { PageUrlPolicy } from '../src/domain/pages/PageUrlPolicy';
import { HtmlSanitizer } from '../src/lib/HtmlSanitizer';
import { safeEqual } from '../src/lib/crypto';

describe('PageUrlPolicy', () => {
  const policy = new PageUrlPolicy('https://www.gyftr.com/occasion');

  it.each([
    ['https://www.gyftr.com/occasion/diwali-gift-cards', 'diwali-gift-cards'],
    ['https://www.gyftr.com/occasion/holi-gift-ideas/', 'holi-gift-ideas'],
    ['https://www.gyftr.com/occasion/teachers-day-gift-card?utm=x#top', 'teachers-day-gift-card'],
  ])('maps %s → %s', (url, slug) => {
    expect(policy.toSlug(url)).toBe(slug);
  });

  it.each([
    'http://www.gyftr.com/occasion/diwali', // wrong scheme (origin differs)
    'https://gyftr.com/occasion/diwali', // wrong host
    'https://www.gyftr.com/diwali', // outside base path
    'https://www.gyftr.com/occasion/a/b', // nested
    'https://www.gyftr.com/occasion/Bad_Slug',
    'https://www.gyftr.com/occasion/preview', // reserved
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => policy.toSlug(url)).toThrow();
  });
});

describe('HtmlSanitizer', () => {
  const s = new HtmlSanitizer();
  it('removes scripts, handlers, styles and unsafe links', () => {
    expect(s.sanitize('<img src=x onerror=alert(1)><p style="color:red" onclick="x()">ok</p><iframe src="//evil"></iframe>')).toBe('<p>ok</p>');
    expect(s.sanitize('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(s.sanitize('<a href="//evil.com">x</a>')).toBe('<a>x</a>');
  });
  it('keeps tables and images with a full https address (terms)', () => {
    expect(s.sanitize('<table><tbody><tr><th colspan="2">A</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>')).toBe('<table><tbody><tr><th colspan="2">A</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(s.sanitize('<img src="https://cdn.example/a.webp" alt="A" style="x" onload="y()">')).toBe('<img src="https://cdn.example/a.webp" alt="A" />');
    expect(s.sanitize('<img src="javascript:alert(1)"><img src="data:image/png;base64,AA"><img src="/a.png">')).toBe('');
  });
  it('keeps formatting and hardens external links', () => {
    expect(s.sanitize('<h1>T</h1><ul><li><strong>a</strong></li></ul>')).toBe('<h2>T</h2><ul><li><strong>a</strong></li></ul>');
    expect(s.sanitize('<a href="https://x.com" target="_blank">x</a>')).toBe('<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>');
  });
});

describe('contracts', () => {
  it('only allows safe hrefs', () => {
    for (const ok of ['', '#faq', '/amazon', 'https://www.gyftr.com/amazon']) expect(isSafeHref(ok)).toBe(true);
    for (const bad of ['javascript:alert(1)', '//evil.com', 'data:text/html,x', '/\\evil', 'ftp://x']) expect(isSafeHref(bad)).toBe(false);
  });

  it('rejects unknown section types and fills defaults', () => {
    expect(pageContentSchema.safeParse({ sections: [{ id: 'a', type: 'nope', props: {} }] }).success).toBe(false);
    const parsed = pageContentSchema.parse({ sections: [{ id: 'a', type: 'faq', props: {} }] });
    expect(parsed.theme.primary).toMatch(/^#/);
    expect(parsed.sections[0]).toMatchObject({ visible: true, props: { items: [], emitStructuredData: true } });
  });
});

describe('safeEqual', () => {
  it('compares in constant time semantics', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
