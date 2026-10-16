import { useState } from 'react';
import { isSafeHref, type BrandRef } from '../../contracts';
import { useBrands, useBrandsByIds } from '../../lib/queries';
import type { Brand } from '../../lib/types';
import { Button, Modal, Spinner } from '../ui';
import { SortableContainer, useSortableItem } from './SortableList';

export function BrandLogo({ brand }: { brand: Pick<Brand, 'name' | 'logoUrl'> }) {
  return brand.logoUrl ? (
    <img className="thumb" src={brand.logoUrl} alt="" loading="lazy" />
  ) : (
    <span className="monogram" aria-hidden>
      {brand.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function discountText(b: Pick<Brand, 'discountLabel' | 'discountPercent'>): string {
  if (b.discountLabel) return b.discountLabel;
  return b.discountPercent !== null ? `Save ${b.discountPercent}%` : '';
}

/**
 * Ordered brand selection with drag-to-reorder, optional badge and optional
 * per-placement voucher URL override.
 */
export function BrandPicker({
  label,
  value,
  onChange,
  max = 200,
}: {
  label: string;
  value: BrandRef[];
  onChange: (refs: BrandRef[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const brands = useBrandsByIds(value.map((r) => r.brandId));
  const byId = new Map((brands.data ?? []).map((b) => [b.id, b]));
  const items = value.map((r) => ({ ...r, id: r.brandId }));
  const update = (brandId: string, patch: Partial<BrandRef>) =>
    onChange(value.map((r) => (r.brandId === brandId ? { ...r, ...patch } : r)));

  return (
    <div className="field">
      <div className="row-between">
        <span className="field-label">
          {label} <span className="muted">({value.length})</span>
        </span>
        <div className="row">
          {value.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              Clear
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            + Add brands
          </Button>
        </div>
      </div>
      {value.length === 0 ? (
        <p className="field-hint">No brands yet. Click “Add brands”, then drag to reorder.</p>
      ) : (
        <SortableContainer items={items} onReorder={(next) => onChange(next.map(({ id: _id, ...r }) => r))}>
          <div className="brand-chip-list">
            {value.map((ref) => (
              <BrandRow
                key={ref.brandId}
                refValue={ref}
                brand={byId.get(ref.brandId)}
                loading={brands.isLoading}
                onChange={(patch) => update(ref.brandId, patch)}
                onRemove={() => onChange(value.filter((r) => r.brandId !== ref.brandId))}
              />
            ))}
          </div>
        </SortableContainer>
      )}
      <BrandSearchModal
        open={open}
        onClose={() => setOpen(false)}
        selected={new Set(value.map((r) => r.brandId))}
        disabled={value.length >= max}
        onAdd={(b) => onChange([...value, { brandId: b.id, badge: '', href: '' }])}
        onRemove={(b) => onChange(value.filter((r) => r.brandId !== b.id))}
      />
    </div>
  );
}

function BrandRow({
  refValue,
  brand,
  loading,
  onChange,
  onRemove,
}: {
  refValue: BrandRef;
  brand?: Brand;
  loading: boolean;
  onChange: (patch: Partial<BrandRef>) => void;
  onRemove: () => void;
}) {
  const s = useSortableItem(refValue.brandId);
  const [showMore, setShowMore] = useState(Boolean(refValue.href));
  const hrefInvalid = refValue.href !== '' && !isSafeHref(refValue.href);
  return (
    <div ref={s.ref} style={s.style}>
      <div className="brand-row">
        <button type="button" className="drag-handle" aria-label="Reorder brand" {...s.handleProps}>
          ⠿
        </button>
        {brand ? <BrandLogo brand={brand} /> : <span className="monogram">?</span>}
        <div className="name">
          {brand ? brand.name : loading ? 'Loading…' : 'No longer in the brand list'}
          <small>
            {brand ? `${discountText(brand) || 'No discount'}${brand.isActive ? '' : ' · INACTIVE (hidden on site)'}` : loading ? '' : 'Not shown on the page. You can remove it.'}
          </small>
        </div>
        <input
          className="input"
          style={{ width: 120 }}
          placeholder="Badge e.g. Bestseller"
          maxLength={30}
          value={refValue.badge}
          onChange={(e) => onChange({ badge: e.target.value })}
          aria-label="Badge"
        />
        <button type="button" className="icon-btn" title="Custom link" aria-label="Custom link" onClick={() => setShowMore(!showMore)}>
          🔗
        </button>
        <button type="button" className="icon-btn" title="Remove" aria-label="Remove brand" onClick={onRemove}>
          ✕
        </button>
      </div>
      {showMore && (
        <div style={{ padding: '6px 0 4px 40px' }}>
          <input
            className="input"
            placeholder={brand ? `Voucher page URL override (default: ${brand.productUrl})` : 'Voucher page URL override'}
            value={refValue.href}
            onChange={(e) => onChange({ href: e.target.value })}
            aria-invalid={hrefInvalid}
          />
          {hrefInvalid && <p className="field-error">Enter a full https:// URL or a /path</p>}
        </div>
      )}
    </div>
  );
}

function BrandSearchModal({
  open,
  onClose,
  selected,
  disabled,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  selected: Set<string>;
  disabled: boolean;
  onAdd: (b: Brand) => void;
  onRemove: (b: Brand) => void;
}) {
  const [search, setSearch] = useState('');
  const results = useBrands({ search, active: 'true', pageSize: 50 });
  return (
    <Modal open={open} onClose={onClose} title="Add brands" size="md" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <input className="input" autoFocus placeholder="Search brands by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {results.isLoading ? (
        <Spinner />
      ) : (
        <div className="picker-results">
          {results.data?.items.map((b) => {
            const added = selected.has(b.id);
            return (
              <button
                type="button"
                key={b.id}
                className={`picker-result ${added ? 'added' : ''}`}
                onClick={() => (added ? onRemove(b) : !disabled && onAdd(b))}
              >
                <BrandLogo brand={b} />
                <span className="grow">
                  <strong>{b.name}</strong>
                  <br />
                  <span className="muted small">
                    {b.category || 'Uncategorised'} · {discountText(b) || 'No discount'}
                  </span>
                </span>
                <span className="badge badge-neutral">{added ? '✓ Added' : '+ Add'}</span>
              </button>
            );
          })}
          {results.data?.items.length === 0 && <p className="muted">No active brands match. Add brands under “Brands”.</p>}
        </div>
      )}
    </Modal>
  );
}
