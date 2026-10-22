import { useEffect, useRef, useState } from 'react';
import { fitsSize, isSafeImageSrc, sizeOfImage, type Image, type Size } from '../../contracts';
import { Button, Field, Modal } from '../ui';
import { MediaLibrary } from './MediaLibrary';

/** The largest an upload is kept: bigger images are scaled down to fit 2560 × 2560 px. */
export const MAX_UPLOAD_SIDE = 2560;

interface Props {
  label: string;
  value: Image;
  onChange: (value: Image) => void;
  hint?: string;
  /** Only an image of exactly this size can be used (a banner). */
  size?: Size;
  /** Use an image of another size and make its size the banner size (one change, so neither is lost). */
  onUseSize?: (image: Image) => void;
  /** Whether the banner size may become this size (no other banner uses the current one). */
  canUseSize?: (size: Size) => boolean;
}

type Measured = { url: string; width: number; height: number } | { url: string; failed: true };

/** The real size of an image address, measured in the browser (images saved without their size, or typed in). */
function measure(url: string): Promise<Measured> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { url, width: img.naturalWidth, height: img.naturalHeight } : { url, failed: true });
    img.onerror = () => resolve({ url, failed: true });
    img.src = url;
  });
}

const px = (s: { width: number; height: number }) => `${s.width}×${s.height} px`;

/** Pick from the media library, upload, or paste an image URL — plus alt text. With a `size`, only images of that size are taken. */
export function ImageField({ label, value, onChange, hint, size, onUseSize, canUseSize }: Props) {
  const [open, setOpen] = useState(false);
  /** An image of the wrong size picked in the library: shown with what to do instead of being used. */
  const [refused, setRefused] = useState<Image | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const invalid = value.url !== '' && !isSafeImageSrc(value.url);

  // Late results (an image still loading) apply to what the field holds by then, never to an older value.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  /** The address last typed in (not picked from the library). */
  const typedUrl = useRef<string | null>(null);

  const known = value.width && value.height ? { width: value.width, height: value.height } : undefined;
  const needsMeasuring = !!size && !!value.url && !invalid && !known;
  useEffect(() => {
    if (!needsMeasuring) return;
    let live = true;
    void measure(value.url).then((m) => {
      if (!live) return;
      setMeasured(m);
      // A typed-in address keeps its measured size, so the size check also holds when the page is published.
      const { value: now, onChange: change } = latest.current;
      if ('width' in m && now.url === m.url && !now.width && typedUrl.current === m.url) change({ ...now, width: m.width, height: m.height });
    });
    return () => {
      live = false;
    };
  }, [needsMeasuring, value.url]);

  const actual = known ?? (measured && measured.url === value.url && 'width' in measured ? measured : undefined);
  const failed = needsMeasuring && measured?.url === value.url && 'failed' in measured;
  const wrongSize = !!size && !!value.url && !!actual && !fitsSize(actual, size);

  const pick = (image: Image) => {
    if (size && !fitsSize(image, size)) {
      setRefused(image);
      return;
    }
    onChange(image);
    setRefused(null);
    setOpen(false);
  };

  const sizeFix = (image: Image) => {
    const asSize = sizeOfImage(image);
    if (!size || !onUseSize) return null;
    if (!asSize) return <p className="field-hint">This image is too small to be a banner (at least 50×20 px).</p>;
    if (Math.max(asSize.width, asSize.height) > MAX_UPLOAD_SIDE) return <p className="field-hint">This image is too large to be a banner size (at most {MAX_UPLOAD_SIDE} px a side).</p>;
    if (canUseSize && !canUseSize(asSize))
      return <p className="field-hint">Other slides use {px(size)} images, so the banner size can only change once they are removed or replaced.</p>;
    return (
      <Button
        size="sm"
        onClick={() => {
          onUseSize({ ...image, alt: image.alt || value.alt });
          setRefused(null);
          setOpen(false);
        }}
      >
        Use it and set the banner size to {px(asSize)}
      </Button>
    );
  };

  const fieldError = invalid
    ? 'Use an https:// image URL'
    : failed
      ? 'This address does not open as an image'
      : wrongSize && actual && size
        ? `This image is ${px(actual)}, but the banner size is ${px(size)}. Choose a ${px(size)} image or change the banner size.`
        : undefined;

  return (
    <Field label={label} hint={hint} error={fieldError}>
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
            onChange={(e) => {
              typedUrl.current = e.target.value;
              onChange({ ...value, url: e.target.value, width: undefined, height: undefined });
            }}
          />
          <input
            className="input"
            placeholder="Alt text (describe the image for accessibility & SEO)"
            value={value.alt}
            maxLength={200}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
          <div className="row">
            <Button
              size="sm"
              onClick={() => {
                setRefused(null);
                setOpen(true);
              }}
            >
              Choose / upload
            </Button>
            {value.url && (
              <Button size="sm" variant="ghost" onClick={() => onChange({ url: '', alt: '' })}>
                Remove
              </Button>
            )}
          </div>
          {wrongSize && actual && sizeFix({ ...value, width: actual.width, height: actual.height })}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Select image · ${label}`} size="xl">
        <div className="stack">
          {size && !refused && <div className="alert alert-info">Only {px(size)} images can be used here.</div>}
          {size && refused?.width && refused.height && (
            <div className="alert alert-danger stack" style={{ gap: 8 }}>
              <span>
                This image is {px({ width: refused.width, height: refused.height })}, so it can’t be used: this banner needs {px(size)} images.
                {Math.max(refused.width, refused.height) === MAX_UPLOAD_SIDE && ' Uploads larger than 2560 px are scaled down to fit 2560 px.'}
              </span>
              <div className="row">{sizeFix(refused)}</div>
            </div>
          )}
          <MediaLibrary
            selectedUrl={value.url}
            requiredSize={size}
            onSelect={(m) => pick({ url: m.url, alt: value.alt || m.alt, width: m.width, height: m.height })}
          />
        </div>
      </Modal>
    </Field>
  );
}
