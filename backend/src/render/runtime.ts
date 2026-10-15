/**
 * The script shipped inside an exported page. Plain browser JavaScript (no
 * framework) that restores the interactive parts on the static markup: banner
 * slider, brand search / discount filters / "view more", tabs and "read more".
 * Everything is visible and usable without it; it only enhances.
 *
 * It initialises itself when the HTML is parsed. A host page that inserts the
 * markup later (e.g. after client-side navigation) can call
 * `window.GyftrOccasion.init()` — initialising twice is harmless.
 */
const SOURCE = `(function () {
  'use strict';
  var P = '__CLASS_PREFIX__';
  function sel(s) { return s.replace(/[.]([a-z])/g, '.' + P + '$1'); }
  function all(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel(s))); }
  function one(s, root) { return root.querySelector(sel(s)); }
  function fresh(el) { if (el.getAttribute('data-occ-ready')) return false; el.setAttribute('data-occ-ready', '1'); return true; }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function slider(carousel) {
    var track = one('.hero-track', carousel);
    if (!track || track.children.length < 2) return;
    var dots = all('.hero-dots button', carousel);
    var count = track.children.length, index = 0, paused = false;
    function go(i) { index = ((i % count) + count) % count; track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' }); }
    track.addEventListener('scroll', function () {
      index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      dots.forEach(function (d, i) { d.setAttribute('aria-current', i === index ? 'true' : 'false'); });
    }, { passive: true });
    var prev = one('.hero-arrow.prev', carousel), next = one('.hero-arrow.next', carousel);
    if (prev) prev.addEventListener('click', function () { go(index - 1); });
    if (next) next.addEventListener('click', function () { go(index + 1); });
    dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); }); });
    carousel.addEventListener('mouseenter', function () { paused = true; });
    carousel.addEventListener('mouseleave', function () { paused = false; });
    carousel.addEventListener('focusin', function () { paused = true; });
    carousel.addEventListener('focusout', function () { paused = false; });
    var ms = Number(carousel.getAttribute('data-autoplay')) || 0;
    if (ms > 0 && !reduceMotion) setInterval(function () { if (!paused && !document.hidden && document.contains(carousel)) go(index + 1); }, ms);
  }

  function brandList(root) {
    var cards = all('.brand-card', root);
    var grid = !!one('.brand-grid', root);
    var initial = Number(root.getAttribute('data-initial')) || 12;
    var visible = initial, query = '', min = -1, max = Infinity, cat = '';
    var more = root.querySelector('[data-view-more]');
    var moreCount = more && more.querySelector('[data-count]');
    var empty = one('.brand-empty', root);
    var input = one('.brand-search input', root);
    var chips = all('.chip', root);
    function apply() {
      var matches = 0;
      cards.forEach(function (card) {
        var name = (card.getAttribute('data-brand') || '').toLowerCase();
        var category = (card.getAttribute('data-category') || '').trim().toLowerCase();
        var discount = Number(card.getAttribute('data-discount')) || 0;
        var ok = (!query || name.indexOf(query) > -1 || category.indexOf(query) > -1) && (min < 0 || (discount > min && discount <= max)) && (!cat || category === cat);
        if (ok) matches++;
        card.hidden = !ok || (grid && matches > visible);
      });
      if (more) { more.hidden = !(grid && matches > visible); if (moreCount) moreCount.textContent = String(matches - visible); }
      if (empty) empty.hidden = matches > 0;
    }
    if (input) input.addEventListener('input', function () { query = input.value.trim().toLowerCase(); visible = initial; apply(); });
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        min = chip.hasAttribute('data-min') ? Number(chip.getAttribute('data-min')) : -1;
        max = chip.hasAttribute('data-max') ? Number(chip.getAttribute('data-max')) : Infinity;
        cat = (chip.getAttribute('data-category') || '').trim().toLowerCase();
        visible = initial; apply();
      });
    });
    if (more) more.addEventListener('click', function () { visible += initial; apply(); });
    var trackEl = one('.carousel-track', root);
    all('.carousel-btn', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (trackEl) trackEl.scrollBy({ left: (btn.classList.contains(P + 'prev') ? -1 : 1) * trackEl.clientWidth * 0.85, behavior: 'smooth' });
      });
    });
  }

  function tabs(root) {
    var tabEls = all('[role=tab]', root), panels = all('[role=tabpanel]', root);
    function select(i, focus) {
      tabEls.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
      panels.forEach(function (p, j) { p.hidden = j !== i; });
      if (focus) tabEls[i].focus();
    }
    tabEls.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); select((i + d + tabEls.length) % tabEls.length, true); }
      });
    });
  }

  function readMore(root) {
    var body = one('.collapsible-body', root), btn = one('.read-more', root);
    if (!body || !btn) return;
    var height = parseInt(body.style.maxHeight, 10) || 260, open = false;
    if (body.scrollHeight <= height + 40) { body.style.maxHeight = ''; root.classList.add(P + 'is-open'); btn.hidden = true; return; }
    btn.addEventListener('click', function () {
      open = !open;
      body.style.maxHeight = open ? '' : height + 'px';
      root.classList.toggle(P + 'is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = (open ? btn.getAttribute('data-less') : btn.getAttribute('data-more')) + ' ' + String.fromCharCode(open ? 9650 : 9660);
    });
  }

  /* Links to a section of this page (#brands) scroll to it directly instead of navigating, so they work
     wherever the HTML is inserted: a host page with a <base> element or a client-side router, or the editor
     preview. Only ids inside this page are used, so an element of the host page with the same id is never the target. */
  function sectionLinks(page) {
    page.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!link || link.getAttribute('href').charAt(0) !== '#') return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var id = link.getAttribute('href').slice(1), target = null, withId = page.querySelectorAll('[id]');
      for (var i = 0; id && i < withId.length && !target; i++) if (withId[i].id === id) target = withId[i];
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }

  function init(root) {
    root = root || document;
    all('.occasion', root).filter(fresh).forEach(sectionLinks);
    all('.hero-carousel', root).filter(fresh).forEach(slider);
    all('.brand-collection', root).filter(fresh).forEach(brandList);
    all('.brand-tabs', root).filter(fresh).forEach(tabs);
    all('.collapsible', root).filter(fresh).forEach(readMore);
  }

  window.GyftrOccasion = { init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
`;

/** The page script, bound to the class prefix used in the exported markup ('' when classes are not prefixed). */
export function exportRuntime(classPrefix = ''): string {
  if (!/^[a-z-]*$/.test(classPrefix)) throw new Error('Invalid class prefix');
  return SOURCE.replace('__CLASS_PREFIX__', classPrefix);
}
