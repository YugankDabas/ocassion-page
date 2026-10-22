import { BACKGROUND_PATTERNS, CORNER_STYLES, HEADING_FONTS, MOTIFS, type Theme } from '../../contracts';
import { ImageField } from '../../components/fields/ImageField';
import { ColorInput, Select } from '../../components/ui';

const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'onPrimary', label: 'Text on primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent (discount badges)' },
  { key: 'background', label: 'Page background' },
  { key: 'surface', label: 'Cards' },
  { key: 'text', label: 'Text' },
  { key: 'mutedText', label: 'Muted text' },
];

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ThemeSwatches({ theme }: { theme: Theme }) {
  return (
    <span className="swatches" aria-hidden>
      {[theme.primary, theme.secondary, theme.accent, theme.background].map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

export function ThemeEditor({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  const set = <K extends keyof Theme>(key: K, v: Theme[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="stack">
      <div className="grid-2">
        {COLOR_FIELDS.map((f) => (
          <ColorInput key={f.key} label={f.label} value={value[f.key] as string} onChange={(v) => set(f.key, v as never)} />
        ))}
      </div>
      <div className="grid-3">
        <Select label="Heading font" value={value.headingFont} onChange={(v) => set('headingFont', v)} options={HEADING_FONTS.map((f) => ({ value: f, label: label(f) }))} />
        <Select
          label="Background pattern"
          value={value.pattern}
          onChange={(v) => set('pattern', v)}
          options={BACKGROUND_PATTERNS.map((f) => ({ value: f, label: f === 'none' ? 'None (plain colour)' : label(f) }))}
        />
        <Select label="Corners" value={value.corners} onChange={(v) => set('corners', v)} options={CORNER_STYLES.map((f) => ({ value: f, label: label(f) }))} />
      </div>
      <fieldset className="group stack">
        <legend>Page background image (optional)</legend>
        <ImageField
          label="Image"
          hint="Shown behind the whole page, over the page background colour and under the pattern (choose “None” above for no pattern). A section can have its own background too (Section → Background)."
          value={value.backgroundImage}
          onChange={(img) => set('backgroundImage', img)}
        />
        {value.backgroundImage.url && (
          <Select
            label="Image fit"
            value={value.backgroundFit}
            onChange={(v) => set('backgroundFit', v)}
            options={[
              { value: 'cover', label: 'Fill the page (edges may be hidden)' },
              { value: 'contain', label: 'Show the whole image' },
              { value: 'repeat', label: 'Repeat as a pattern' },
            ]}
          />
        )}
      </fieldset>
      <Select
        label="Artwork"
        value={value.motif}
        onChange={(v) => set('motif', v)}
        options={MOTIFS.map((m) => ({ value: m, label: m === 'auto' ? 'Auto (match the pattern)' : label(m) }))}
        hint="Illustrations used in the banner, gift card and decorations when no banner image is uploaded."
      />
      <div
        className="card card-body"
        style={{ background: value.background, color: value.text, borderRadius: value.corners === 'sharp' ? 2 : value.corners === 'round' ? 18 : 10 }}
      >
        <div style={{ background: value.primary, color: value.onPrimary, padding: 12, borderRadius: 8, fontWeight: 700 }}>Preview heading</div>
        <p style={{ color: value.mutedText, margin: '10px 0' }}>Muted body text on the page background.</p>
        <span style={{ background: value.accent, color: '#fff', padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Save 12%</span>{' '}
        <span style={{ background: value.secondary, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Secondary</span>
      </div>
    </div>
  );
}
