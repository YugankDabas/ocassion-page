import { useState } from 'react';
import { ICONS, type IconSlot } from '../../contracts';
import { Select } from '../ui';
import { ImageField } from './ImageField';

/** "arrowRight" → "Arrow right". */
const iconLabel = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);
export const ICON_OPTIONS = ICONS.map((i) => ({ value: i, label: iconLabel(i) }));

/**
 * One icon a section draws (heading icon, button arrow, toggle, ...): a built-in icon, "None", or an
 * uploaded image that replaces it. The image picker opens on demand to keep the panel short.
 */
export function IconSlotField({ label, value, onChange }: { label: string; value: IconSlot; onChange: (value: IconSlot) => void }) {
  const [withImage, setWithImage] = useState(Boolean(value.image.url));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Select
        label={label}
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        options={[{ value: 'none' as const, label: 'None (no icon)' }, ...ICON_OPTIONS]}
        disabled={Boolean(value.image.url)}
        hint={value.image.url ? 'Your image is used instead.' : undefined}
      />
      {withImage || value.image.url ? (
        <ImageField
          label={`${label}: your own image`}
          hint="Replaces the icon. Square PNG / WebP / SVG-like artwork, about 96×96 px. Remove it to use the icon again."
          value={value.image}
          onChange={(image) => onChange({ ...value, image })}
        />
      ) : (
        <button type="button" className="link-btn" onClick={() => setWithImage(true)}>
          Use your own image instead
        </button>
      )}
    </div>
  );
}
