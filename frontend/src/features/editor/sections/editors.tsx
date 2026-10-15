import { useId } from 'react';
import { DEFAULT_BRAND_FILTERS, MOTIFS, brandFilterLabel, brandMatchesFilter, type BrandFilter, type SectionProps, type SectionType } from '../../../contracts';
import { BrandPicker } from '../../../components/fields/BrandPicker';
import { IconItemsEditor } from '../../../components/fields/IconItemsEditor';
import { ImageField } from '../../../components/fields/ImageField';
import { RichTextEditor } from '../../../components/fields/RichTextEditor';
import { ListEditor } from '../../../components/fields/SortableList';
import { Button, Field, NumberInput, Select, TextArea, TextInput, Toggle } from '../../../components/ui';
import { newId } from '../../../lib/ids';
import { useBrandCategories, useBrandsByIds } from '../../../lib/queries';
import { HrefInput } from './HrefInput';

export interface EditorProps<T extends SectionType> {
  props: SectionProps<T>;
  onChange: (patch: Partial<SectionProps<T>>) => void;
}

const toneOptions = [
  { value: 'surface', label: 'White card' },
  { value: 'primary', label: 'Theme primary colour' },
  { value: 'accent', label: 'Theme accent colour' },
  { value: 'transparent', label: 'No background' },
] as const;

const emptyImage = () => ({ url: '', alt: '' });

/* ---------- Hero ---------- */
export function HeroEditor({ props, onChange }: EditorProps<'hero'>) {
  return (
    <div className="stack">
      <div className="grid-2">
        <Select
          label="Banner height"
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
            <ImageField label="Desktop banner" hint="Recommended 1920×600 px" value={s.desktopImage} onChange={(desktopImage) => update({ desktopImage })} />
            <ImageField label="Mobile banner" hint="Recommended 800×800 px. Falls back to desktop image." value={s.mobileImage} onChange={(mobileImage) => update({ mobileImage })} />
            <HrefInput label="Banner link" value={s.href} onChange={(href) => update({ href })} />
            <p className="field-hint">Text below is overlaid on the banner. Leave empty if the image already contains text.</p>
            <TextInput label="Eyebrow" value={s.eyebrow} maxLength={80} onChange={(eyebrow) => update({ eyebrow })} />
            <TextInput label="Heading" value={s.heading} maxLength={140} onChange={(heading) => update({ heading })} />
            <TextArea label="Sub-heading" value={s.subheading} maxLength={240} onChange={(subheading) => update({ subheading })} />
            <TextInput label="Button label" value={s.ctaLabel} maxLength={40} onChange={(ctaLabel) => update({ ctaLabel })} />
            <fieldset className="group stack">
              <legend>Creative (used when no banner image is uploaded)</legend>
              <Select
                label="Illustration"
                value={s.artwork}
                onChange={(artwork) => update({ artwork })}
                options={MOTIFS.map((m) => ({ value: m, label: m === 'auto' ? 'Same as page theme' : m.charAt(0).toUpperCase() + m.slice(1) }))}
              />
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
export function IntroEditor({ props, onChange }: EditorProps<'intro'>) {
  return (
    <div className="stack">
      <TextInput label="Eyebrow (small text above heading)" value={props.eyebrow} maxLength={80} onChange={(eyebrow) => onChange({ eyebrow })} />
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <RichTextEditor label="Body" value={props.body} onChange={(body) => onChange({ body })} />
      <div className="grid-2">
        <Select label="Alignment" value={props.align} onChange={(align) => onChange({ align })} options={[{ value: 'center', label: 'Centered' }, { value: 'left', label: 'Left' }]} />
        <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
      </div>
    </div>
  );
}

/* ---------- Features ---------- */
export function FeaturesEditor({ props, onChange }: EditorProps<'features'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <div className="grid-2">
        <NumberInput label="Columns (desktop)" value={props.columns} min={2} max={5} onChange={(v) => onChange({ columns: Math.min(5, Math.max(2, v ?? 4)) })} />
        <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
      </div>
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
    </div>
  );
}

/* ---------- Brand grid ---------- */
export function BrandGridEditor({ props, onChange }: EditorProps<'brandGrid'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <div className="grid-3">
        <Select label="Layout" value={props.layout} onChange={(layout) => onChange({ layout })} options={[{ value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Carousel (scroll)' }]} />
        <NumberInput label="Show before “View more”" value={props.initialCount} min={4} max={60} onChange={(v) => onChange({ initialCount: Math.min(60, Math.max(4, v ?? 12)) })} />
        <TextInput label="Card button label" placeholder="e.g. Buy now" value={props.ctaLabel} maxLength={30} onChange={(ctaLabel) => onChange({ ctaLabel })} />
      </div>
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

/* ---------- Brand tabs ---------- */
export function BrandTabsEditor({ props, onChange }: EditorProps<'brandTabs'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <TextInput label="Sub-heading" value={props.subheading} maxLength={300} onChange={(subheading) => onChange({ subheading })} />
      <TextInput label="Card button label" placeholder="e.g. Buy now" value={props.ctaLabel} maxLength={30} onChange={(ctaLabel) => onChange({ ctaLabel })} />
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
    </div>
  );
}

/* ---------- Categories ---------- */
export function CategoriesEditor({ props, onChange }: EditorProps<'categories'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
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
    </div>
  );
}

/* ---------- Image banners ---------- */
export function ImageBannersEditor({ props, onChange }: EditorProps<'imageBanners'>) {
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
    </div>
  );
}

/* ---------- Rich text ---------- */
export function RichTextSectionEditor({ props, onChange }: EditorProps<'richText'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <RichTextEditor label="Content" hint="Great for SEO copy. Use H2/H3 for sub-headings." value={props.body} onChange={(body) => onChange({ body })} />
      <div className="grid-2">
        <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
        <Field label="Long content">
          <Toggle label="Collapse with “Read more”" checked={props.collapsible} onChange={(collapsible) => onChange({ collapsible })} />
        </Field>
      </div>
    </div>
  );
}

/* ---------- FAQ ---------- */
export function FaqEditor({ props, onChange }: EditorProps<'faq'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
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
    </div>
  );
}

/* ---------- Terms ---------- */
export function TermsEditor({ props, onChange }: EditorProps<'terms'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
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
    </div>
  );
}

/* ---------- CTA ---------- */
export function CtaEditor({ props, onChange }: EditorProps<'cta'>) {
  return (
    <div className="stack">
      <TextInput label="Heading" value={props.heading} maxLength={160} onChange={(heading) => onChange({ heading })} />
      <TextArea label="Text" value={props.text} maxLength={400} onChange={(text) => onChange({ text })} />
      <div className="grid-2">
        <TextInput label="Button label" value={props.button.label} maxLength={80} onChange={(label) => onChange({ button: { ...props.button, label } })} />
        <HrefInput label="Button link" value={props.button.href} onChange={(href) => onChange({ button: { ...props.button, href } })} />
      </div>
      <Select label="Background" value={props.tone} onChange={(tone) => onChange({ tone })} options={toneOptions} />
      <ImageField label="Background image (optional)" value={props.backgroundImage} onChange={(backgroundImage) => onChange({ backgroundImage })} />
    </div>
  );
}
