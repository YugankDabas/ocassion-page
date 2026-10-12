import { useState } from 'react';
import { isSafeImageSrc, type Image } from '../../contracts';
import { Button, Field, Modal } from '../ui';
import { MediaLibrary } from './MediaLibrary';

interface Props {
  label: string;
  value: Image;
  onChange: (value: Image) => void;
  hint?: string;
}

/** Pick from the media library, upload, or paste an image URL — plus alt text. */
export function ImageField({ label, value, onChange, hint }: Props) {
  const [open, setOpen] = useState(false);
  const invalid = value.url !== '' && !isSafeImageSrc(value.url);

  return (
    <Field label={label} hint={hint} error={invalid ? 'Use an https:// image URL' : undefined}>
      <div className="image-field">
        <div
          className="image-preview"
          style={value.url && !invalid ? { backgroundImage: `url("${value.url.replace(/"/g, '%22')}")` } : undefined}
        >
          {!value.url && 'No image'}
        </div>
        <div className="grow stack" style={{ gap: 6 }}>
          <input
            className="input"
            placeholder="https://… or choose from library"
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value, width: undefined, height: undefined })}
          />
          <input
            className="input"
            placeholder="Alt text (describe the image for accessibility & SEO)"
            value={value.alt}
            maxLength={200}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
          <div className="row">
            <Button size="sm" onClick={() => setOpen(true)}>
              Choose / upload
            </Button>
            {value.url && (
              <Button size="sm" variant="ghost" onClick={() => onChange({ url: '', alt: '' })}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Select image · ${label}`} size="xl">
        <MediaLibrary
          selectedUrl={value.url}
          onSelect={(m) => {
            onChange({ url: m.url, alt: value.alt || m.alt, width: m.width, height: m.height });
            setOpen(false);
          }}
        />
      </Modal>
    </Field>
  );
}
