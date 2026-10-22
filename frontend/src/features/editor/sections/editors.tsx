import { useId } from 'react';
import {
  ALIGNMENTS,
  ARROW_COLORS,
  ARROW_SHAPES,
  BRAND_CARD_SIZES,
  CARD_CORNERS,
  CARD_STYLES,
  COPY_POSITIONS,
  DEFAULT_BRAND_FILTERS,
  HERO_ARTWORKS,
  brandFilterLabel,
  brandMatchesFilter,
  heroSizeMismatches,
  type Arrows,
  type BrandFilter,
  type BRAND_LIST_COLOR_PARTS,
  type FAQ_COLOR_PARTS,
  type FEATURE_COLOR_PARTS,
  type Image,
  type SectionProps,
  type SectionType,
  type Size,
} from '../../../contracts';
import { BrandPicker } from '../../../components/fields/BrandPicker';
import { IconItemsEditor } from '../../../components/fields/IconItemsEditor';
import { IconSlotField } from '../../../components/fields/IconSlotField';
import { ImageField } from '../../../components/fields/ImageField';
import { RichTextEditor } from '../../../components/fields/RichTextEditor';
import { ListEditor } from '../../../components/fields/SortableList';
import { Button, Field, NumberInput, Select, TextArea, TextInput, Toggle } from '../../../components/ui';
import { newId } from '../../../lib/ids';
import { useBrandCategories, useBrandsByIds } from '../../../lib/queries';
import { ButtonsEditor, DESKTOP_BANNER_SIZES, HeadingInput, MOBILE_BANNER_SIZES, PartColors, SizeField, TagSelect, type ColorPart, type HeadingTag } from './fields';
import { HrefInput } from './HrefInput';

export interface EditorProps<T extends SectionType> {
  props: SectionProps<T>;
  onChange: (patch: Partial<SectionProps<T>>) => void;
  /** The section's heading tags (set next to the Heading field). */
  tag?: HeadingTag;
}

const toneOptions = [
  { value: 'surface', label: 'White card' },
  { value: 'primary', label: 'Theme primary colour' },
  { value: 'accent', label: 'Theme accent colour' },
  { value: 'transparent', label: 'No background' },
] as const;

const emptyImage = () => ({ url: '', alt: '' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ALIGN_LABELS = { left: 'Left', center: 'Centre', right: 'Right' } as const;
const CARD_STYLE_LABELS = { elevated: 'Raised (shadow)', outlined: 'Outlined', flat: 'Flat (filled)', plain: 'Plain (no card)' } as const;

/* ---------- Hero ---------- */
export function HeroEditor({ props, onChange, tag }: EditorProps<'hero'>) {
  const mismatches = heroSizeMismatches(props);
  type Slot = 'desktopImage' | 'mobileImage';
  const sizeKey = (slot: Slot) => (slot === 'desktopImage' ? 'desktopSize' : 'mobileSize');
  /** The banner size can become `size` when every other slide's image for this device is empty or already that size. */
  const canUseSize = (slideId: string, slot: Slot) => (size: Size) =>
    props.slides.every((o) => o.id === slideId || !o[slot].url || (o[slot].width === size.width && o[slot].height === size.height));
  /** Take an image of another size and make its size the banner size, in one change. */
  const takeSize = (slideId: string, slot: Slot) => (image: Image) =>
    onChange({
      [sizeKey(slot)]: { width: image.width!, height: image.height! },
      slides: props.slides.map((o) => (o.id === slideId ? { ...o, [slot]: image } : o)),
    });
  return (
    <div className="stack">
      <fieldset className="group stack">
        <legend>Banner image size</legend>
        <p className="field-hint" style={{ margin: 0 }}>
          Upload banner images at these sizes: the page shows them in exactly this shape, so nothing is cropped. Pick a strip for a
          banner without text.
        </p>
        <div className="grid-2">
          <SizeField label="Desktop" value={props.desktopSize} presets={DESKTOP_BANNER_SIZES} onChange={(desktopSize) => onChange({ desktopSize })} />
          <SizeField label="Phone" value={props.mobileSize} presets={MOBILE_BANNER_SIZES} onChange={(mobileSize) => onChange({ mobileSize })} />
        </div>
        {mismatches.length > 0 && (
          <div className="alert alert-danger">
            These images are not the banner size, so the page can’t be published until they are replaced or the size is changed:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {mismatches.map((m) => (
                <li key={`${m.slide}-${m.device}`}>
                  Slide {m.slide}, {m.device} banner: {m.width}×{m.height} px (needs {m.expected.width}×{m.expected.height} px)
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
      <div className="grid-2">
        <Select
          label="Height without a banner image"
          value={props.height}
          onChange={(height) => onChange({ height })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'standard', label: 'Standard' },
            { value: 'tall', label: 'Tall' },
          ]}
        />
        <NumberInput
          label="Auto-slide every (ms)"
          hint="0 = no auto-slide"
          value={props.autoplayMs}
          min={0}
          max={20000}
          step={500}
          onChange={(v) => onChange({ autoplayMs: v ?? 0 })}
        />
      </div>
      <Toggle
        label="Show trust bar under the banner"
        checked={props.showTrustBar}
        onChange={(showTrustBar) => onChange({ showTrustBar })}
      />
      {props.showTrustBar && <IconItemsEditor label="Trust bar items" items={props.trustItems} onChange={(trustItems) => onChange({ trustItems })} />}
      <ListEditor
        label="Slides"
        max={10}
        addLabel="Add slide"
        items={props.slides}
        onChange={(slides) => onChange({ slides })}
        summary={(s, i) => s.heading || s.desktopImage.alt || `Slide ${i + 1}`}
        createItem={() => ({
          id: newId('sl_'),
          desktopImage: emptyImage(),
          mobileImage: emptyImage(),
          href: '',
          eyebrow: '',
          heading: '',
          subheading: '',
          ctaLabel: '',
          buttons: [],
          copyAlign: 'left' as const,
          copyPosition: 'middle' as const,
          showBand: true,
          cardText: '',
          cardTitle: 'Gift Card',
          artwork: 'auto' as const,
          artImage: emptyImage(),
          sideImage: emptyImage(),
          showCard: true,
          showDecorations: true,
        })}
        renderItem={(s, update) => (
          <>
            <ImageField
              label="Desktop banner"
              hint={`Upload ${props.desktopSize.width}×${props.desktopSize.height} px (the banner size above).`}
              value={s.desktopImage}
              onChange={(desktopImage) => update({ desktopImage })}
              size={props.desktopSize}
              onUseSize={takeSize(s.id, 'desktopImage')}
              canUseSize={canUseSize(s.id, 'desktopImage')}
            />
            <ImageField
              label="Phone banner"
              hint={`Upload ${props.mobileSize.width}×${props.mobileSize.height} px. Empty: the desktop banner is used on phones.`}
              value={s.mobileImage}
              onChange={(mobileImage) => update({ mobileImage })}
              size={props.mobileSize}
              onUseSize={takeSize(s.id, 'mobileImage')}
              canUseSize={canUseSize(s.id, 'mobileImage')}
            />
            <HrefInput label="Banner link (the whole banner)" value={s.href} onChange={(href) => update({ href })} />
            <p className="field-hint">Text below is shown on the banner. Leave it empty if the image already contains text.</p>
            <TextInput label="Eyebrow" value={s.eyebrow} maxLength={80} onChange={(eyebrow) => update({ eyebrow })} />
            <HeadingInput value={s.heading} maxLength={140} onChange={(heading) => update({ heading })} tag={props.slides[0]?.id === s.id ? tag : undefined} />
            <TextArea label="Sub-heading" value={s.subheading} maxLength={240} onChange={(subheading) => update({ subheading })} />
            <ButtonsEditor value={s.buttons} onChange={(buttons) => update({ buttons })} />
            <div className="grid-2">
              <Select
                label="Text and buttons: alignment"
                value={s.copyAlign}
                onChange={(copyAlign) => update({ copyAlign })}
                options={ALIGNMENTS.map((a) => ({ value: a, label: ALIGN_LABELS[a] }))}
              />
              <Select
                label="On a banner image: position"
                value={s.copyPosition}
                onChange={(copyPosition) => update({ copyPosition })}
                options={COPY_POSITIONS.map((p) => ({ value: p, label: cap(p) }))}
              />
            </div>
            <fieldset className="group stack">
              <legend>Creative (used when no banner image is uploaded)</legend>
              <Select
                label="Illustration"
                value={s.artwork}
                onChange={(artwork) => update({ artwork })}
                options={HERO_ARTWORKS.map((m) => ({ value: m, label: m === 'auto' ? 'Same as page theme' : m === 'none' ? 'None (no illustration)' : cap(m) }))}
              />
              <Toggle label="Coloured background band" checked={s.showBand} onChange={(showBand) => update({ showBand })} />
              <ImageField
                label="Custom illustration"
                hint="Optional. Replaces the built-in illustration. Square transparent PNG / WebP, about 900×900 px."
                value={s.artImage}
                onChange={(artImage) => update({ artImage })}
              />
              <Toggle label="Show gift-card phone" checked={s.showCard} onChange={(showCard) => update({ showCard })} />
              <ImageField
                label="Custom side image"
                hint="Optional. Replaces the gift-card phone on the right (portrait image, about 520×900 px)."
                value={s.sideImage}
                onChange={(sideImage) => update({ sideImage })}
              />
              <Toggle label="Show ribbon, sparkles and confetti" checked={s.showDecorations} onChange={(showDecorations) => update({ showDecorations })} />
            </fieldset>
            <TextInput label="Gift card title" value={s.cardTitle} maxLength={30} onChange={(cardTitle) => update({ cardTitle })} />
            <TextInput
              label="Gift card greeting"
              placeholder="e.g. Happy Diwali"
              hint="Shown on the illustrated gift card when no banner image is uploaded. Shown on the gift-card phone."
              value={s.cardText}
              maxLength={40}
              onChange={(cardText) => update({ cardText })}
            />
          </>
        )}
      />
    </div>
  );
}

/* ---------- Intro ---------- */
export function IntroEditor({ props, onChange, tag }: EditorProps<'intro'>) {
  return (
    <div className="stack">
      <TextInput label="Eyebrow (small text above heading)" value={props.eyebrow} maxLength={80} onChange={(eyebrow) => onChange({ eyebrow })} />
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <RichTextEditor label="Body" value={props.body} onChange={(body) => onChange({ body })} />
      <div className="grid-2">
        <Select label="Alignment" value={props.align} onChange={(align) => onChange({ align })} options={[{ value: 'center', label: 'Centered' }, { value: 'left', label: 'Left' }]} />
        <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
      </div>
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
          <Toggle label="Side medallions (with the theme-colour background)" checked={props.showDecorations} onChange={(showDecorations) => onChange({ showDecorations })} />
      </fieldset>
    </div>
  );
}

/* ---------- Features ---------- */
export function FeaturesEditor({ props, onChange, tag }: EditorProps<'features'>) {
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <div className="grid-2">
        <NumberInput label="Columns (desktop)" value={props.columns} min={2} max={5} onChange={(v) => onChange({ columns: Math.min(5, Math.max(2, v ?? 4)) })} />
        <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
      </div>
      {tag && (
        <div className="heading-field">
          <span />
          <TagSelect label="Card title tag (all cards)" value={tag.itemLevel} onChange={tag.setItemLevel} allowH1={false} defaultLevel={3} />
        </div>
      )}
      <ListEditor
        label="Highlights"
        max={12}
        addLabel="Add highlight"
        items={props.items}
        onChange={(items) => onChange({ items })}
        summary={(f) => `${f.emoji} ${f.title}`.trim()}
        createItem={() => ({ id: newId('f_'), icon: emptyImage(), emoji: '✨', title: '', description: '' })}
        renderItem={(f, update) => (
          <>
            <div className="grid-2">
              <TextInput label="Emoji" hint="Used when no icon image is set" value={f.emoji} maxLength={8} onChange={(emoji) => update({ emoji })} />
              <TextInput label="Title" value={f.title} maxLength={80} onChange={(title) => update({ title })} />
            </div>
            <TextArea label="Description" value={f.description} maxLength={400} onChange={(description) => update({ description })} />
            <ImageField label="Icon image (optional)" hint="Square, 128×128 px" value={f.icon} onChange={(icon) => update({ icon })} />
          </>
        )}
      />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
          <Toggle label="Numbers (01, 02, …) on the cards" checked={props.showNumbers} onChange={(showNumbers) => onChange({ showNumbers })} />
      </fieldset>
      <fieldset className="group stack">
        <legend>Card look</legend>
        <div className="grid-2">
          <Select label="Card style" value={props.cardStyle} onChange={(cardStyle) => onChange({ cardStyle })} options={CARD_STYLES.map((c) => ({ value: c, label: CARD_STYLE_LABELS[c] }))} />
          <Select
            label="Text in the cards"
            value={props.textAlign}
            onChange={(textAlign) => onChange({ textAlign })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centre' },
            ]}
          />
        </div>
        <Toggle label="Animation (cards lift and show a colour bar on hover)" checked={props.animation} onChange={(animation) => onChange({ animation })} />
      </fieldset>
      <PartColors parts={FEATURE_PARTS} value={props.colors} onChange={(colors) => onChange({ colors })} />
    </div>
  );
}

/* ---------- Brand grid ---------- */
export function BrandGridEditor({ props, onChange, tag }: EditorProps<'brandGrid'>) {
  const parts = brandColorParts({ carousel: props.layout === 'carousel', search: props.showSearch, filters: props.showDiscountFilter, tabs: false });
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <div className="grid-2">
        <TextInput label="Card button label" placeholder="e.g. Buy now" value={props.ctaLabel} maxLength={30} onChange={(ctaLabel) => onChange({ ctaLabel })} />
        {props.layout === 'grid' && (
          <NumberInput label="Show before “View more”" value={props.initialCount} min={4} max={60} onChange={(v) => onChange({ initialCount: Math.min(60, Math.max(4, v ?? 12)) })} />
        )}
      </div>
      <BrandListLookEditor value={props} onChange={onChange} />
      <PartColors parts={parts} value={props.colors} onChange={(colors) => onChange({ colors })} />
      <div className="row wrap" style={{ gap: 20 }}>
        <Toggle label="Brand search box" checked={props.showSearch} onChange={(showSearch) => onChange({ showSearch })} />
        <Toggle label="Filter chips (discount / category)" checked={props.showDiscountFilter} onChange={(showDiscountFilter) => onChange({ showDiscountFilter })} />
      </div>
      {props.showDiscountFilter && (
        <FiltersEditor
          filters={props.discountFilters}
          brandIds={props.brands.map((b) => b.brandId)}
          hideEmpty={props.hideEmptyFilters}
          onChange={(discountFilters) => onChange({ discountFilters })}
          onHideEmpty={(hideEmptyFilters) => onChange({ hideEmptyFilters })}
        />
      )}
      <BrandPicker label="Brands" value={props.brands} onChange={(brands) => onChange({ brands })} />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <IconSlotField label="Icon before the discount" value={props.discountIcon} onChange={(discountIcon) => onChange({ discountIcon })} />
          <IconSlotField label="Icon after the card button text" value={props.ctaIcon} onChange={(ctaIcon) => onChange({ ctaIcon })} />
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
      </fieldset>
    </div>
  );
}

/** Discounts no discount filter catches, or that two of them both catch. */
function filterProblems(filters: BrandFilter[]): string[] {
  const sorted = filters.filter((f) => f.kind === 'discount').sort((a, b) => a.min - b.min);
  const problems: string[] = [];
  sorted.forEach((f, i) => {
    const next = sorted[i + 1];
    if (!next) return;
    if (f.max === null || next.min < f.max) problems.push(`“${brandFilterLabel(f)}” and “${brandFilterLabel(next)}” overlap: some brands show under both.`);
    else if (next.min > f.max) problems.push(`Discounts above ${f.max}% and up to ${next.min}% are in no filter.`);
  });
  return problems;
}

/**
 * The filter chips after "All": discount ranges and / or brand categories. Each filter shows how many brands
 * of this grid it catches, using the same rule as the page.
 */
function FiltersEditor({
  filters,
  brandIds,
  hideEmpty,
  onChange,
  onHideEmpty,
}: {
  filters: BrandFilter[];
  brandIds: string[];
  hideEmpty: boolean;
  onChange: (filters: BrandFilter[]) => void;
  onHideEmpty: (hide: boolean) => void;
}) {
  const listId = useId();
  const brands = useBrandsByIds(brandIds).data ?? [];
  const categories = useBrandCategories().data ?? [];
  const count = (f: BrandFilter) => brands.filter((b) => brandMatchesFilter(f, b)).length;
  const problems = filterProblems(filters);
  const emptyCategories = brands.length ? filters.filter((f) => f.kind === 'category' && f.category && count(f) === 0) : [];
  const discounts = filters.filter((f) => f.kind === 'discount');
  const openEnded = discounts.find((f) => f.max === null);
  const top = discounts.reduce((m, f) => Math.max(m, f.max ?? f.min), 0);

  /**
   * A new filter continues the ranges without gaps or overlaps: after "Above 25%" it becomes "Above 50%"
   * (and "Above 25%" becomes "25% – 50%"). With no room left above, it is a category not used yet.
   */
  const createFilter = (): BrandFilter => {
    const id = newId('flt_');
    const unused = categories.find((c) => !filters.some((f) => f.kind === 'category' && f.category.toLowerCase() === c.toLowerCase()));
    if (openEnded && openEnded.min + 25 < 100) return { id, kind: 'discount', label: '', min: openEnded.min + 25, max: null, category: '' };
    if (!openEnded && top < 100) return { id, kind: 'discount', label: '', min: top, max: null, category: '' };
    return { id, kind: 'category', label: '', min: 0, max: null, category: unused ?? categories[0] ?? 'Category' };
  };
  const change = (next: BrandFilter[]) => {
    const added = next.length === filters.length + 1 ? next.find((f) => !filters.some((o) => o.id === f.id)) : undefined;
    if (added?.kind === 'discount' && openEnded) next = next.map((f) => (f.id === openEnded.id ? { ...f, max: added.min } : f));
    onChange(next);
  };
  return (
    <div className="stack">
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <ListEditor
        label="Filters (after “All”)"
        max={12}
        addLabel="Add filter"
        items={filters}
        onChange={change}
        summary={(f) => `${brandFilterLabel(f) || 'New filter'}${brands.length ? ` · ${count(f)} brand${count(f) === 1 ? '' : 's'}` : ''}`}
        createItem={createFilter}
        renderItem={(f, update) => (
          <div className="stack">
            <div className="grid-2">
              <Select
                label="Filter by"
                value={f.kind}
                onChange={(kind) => update({ kind })}
                options={[
                  { value: 'discount', label: 'Discount range' },
                  { value: 'category', label: 'Category' },
                ]}
              />
              <TextInput label="Chip text" value={f.label} maxLength={30} placeholder={brandFilterLabel({ ...f, label: '' }) || 'Written from the filter'} onChange={(label) => update({ label })} />
            </div>
            {f.kind === 'discount' ? (
              <div className="grid-2">
                <NumberInput label="From (above) %" value={f.min} min={0} max={100} step={0.5} onChange={(v) => update({ min: Math.min(100, Math.max(0, v ?? 0)) })} />
                <NumberInput
                  label="To (up to) %"
                  hint="Empty = no upper limit"
                  value={f.max}
                  min={0}
                  max={100}
                  step={0.5}
                  onChange={(v) => update({ max: v === null ? null : Math.min(100, Math.max(0, v)) })}
                />
              </div>
            ) : (
              <TextInput
                label="Category"
                value={f.category}
                maxLength={60}
                list={listId}
                placeholder={categories.length ? `e.g. ${categories[0]}` : 'e.g. Fashion'}
                hint="Brands whose category (Brands page → Edit → Category) is this, ignoring capitals."
                onChange={(category) => update({ category })}
              />
            )}
          </div>
        )}
      />
      <p className="field-hint" style={{ margin: 0 }}>
        A discount filter shows brands whose discount is above “From” and up to “To” (0–5, 5–10, 10–25, 25+ put every brand in exactly one). A
        category filter shows brands of that category.
      </p>
      {problems.map((p) => (
        <div key={p} className="alert alert-warning">
          {p}
        </div>
      ))}
      {emptyCategories.map((f) => (
        <div key={f.id} className="alert alert-warning">
          No brand in this grid has the category “{f.category}”. Set it on the Brands page (Edit → Category) or pick another one.
        </div>
      ))}
      <div className="row wrap" style={{ gap: 20 }}>
        <Toggle label="Hide filters with no brands in this grid" checked={hideEmpty} onChange={onHideEmpty} />
        <Button size="sm" variant="ghost" onClick={() => onChange(DEFAULT_BRAND_FILTERS.map((f) => ({ ...f, id: newId('flt_') })))}>
          Reset to default filters
        </Button>
      </div>
    </div>
  );
}

const ALL_COLORS = ['background', 'border', 'text'] as const;

/** The parts of a brand list whose colours can be set: only those the list shows. */
function brandColorParts(shown: { carousel: boolean; search: boolean; filters: boolean; tabs: boolean }): ColorPart<(typeof BRAND_LIST_COLOR_PARTS)[number]>[] {
  return [
    ...(shown.tabs
      ? [
          { key: 'tabBar', label: 'Tab bar', roles: ['background', 'border'] },
          { key: 'tab', label: 'Tab', roles: ALL_COLORS },
          { key: 'tabActive', label: 'Selected tab', roles: ALL_COLORS },
        ] as const
      : []),
    ...(shown.search || shown.filters ? [{ key: 'tools', label: 'Search & filter bar', roles: ['background', 'border'] }] as const : []),
    ...(shown.search ? [{ key: 'search', label: 'Search box', roles: ALL_COLORS }] as const : []),
    ...(shown.filters
      ? [
          { key: 'chip', label: 'Filter', roles: ALL_COLORS },
          { key: 'chipActive', label: 'Selected filter', roles: ALL_COLORS },
        ] as const
      : []),
    { key: 'card', label: 'Card (and brand name)', roles: ALL_COLORS },
    { key: 'logo', label: 'Logo box', roles: ALL_COLORS },
    { key: 'details', label: 'Details (In-store…)', roles: ['text'] },
    { key: 'pill', label: 'Discount pill', roles: ALL_COLORS },
    { key: 'cta', label: 'Card button (Buy now)', roles: ALL_COLORS },
    { key: 'badge', label: 'Badge', roles: ALL_COLORS },
    ...(shown.carousel ? [{ key: 'arrow', label: 'Arrows', roles: ALL_COLORS }] as const : []),
  ];
}

const FEATURE_PARTS: ColorPart<(typeof FEATURE_COLOR_PARTS)[number]>[] = [
  { key: 'card', label: 'Card', roles: ALL_COLORS },
  { key: 'icon', label: 'Icon box', roles: ALL_COLORS },
  { key: 'title', label: 'Card title', roles: ['text'] },
  { key: 'text', label: 'Card text', roles: ['text'] },
];

const FAQ_PARTS: ColorPart<(typeof FAQ_COLOR_PARTS)[number]>[] = [
  { key: 'item', label: 'Question box', roles: ALL_COLORS },
  { key: 'index', label: 'Number (01, 02…)', roles: ['text'] },
  { key: 'question', label: 'Question', roles: ['text'] },
  { key: 'answer', label: 'Answer', roles: ['text'] },
  { key: 'toggle', label: 'Open / close button', roles: ALL_COLORS },
  { key: 'help', label: '“Still have a question?” box', roles: ALL_COLORS },
];

interface BrandListLookValue {
  layout: 'grid' | 'carousel';
  arrows: Arrows;
  cardStyle: (typeof CARD_STYLES)[number];
  cardSize: (typeof BRAND_CARD_SIZES)[number];
  cardCorners: (typeof CARD_CORNERS)[number];
}

/** Layout of a brand list (rows, or one row scrolling sideways with editable arrows) and the look of its cards. */
function BrandListLookEditor({ value, onChange }: { value: BrandListLookValue; onChange: (patch: Partial<BrandListLookValue>) => void }) {
  const arrows = value.arrows;
  const setArrows = (patch: Partial<Arrows>) => onChange({ arrows: { ...arrows, ...patch } });
  return (
    <fieldset className="group stack">
      <legend>Layout &amp; card look</legend>
      <Select
        label="Layout"
        value={value.layout}
        onChange={(layout) => onChange({ layout })}
        options={[
          { value: 'grid', label: 'Rows of cards (scroll down, “View more”)' },
          { value: 'carousel', label: 'One row (scroll sideways with arrows)' },
        ]}
      />
      <div className="grid-fit">
        <Select label="Card style" value={value.cardStyle} onChange={(cardStyle) => onChange({ cardStyle })} options={CARD_STYLES.map((c) => ({ value: c, label: CARD_STYLE_LABELS[c] }))} />
        <Select label="Card size" value={value.cardSize} onChange={(cardSize) => onChange({ cardSize })} options={BRAND_CARD_SIZES.map((c) => ({ value: c, label: cap(c) }))} />
        <Select label="Corners" value={value.cardCorners} onChange={(cardCorners) => onChange({ cardCorners })} options={CARD_CORNERS.map((c) => ({ value: c, label: cap(c) }))} />
      </div>
      {value.layout === 'carousel' && (
        <div className="stack">
          <span className="field-label">Arrows</span>
          <div className="grid-fit">
            <NumberInput label="Size (px)" value={arrows.size} min={24} max={80} step={2} onChange={(v) => setArrows({ size: Math.min(80, Math.max(24, v ?? 44)) })} />
            <Select label="Shape" value={arrows.shape} onChange={(shape) => setArrows({ shape })} options={ARROW_SHAPES.map((a) => ({ value: a, label: cap(a) }))} />
            <Select label="Colour" value={arrows.color} onChange={(color) => setArrows({ color })} options={ARROW_COLORS.map((a) => ({ value: a, label: a === 'theme' ? 'Theme colour' : cap(a) }))} />
          </div>
          <div className="grid-fit">
            <IconSlotField label="Left arrow icon" value={arrows.prev} onChange={(prev) => setArrows({ prev })} />
            <IconSlotField label="Right arrow icon" value={arrows.next} onChange={(next) => setArrows({ next })} />
          </div>
        </div>
      )}
    </fieldset>
  );
}

/* ---------- Brand tabs ---------- */
export function BrandTabsEditor({ props, onChange, tag }: EditorProps<'brandTabs'>) {
  const parts = brandColorParts({ carousel: props.layout === 'carousel', search: false, filters: false, tabs: true });
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <TextInput label="Card button label" placeholder="e.g. Buy now" value={props.ctaLabel} maxLength={30} onChange={(ctaLabel) => onChange({ ctaLabel })} />
      <BrandListLookEditor value={props} onChange={onChange} />
      <PartColors parts={parts} value={props.colors} onChange={(colors) => onChange({ colors })} />
      <ListEditor
        label="Tabs"
        max={12}
        addLabel="Add tab"
        items={props.tabs}
        onChange={(tabs) => onChange({ tabs })}
        summary={(t) => `${t.emoji} ${t.label} · ${t.brands.length} brands`.trim()}
        createItem={() => ({ id: newId('t_'), label: 'New tab', emoji: '', brands: [] })}
        renderItem={(t, update) => (
          <>
            <div className="grid-2">
              <TextInput label="Tab label" value={t.label} maxLength={40} onChange={(label) => update({ label })} />
              <TextInput label="Emoji" value={t.emoji} maxLength={8} onChange={(emoji) => update({ emoji })} />
            </div>
            <BrandPicker label="Brands in this tab" max={60} value={t.brands} onChange={(brands) => update({ brands })} />
          </>
        )}
      />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <IconSlotField label="Icon before the discount" value={props.discountIcon} onChange={(discountIcon) => onChange({ discountIcon })} />
          <IconSlotField label="Icon after the card button text" value={props.ctaIcon} onChange={(ctaIcon) => onChange({ ctaIcon })} />
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
      </fieldset>
    </div>
  );
}

/* ---------- Categories ---------- */
export function CategoriesEditor({ props, onChange, tag }: EditorProps<'categories'>) {
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <ListEditor
        label="Category tiles"
        max={24}
        addLabel="Add category"
        items={props.items}
        onChange={(items) => onChange({ items })}
        summary={(c) => c.label}
        createItem={() => ({ id: newId('c_'), label: '', image: emptyImage(), href: '' })}
        renderItem={(c, update) => (
          <>
            <TextInput label="Label" value={c.label} maxLength={60} onChange={(label) => update({ label })} />
            <HrefInput label="Link" placeholder="https://www.gyftr.com/category/fashion" value={c.href} onChange={(href) => update({ href })} />
            <ImageField label="Image" hint="Square, 400×400 px" value={c.image} onChange={(image) => update({ image })} />
          </>
        )}
      />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <IconSlotField label="Icon on a tile without an image" value={props.placeholderIcon} onChange={(placeholderIcon) => onChange({ placeholderIcon })} />
          <IconSlotField label="Icon after the tile label" value={props.linkIcon} onChange={(linkIcon) => onChange({ linkIcon })} />
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
      </fieldset>
    </div>
  );
}

/* ---------- Image banners ---------- */
export function ImageBannersEditor({ props, onChange, tag }: EditorProps<'imageBanners'>) {
  return (
    <div className="stack">
      <TextInput label="Heading (optional)" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <Select
        label="Banners per row (desktop)"
        value={String(props.columns) as '1' | '2' | '3'}
        onChange={(v) => onChange({ columns: Number(v) })}
        options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
      />
      <ListEditor
        label="Banners"
        max={12}
        addLabel="Add banner"
        items={props.items}
        onChange={(items) => onChange({ items })}
        summary={(b, i) => b.desktopImage.alt || `Banner ${i + 1}`}
        createItem={() => ({ id: newId('b_'), desktopImage: emptyImage(), mobileImage: emptyImage(), href: '' })}
        renderItem={(b, update) => (
          <>
            <ImageField label="Desktop image" value={b.desktopImage} onChange={(desktopImage) => update({ desktopImage })} />
            <ImageField label="Mobile image (optional)" value={b.mobileImage} onChange={(mobileImage) => update({ mobileImage })} />
            <HrefInput label="Link" value={b.href} onChange={(href) => update({ href })} />
          </>
        )}
      />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
      </fieldset>
    </div>
  );
}

/* ---------- Rich text ---------- */
export function RichTextSectionEditor({ props, onChange, tag }: EditorProps<'richText'>) {
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <RichTextEditor label="Content" hint="Great for SEO copy. Use H2/H3 for sub-headings." value={props.body} onChange={(body) => onChange({ body })} />
      <div className="grid-2">
        <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
        <Field label="Long content">
          <Toggle label="Collapse with “Read more”" checked={props.collapsible} onChange={(collapsible) => onChange({ collapsible })} />
        </Field>
      </div>
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <IconSlotField label="Icon before the heading" value={props.headingIcon} onChange={(headingIcon) => onChange({ headingIcon })} />
          <Toggle label="Coloured mark before the heading" checked={props.showMark} onChange={(showMark) => onChange({ showMark })} />
      </fieldset>
    </div>
  );
}

/* ---------- FAQ ---------- */
export function FaqEditor({ props, onChange, tag }: EditorProps<'faq'>) {
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <fieldset className="group stack">
        <legend>Side panel (leave a field empty to hide it)</legend>
        <TextInput label="Small label above heading" value={props.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ eyebrow })} />
        <TextArea label="Intro text" value={props.intro} maxLength={300} onChange={(intro) => onChange({ intro })} />
        <div className="grid-2">
          <TextInput label="Help box title" value={props.helpTitle} maxLength={80} onChange={(helpTitle) => onChange({ helpTitle })} />
          <TextInput label="Help box text" value={props.helpText} maxLength={160} onChange={(helpText) => onChange({ helpText })} />
        </div>
        <HrefInput label="Help box link (optional)" value={props.helpHref} onChange={(helpHref) => onChange({ helpHref })} />
      </fieldset>
      <Toggle
        label="Add FAQ structured data (Google rich results)"
        checked={props.emitStructuredData}
        onChange={(emitStructuredData) => onChange({ emitStructuredData })}
      />
      {tag && (
        <div className="heading-field">
          <span />
          <TagSelect label="Question tag (all questions)" value={tag.itemLevel} onChange={tag.setItemLevel} allowH1={false} defaultLevel={3} />
        </div>
      )}
      <ListEditor
        label="Questions"
        max={50}
        addLabel="Add question"
        items={props.items}
        onChange={(items) => onChange({ items })}
        summary={(q) => q.question}
        createItem={() => ({ id: newId('q_'), question: '', answer: '' })}
        renderItem={(q, update) => (
          <>
            <TextInput label="Question" value={q.question} maxLength={300} onChange={(question) => update({ question })} />
            <RichTextEditor label="Answer" value={q.answer} onChange={(answer) => update({ answer })} />
          </>
        )}
      />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <IconSlotField label="Icon of the “Still have a question?” box" value={props.helpIcon} onChange={(helpIcon) => onChange({ helpIcon })} />
          <IconSlotField label="Open / close icon of each question" value={props.toggleIcon} onChange={(toggleIcon) => onChange({ toggleIcon })} />
          <Toggle label="Numbers (01, 02, …) before the questions" checked={props.showNumbers} onChange={(showNumbers) => onChange({ showNumbers })} />
          <Toggle label="Line under the heading" checked={props.showOrnament} onChange={(showOrnament) => onChange({ showOrnament })} />
      </fieldset>
      <PartColors parts={FAQ_PARTS} value={props.colors} onChange={(colors) => onChange({ colors })} />
    </div>
  );
}

/* ---------- Terms ---------- */
export function TermsEditor({ props, onChange, tag }: EditorProps<'terms'>) {
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <RichTextEditor
        label="Terms"
        hint="Use a numbered list for clauses. Tables and images can be added from the toolbar."
        value={props.body}
        tables
        images
        onChange={(body) => onChange({ body })}
      />
      <div className="row wrap" style={{ gap: 20 }}>
        <Toggle label="Collapsible" checked={props.collapsible} onChange={(collapsible) => onChange({ collapsible })} />
        {props.collapsible && <Toggle label="Open by default" checked={props.defaultOpen} onChange={(defaultOpen) => onChange({ defaultOpen })} />}
      </div>
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <IconSlotField label="Icon before the heading" value={props.headingIcon} onChange={(headingIcon) => onChange({ headingIcon })} />
          <IconSlotField label="Open / close icon" value={props.toggleIcon} onChange={(toggleIcon) => onChange({ toggleIcon })} />
      </fieldset>
    </div>
  );
}

/* ---------- CTA ---------- */
export function CtaEditor({ props, onChange, tag }: EditorProps<'cta'>) {
  return (
    <div className="stack">
      <HeadingInput value={props.heading} onChange={(heading) => onChange({ heading })} tag={tag} />
      <TextArea label="Text" value={props.text} maxLength={400} onChange={(text) => onChange({ text })} />
      <ButtonsEditor value={props.buttons} onChange={(buttons) => onChange({ buttons })} />
      <Select
        label="Buttons: position"
        value={props.buttonsAlign}
        onChange={(buttonsAlign) => onChange({ buttonsAlign })}
        options={ALIGNMENTS.map((a) => ({ value: a, label: ALIGN_LABELS[a] }))}
      />
      <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
      <ImageField label="Background image (optional)" value={props.backgroundImage} onChange={(backgroundImage) => onChange({ backgroundImage })} />
      <fieldset className="group stack">
        <legend>Icons &amp; decorations</legend>
          <Toggle label="Occasion artwork (when there is no background image)" checked={props.showArt} onChange={(showArt) => onChange({ showArt })} />
      </fieldset>
    </div>
  );
}

/* ---------- Buttons (a row of buttons, anywhere on the page) ---------- */
export function ButtonsSectionEditor({ props, onChange, tag }: EditorProps<'buttons'>) {
  return (
    <div className="stack">
      <ButtonsEditor value={props.buttons} onChange={(buttons) => onChange({ buttons })} />
      <Select label="Position" value={props.align} onChange={(align) => onChange({ align })} options={ALIGNMENTS.map((a) => ({ value: a, label: ALIGN_LABELS[a] }))} />
      <p className="field-hint" style={{ margin: 0 }}>
        Drag this section in the list on the left to place the buttons anywhere on the page.
      </p>
    </div>
  );
}
