import { describe, expect, it } from 'vitest';
import { prefixClasses, transformCss } from '../src/render/css';

describe('embed stylesheet transform', () => {
  const options = { scope: '.occ-occasion', classPrefix: 'occ-', rootClass: 'occasion' };

  it('confines every rule to the root and prefixes class names', () => {
    const css = transformCss(
      `:root{--x:1} body{margin:0} *,*::before{box-sizing:border-box} .card:hover .title, a.link{color:red}
       .occasion[data-pattern='dots'] .main{top:0} @media (max-width:600px){.card{display:none}} /* comment */`,
      options,
    );
    expect(css).toBe(
      ".occ-occasion{--x:1}.occ-occasion{margin:0}.occ-occasion *,.occ-occasion *::before{box-sizing:border-box}" +
        ".occ-occasion .occ-card:hover .occ-title,.occ-occasion a.occ-link{color:red}" +
        ".occ-occasion[data-pattern='dots'] .occ-main{top:0}@media (max-width:600px){.occ-occasion .occ-card{display:none}}",
    );
  });

  it('leaves keyframes, font faces and data URIs intact and can drop selectors', () => {
    const css = transformCss(
      `@keyframes occ-rise{from{opacity:0}to{opacity:1}} @font-face{font-family:'Poppins';src:url(data:font/woff2;base64,AA.BB/CC==)}
       .site-header,.hero{background:url("data:image/svg+xml,%3Csvg class='x.y'%3E%3C/svg%3E")} .site-footer{color:red}`,
      { ...options, dropSelector: (s) => s.startsWith('.site-') },
    );
    expect(css).toContain('@keyframes occ-rise{from{opacity:0}to{opacity:1}}');
    expect(css).toContain('src:url(data:font/woff2;base64,AA.BB/CC==)');
    expect(css).toContain(`.occ-occasion .occ-hero{background:url("data:image/svg+xml,%3Csvg class='x.y'%3E%3C/svg%3E")}`);
    expect(css).not.toContain('site-');
  });

  it('prefixes classes in markup', () => {
    expect(prefixClasses('<div class="a  b-c"><svg class="d"></svg><p>class="x"</p></div>', 'occ-')).toBe('<div class="occ-a occ-b-c"><svg class="occ-d"></svg><p>class="x"</p></div>');
  });
});
