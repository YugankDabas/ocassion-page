import { useId, useState } from 'react';
import { BUTTON_SIZES, BUTTON_STYLES, HEX_COLOR, type Button, type ColorBox, type ColorRole, type Size } from '../../../contracts';
import { IconSlotField } from '../../../components/fields/IconSlotField';
import { ListEditor } from '../../../components/fields/SortableList';
import { MAX_UPLOAD_SIDE } from '../../../components/fields/ImageField';
import { Button as UiButton, Field, Select, TextInput, Toggle, useDraftText } from '../../../components/ui';
import { newId } from '../../../lib/ids';
import { HrefInput } from './HrefInput';

const STYLE_LABELS: Record<(typeof BUTTON_STYLES)[number], string> = {
  theme: 'Theme colour',
  gyftr: 'GyFTR green',
  light: 'White',
  dark: 'Dark',
  outline: 'Outline',
};
const SIZE_LABELS: Record<(typeof BUTTON_SIZES)[number], string> = { small: 'Small', medium: 'Medium', large: 'Large' };

/** A list of buttons: text, link, look, size, icon and new tab. Drag to reorder. */
export function ButtonsEditor({ label = 'Buttons', value, onChange, max = 6 }: { label?: string; value: Button[]; onChange: (buttons: Button[]) => void; max?: number }) {
  return (
    <ListEditor
      label={label}
      max={max}
      addLabel="Add button"
      items={value}
      onChange={onChange}
      summary={(b) => `${b.label || 'Button'} · ${STYLE_LABELS[b.style]}`}
      createItem={(): Button => ({
        id: newId('b_'),
        label: 'Shop now',
        href: '',
        style: value.length ? 'outline' : 'theme',
        size: 'medium',
        icon: { name: 'arrowRight', image: { url: '', alt: '' } },
        newTab: false,
      })}
      renderItem={(b, update) => (
        <div className="stack">
          <div className="grid-2">
            <TextInput label="Text" value={b.label} maxLength={40} onChange={(label) => update({ label })} />
            <HrefInput label="Link" value={b.href} onChange={(href) => update({ href })} />
          </div>
          <div className="grid-2">
            <Select label="Look" value={b.style} onChange={(style) => update({ style })} options={BUTTON_STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }))} />
            <Select label="Size" value={b.size} onChange={(size) => update({ size })} options={BUTTON_SIZES.map((s) => ({ value: s, label: SIZE_LABELS[s] }))} />
          </div>
          <IconSlotField label="Icon after the text" value={b.icon} onChange={(icon) => update({ icon })} />
          <Toggle label="Open the link in a new tab" checked={b.newTab} onChange={(newTab) => update({ newTab })} />
        </div>
      )}
    />
  );
}

export interface SizePreset {
  label: string;
  width: number;
  height: number;
}

export const DESKTOP_BANNER_SIZES: SizePreset[] = [
  { label: 'Standard', width: 1920, height: 600 },
  { label: 'Tall', width: 1920, height: 800 },
  { label: 'Strip', width: 1920, height: 400 },
  { label: 'Thin strip', width: 1920, height: 250 },
];
export const MOBILE_BANNER_SIZES: SizePreset[] = [
  { label: 'Square', width: 800, height: 800 },
  { label: 'Portrait', width: 800, height: 1000 },
  { label: 'Landscape', width: 800, height: 450 },
  { label: 'Strip', width: 800, height: 250 },
];

/**
 * A whole number of pixels. What is typed stays as typed (so 182 can be typed through 1 and 18); only a number
 * in range is taken, and leaving the field brings back the last one taken.
 */
function PixelInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const { text, setText, bind } = useDraftText(String(value));
  const n = Number(text);
  const valid = text !== '' && n >= min && n <= max;
  return (
    <TextInput
      label={label}
      inputMode="numeric"
      value={text}
      error={valid ? undefined : `${min}–${max} px`}
      onChange={(typed) => {
        const digits = typed.replace(/\D/g, '').slice(0, 4);
        setText(digits);
        const next = Number(digits);
        if (digits && next >= min && next <= max) onChange(next);
      }}
      {...bind}
    />
  );
}

/** An image size: one of the presets, or a custom width × height. The page shows the image in exactly this shape. */
export function SizeField({ label, value, presets, onChange }: { label: string; value: Size; presets: SizePreset[]; onChange: (size: Size) => void }) {
  const preset = presets.find((p) => p.width === value.width && p.height === value.height);
  const [custom, setCustom] = useState(!preset);
  const key = custom || !preset ? 'custom' : `${preset.width}x${preset.height}`;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Select
        label={label}
        value={key}
        onChange={(v) => {
          const next = presets.find((p) => `${p.width}x${p.height}` === v);
          setCustom(!next); // custom: keep the numbers, now editable
          if (next) onChange({ width: next.width, height: next.height });
        }}
        options={[...presets.map((p) => ({ value: `${p.width}x${p.height}`, label: `${p.label} · ${p.width}×${p.height} px` })), { value: 'custom', label: 'Custom size…' }]}
      />
      {key === 'custom' && (
        <>
          <div className="grid-2">
            <PixelInput label="Width (px)" value={value.width} min={50} max={MAX_UPLOAD_SIDE} onChange={(width) => onChange({ ...value, width })} />
            <PixelInput label="Height (px)" value={value.height} min={20} max={MAX_UPLOAD_SIDE} onChange={(height) => onChange({ ...value, height })} />
          </div>
          <p className="field-hint" style={{ margin: 0 }}>Up to {MAX_UPLOAD_SIDE} px: larger uploads are scaled down.</p>
        </>
      )}
    </div>
  );
}

/** The HTML tag of a section's headings, set next to the Heading field (it also sets the size). */
export interface HeadingTag {
  /** Hero banner: may use H1. Every other section: H2–H6. */
  isHero: boolean;
  level: number | undefined;
  setLevel: (level: number | undefined) => void;
  /** Card titles (highlights) / questions (FAQ). */
  itemLevel: number | undefined;
  setItemLevel: (level: number | undefined) => void;
}

/** A tag dropdown: Default (the section's own look), then H1 (hero only) … H6. */
export function TagSelect({ label = 'Tag', value, onChange, allowH1, defaultLevel }: { label?: string; value: number | undefined; onChange: (level: number | undefined) => void; allowH1: boolean; defaultLevel: number }) {
  return (
    <Select
      label={label}
      value={value ? String(value) : ''}
      onChange={(v) => onChange(v ? Number(v) : undefined)}
      options={[
        { value: '', label: `Default (H${defaultLevel})` },
        ...(allowH1 ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6]).map((n) => ({ value: String(n), label: `H${n}` })),
      ]}
    />
  );
}

/** The Heading text with its tag beside it. H1 is only offered in the hero banner (once per page). */
export function HeadingInput({
  value,
  onChange,
  tag,
  maxLength = 160,
  label = 'Heading',
}: {
  value: string;
  onChange: (value: string) => void;
  tag?: HeadingTag;
  maxLength?: number;
  label?: string;
}) {
  return (
    <div className="heading-field">
      <TextInput label={label} value={value} maxLength={maxLength} onChange={onChange} />
      {tag && <TagSelect value={tag.level} onChange={tag.setLevel} allowH1={tag.isHero} defaultLevel={tag.isHero ? 1 : 2} />}
    </div>
  );
}

/** "#abc" → "#aabbcc" (the colour picker only takes six digits). */
const sixDigits = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex);

/**
 * An optional colour: the picker, the hex code, and × back to "Default" (the page's own look). Only a whole colour
 * code is taken ("ff0000" gets its #), so a half-typed code never reaches the page; leaving the field shows the last one taken.
 */
export function ColorPick({ label, value, onChange, showLabel = false }: { label: string; value: string; onChange: (value: string) => void; showLabel?: boolean }) {
  const id = useId();
  const { text, setText, bind } = useDraftText(value);
  const control = (
    <div className={`color-pick ${value ? '' : 'is-default'}`}>
      <input type="color" aria-label={`${label}: pick a colour`} value={value ? sixDigits(value).toLowerCase() : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      <input
        id={id}
        className="input"
        aria-label={showLabel ? undefined : label}
        placeholder="Default"
        value={text}
        maxLength={7}
        onChange={(e) => {
          const typed = e.target.value.trim();
          setText(typed);
          const hex = typed && !typed.startsWith('#') ? `#${typed}` : typed;
          if (hex === '' || HEX_COLOR.test(hex)) onChange(hex.toLowerCase());
        }}
        {...bind}
      />
      {value && (
        <button type="button" className="icon-btn" aria-label={`${label}: back to default`} title="Back to default" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  );
  return showLabel ? (
    <Field label={label} htmlFor={id}>
      {control}
    </Field>
  ) : (
    control
  );
}

export interface ColorPart<K extends string> {
  key: K;
  label: string;
  /** Which colours this part has (a text-only part has no fill). */
  roles: readonly ColorRole[];
}

const ROLES: readonly ColorRole[] = ['background', 'border', 'text'];
const ROLE_LABELS: Record<ColorRole, string> = { background: 'Fill', border: 'Border', text: 'Text / icon' };
const NO_COLORS: ColorBox = { background: '', border: '', text: '' };

/** The colours of a section's parts (cards, pills, arrows…): fill, border and text / icon per part. Empty = the page's own look. */
export function PartColors<K extends string>({ parts, value, onChange }: { parts: ColorPart<K>[]; value: Record<K, ColorBox>; onChange: (value: Record<K, ColorBox>) => void }) {
  const box = (key: K) => value[key] ?? NO_COLORS;
  const anySet = parts.some((p) => ROLES.some((r) => box(p.key)[r]));
  return (
    <fieldset className="group stack">
      <legend>Colours</legend>
      <p className="field-hint" style={{ margin: 0 }}>
        Leave a colour on Default to keep the page’s own look.
      </p>
      <div className="part-colors">
        {parts.map((p) => (
          <div key={p.key} className="part-colors-row">
            <span className="part-colors-label">{p.label}</span>
            <div className="part-colors-cells">
              {ROLES.filter((r) => p.roles.includes(r)).map((r) => (
                <div key={r} className="part-colors-cell">
                  <span className="part-colors-role" aria-hidden>
                    {ROLE_LABELS[r]}
                  </span>
                  <ColorPick
                    label={`${p.label} ${ROLE_LABELS[r].toLowerCase()}`}
                    value={box(p.key)[r]}
                    onChange={(v) => onChange({ ...value, [p.key]: { ...box(p.key), [r]: v } })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {anySet && (
        <div>
          <UiButton size="sm" variant="ghost" onClick={() => onChange(Object.fromEntries(Object.keys(value).map((k) => [k, NO_COLORS])) as Record<K, ColorBox>)}>
            Reset all colours to default
          </UiButton>
        </div>
      )}
    </fieldset>
  );
}
