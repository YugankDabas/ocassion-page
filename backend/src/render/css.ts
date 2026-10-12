/**
 * Stylesheet transforms for embedded pages. Works on the CSS this app itself
 * authors (plain rules, @media / @supports, @font-face, @keyframes) — it is
 * not a general-purpose CSS parser.
 */

export interface FontFace {
  family: string;
  /** Raw unicode-range value, empty when the face covers everything. */
  unicodeRange: string;
}

export interface CssOptions {
  /** Selector of the root element; every rule is confined to it. Omit to leave selectors unscoped. */
  scope?: string;
  /** Prefix added to every class name (must match the prefix applied to the markup). */
  classPrefix?: string;
  /** Class (without prefix) carried by the root element. */
  rootClass?: string;
  /** Return false to drop an @font-face block. */
  keepFont?: (face: FontFace) => boolean;
  /** Return true to drop a selector (as authored, before scoping); a rule left with no selectors is dropped. */
  dropSelector?: (selector: string) => boolean;
}

interface Block {
  prelude: string;
  /** null for statements that end in ";" (e.g. @import). */
  body: string | null;
}

/** Index of the first `targets` character at nesting depth 0, skipping strings and (...) groups. */
function findTopLevel(text: string, from: number, targets: string): number {
  let depth = 0;
  let quote = '';
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && targets.includes(ch)) return i;
  }
  return -1;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return text.length;
}

function readBlocks(css: string): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < css.length) {
    const at = findTopLevel(css, i, '{;');
    if (at === -1) break;
    const prelude = css.slice(i, at).trim();
    if (css[at] === ';') {
      if (prelude) blocks.push({ prelude, body: null });
      i = at + 1;
      continue;
    }
    const close = matchingBrace(css, at);
    blocks.push({ prelude, body: css.slice(at + 1, close) });
    i = close + 1;
  }
  return blocks;
}

function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (;;) {
    const comma = findTopLevel(list, start, ',');
    if (comma === -1) break;
    out.push(list.slice(start, comma));
    start = comma + 1;
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

const DOCUMENT_ROOT = /^(?::root|html|body)(?![\w-])/;
const FONT_VARIABLE_CLASS = /^\.__variable_[\w-]+$/; // next/font: defines the --font-* variables on <html>
const FONT_CLASSNAME_CLASS = /^\.__className_[\w-]+/; // next/font: unused by this app

function scopeSelector(selector: string, o: Required<Pick<CssOptions, 'classPrefix' | 'rootClass'>> & { scope?: string }): string | null {
  if (FONT_CLASSNAME_CLASS.test(selector)) return null;
  if (FONT_VARIABLE_CLASS.test(selector)) return o.scope ?? selector;
  const prefixed = o.classPrefix ? selector.replace(/\.(-?[A-Za-z_][\w-]*)/g, (_m, name: string) => `.${o.classPrefix}${name}`) : selector;
  if (!o.scope) return prefixed;
  const root = DOCUMENT_ROOT.exec(prefixed);
  if (root) return `${o.scope}${prefixed.slice(root[0].length)}`;
  const rootSelector = `.${o.classPrefix}${o.rootClass}`;
  if (prefixed.startsWith(rootSelector) && !/[\w-]/.test(prefixed[rootSelector.length] ?? '')) return prefixed;
  return `${o.scope} ${prefixed}`;
}

const NESTING_AT_RULES = /^@(?:media|supports|container|layer)\b/;

function transformBlocks(css: string, o: CssOptions): string {
  let out = '';
  for (const { prelude, body } of readBlocks(css)) {
    if (body === null) {
      out += `${prelude};`;
    } else if (NESTING_AT_RULES.test(prelude)) {
      const inner = transformBlocks(body, o);
      if (inner) out += `${prelude}{${inner}}`;
    } else if (prelude.startsWith('@font-face')) {
      const family = /font-family:\s*([^;]+)/.exec(body)?.[1]?.replace(/['"]/g, '').trim() ?? '';
      const unicodeRange = /unicode-range:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? '';
      if (!o.keepFont || o.keepFont({ family, unicodeRange })) out += `${prelude}{${body.trim()}}`;
    } else if (prelude.startsWith('@')) {
      out += `${prelude}{${body.trim()}}`; // @keyframes, @property, …
    } else {
      const selectors = splitSelectors(prelude)
        .filter((s) => !o.dropSelector?.(s))
        .map((s) => scopeSelector(s, { scope: o.scope, classPrefix: o.classPrefix ?? '', rootClass: o.rootClass ?? '' }))
        .filter((s): s is string => s !== null);
      const declarations = body.trim();
      if (selectors.length && declarations) out += `${[...new Set(selectors)].join(',')}{${declarations}}`;
    }
  }
  return out;
}

/** Scope, prefix and prune a stylesheet (comments are removed). */
export function transformCss(css: string, options: CssOptions): string {
  return transformBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ''), options);
}

/** Add the class prefix to every class attribute in a piece of markup. */
export function prefixClasses(markup: string, prefix: string): string {
  if (!prefix) return markup;
  return markup.replace(/\sclass="([^"]*)"/g, (_m, value: string) => {
    const classes = value.split(/\s+/).filter(Boolean).map((c) => prefix + c);
    return ` class="${classes.join(' ')}"`;
  });
}
