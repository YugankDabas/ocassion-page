import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { REDEMPTION_MODES, brandInputSchema, isSafeHref, type BrandInput } from '../../contracts';
import { BrandLogo, discountText } from '../../components/fields/BrandPicker';
import { ImageField } from '../../components/fields/ImageField';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Modal,
  NumberInput,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  TextInput,
  Toggle,
} from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  useBrandCategories,
  useBrandSync,
  useBrands,
  useConfig,
  useDeleteBrand,
  useImportBrands,
  useResetBrandToGyftr,
  useSaveBrand,
  useStartBrandSync,
} from '../../lib/queries';
import type { Brand, BrandSyncStatus } from '../../lib/types';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

/** Field names as the edit form labels them. */
const FIELD_LABELS: Record<keyof BrandInput, string> = {
  name: 'Brand name',
  slug: 'Slug',
  logoUrl: 'Logo',
  productUrl: 'Voucher page URL',
  discountPercent: 'Discount %',
  discountLabel: 'Discount label override',
  category: 'Category',
  redemption: 'Redeemable',
  minDenomination: 'Starting denomination',
  isActive: 'Active',
};
/** Fields refreshed from GyFTR on every sync, unless changed by hand. */
const SYNCED_FIELDS: (keyof BrandInput)[] = ['name', 'logoUrl', 'discountPercent', 'redemption', 'isActive'];
const fieldList = (fields: string[]) => fields.map((f) => FIELD_LABELS[f as keyof BrandInput] ?? f).join(', ');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function BrandsPage() {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const brands = useBrands({ search, category, active: active || undefined, page, pageSize: 25 });
  const categories = useBrandCategories();
  const [editing, setEditing] = useState<Brand | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const [importing, setImporting] = useState(false);
  const del = useDeleteBrand();
  const sync = useBrandSync();
  const startSync = useStartBrandSync();
  const canWrite = auth.can('brands.write');
  const syncing = Boolean(sync.data?.running) || startSync.isPending;

  return (
    <>
      <PageHeader
        title="Brands"
        description="The brand library used by every occasion page. Brands, logos and discounts are fetched from GyFTR every time someone signs in; changes here update all live pages."
        actions={
          canWrite && (
            <>
              <Button loading={syncing} onClick={() => startSync.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
                ⟳ Sync from GyFTR
              </Button>
              <Button onClick={() => setImporting(true)}>Import CSV</Button>
              <Button variant="primary" onClick={() => setEditing('new')}>
                + Add brand
              </Button>
            </>
          )
        }
      />
      <SyncStatusLine status={sync.data} syncing={syncing} />
      <div className="toolbar">
        <div className="field">
          <label className="field-label" htmlFor="brand-search">
            Search
          </label>
          <input id="brand-search" className="input" placeholder="Brand name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select
          label="Category"
          value={category}
          onChange={(v) => { setCategory(v); setPage(1); }}
          options={[{ value: '', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c, label: c }))]}
        />
        <Select
          label="Status"
          value={active}
          onChange={(v) => { setActive(v); setPage(1); }}
          options={[{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
        />
      </div>
      <div className="card">
        {brands.isLoading ? (
          <Spinner />
        ) : !brands.data?.items.length ? (
          <EmptyState title="No brands found" action={canWrite && <Button variant="primary" onClick={() => setEditing('new')}>Add a brand</Button>}>
            Brands are fetched from GyFTR when you sign in. You can also add them one by one or import a CSV.
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Brand</th>
                    <th>Voucher page (click-through)</th>
                    <th>Discount</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {brands.data.items.map((b) => (
                    <tr key={b.id}>
                      <td style={{ width: 56 }}>
                        <BrandLogo brand={b} />
                      </td>
                      <td>
                        <strong>{b.name}</strong>
                        <div className="muted small">{b.redemption.toLowerCase()}</div>
                        <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {b.gyftrId !== null ? <Badge tone="info">GyFTR</Badge> : <Badge>added by hand</Badge>}
                          {b.manualFields.length > 0 && (
                            <span title={`Changed by hand, not updated from GyFTR: ${fieldList(b.manualFields)}`}>
                              <Badge tone="warning">edited by hand</Badge>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="small">
                        <a href={b.productUrl} target="_blank" rel="noopener noreferrer">
                          {b.productUrl.replace(/^https?:\/\//, '')}
                        </a>
                      </td>
                      <td>{discountText(b) || '—'}</td>
                      <td>{b.category || '—'}</td>
                      <td>{b.isActive ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}</td>
                      <td className="actions">
                        {canWrite && (
                          <>
                            <Button size="sm" onClick={() => setEditing(b)}>
                              Edit
                            </Button>
                            {/* A GyFTR brand would come back with the next sync; it is switched to inactive instead. */}
                            {b.gyftrId === null && (
                              <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}>
                                Delete
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={25} total={brands.data.total} onChange={setPage} />
          </>
        )}
      </div>
      {editing && <BrandFormModal brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ImportModal open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete brand?"
        danger
        confirmLabel="Delete"
        loading={del.isPending}
        message={
          <p>
            “{deleting?.name}” will disappear from every page that uses it. To hide it temporarily, edit it and switch it to inactive instead.
          </p>
        }
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Brand deleted');
              setDeleting(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  );
}

/** Result of the last sync from GyFTR (or that one is running). */
function SyncStatusLine({ status, syncing }: { status: BrandSyncStatus | undefined; syncing: boolean }) {
  if (syncing) return <div className="alert alert-info sync-status">Fetching brands from GyFTR… the list updates by itself when it’s done.</div>;
  if (!status?.finishedAt) return null;
  const r = status.result;
  if (status.error || !r) {
    return (
      <div className="alert alert-warning sync-status">
        The last sync from GyFTR failed ({when(status.finishedAt)}): {status.error}. The brands below are from the previous sync.
      </div>
    );
  }
  return (
    <div className={`alert ${r.detailsFailed ? 'alert-warning' : 'alert-info'} sync-status`}>
      Synced from GyFTR {when(status.finishedAt)}: {r.listed} brands — {r.created} new, {r.updated} updated, {r.unchanged} unchanged
      {r.deactivated > 0 && `, ${r.deactivated} no longer listed (set inactive)`}.
      {r.detailsFailed > 0 && ` The discount and redemption of ${r.detailsFailed} could not be fetched; they keep their previous values.`}
    </div>
  );
}

function BrandFormModal({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const save = useSaveBrand();
  const reset = useResetBrandToGyftr();
  const config = useConfig();
  const synced = brand !== null && brand.gyftrId !== null;
  const gyftrOrigin = config.data ? new URL(config.data.publicBaseUrl).origin : 'https://www.gyftr.com';
  const [form, setForm] = useState<BrandInput>(() =>
    brand
      ? {
          name: brand.name,
          slug: brand.slug,
          logoUrl: brand.logoUrl,
          productUrl: brand.productUrl,
          discountPercent: brand.discountPercent,
          discountLabel: brand.discountLabel,
          category: brand.category,
          redemption: brand.redemption,
          minDenomination: brand.minDenomination,
          isActive: brand.isActive,
        }
      : {
          name: '',
          slug: '',
          logoUrl: '',
          productUrl: '',
          discountPercent: null,
          discountLabel: '',
          category: '',
          redemption: 'BOTH',
          minDenomination: null,
          isActive: true,
        },
  );
  const [initial] = useState(form);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirming, setConfirming] = useState<(keyof BrandInput)[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const slugTouched = useRef(Boolean(brand));
  const urlTouched = useRef(Boolean(brand));
  const set = <K extends keyof BrandInput>(k: K, v: BrandInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Suggest slug + voucher URL from the name for new brands.
  useEffect(() => {
    if (!slugTouched.current) set('slug', slugify(form.name));
  }, [form.name]);
  useEffect(() => {
    if (!urlTouched.current && form.slug) set('productUrl', `${gyftrOrigin}/${form.slug}`);
  }, [form.slug, gyftrOrigin]);

  // A GyFTR brand keeps GyFTR's slug (which may not follow our slug rules); it is not editable.
  const validate = () => {
    const parsed = brandInputSchema.safeParse(synced ? { ...form, slug: 'gyftr' } : form);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return null;
    }
    return { ...parsed.data, slug: synced ? form.slug : parsed.data.slug };
  };

  // Changes to an existing brand are confirmed first.
  const submit = () => {
    if (!validate()) return;
    if (!brand) return void persist();
    const changed = (Object.keys(FIELD_LABELS) as (keyof BrandInput)[]).filter((k) => form[k] !== initial[k]);
    if (!changed.length) {
      toast.info('Nothing was changed');
      return onClose();
    }
    setConfirming(changed);
  };

  const persist = async () => {
    const input = validate();
    if (!input) return;
    try {
      await save.mutateAsync({ id: brand?.id, input });
      toast.success(brand ? 'Brand updated — live pages refresh shortly' : 'Brand added');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setConfirming(null);
    }
  };

  const stopsSyncing = synced ? (confirming ?? []).filter((f) => SYNCED_FIELDS.includes(f) && !brand.manualFields.includes(f)) : [];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={brand ? `Edit ${brand.name}` : 'Add brand'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={submit}>
              Save brand
            </Button>
          </>
        }
      >
        <div className="stack">
          {synced && (
            <div className="alert alert-info">
              This brand comes from GyFTR: its name, logo, discount, redeemable and active status are refreshed every time someone signs in. A field you change
              here keeps your value and is no longer updated from GyFTR.
            </div>
          )}
          {synced && brand.manualFields.length > 0 && (
            <div className="alert alert-warning row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span>
                Changed by hand: <strong>{fieldList(brand.manualFields)}</strong>
              </span>
              <Button size="sm" onClick={() => setConfirmReset(true)}>
                Use GyFTR data again
              </Button>
            </div>
          )}
          <div className="grid-2">
            <TextInput label="Brand name" value={form.name} maxLength={120} onChange={(v) => set('name', v)} error={errors.name} />
            <TextInput
              label="Slug"
              value={form.slug}
              maxLength={120}
              disabled={synced}
              onChange={(v) => {
                slugTouched.current = true;
                set('slug', v.toLowerCase());
              }}
              error={errors.slug}
              hint={synced ? 'GyFTR’s slug; it can’t be changed.' : undefined}
            />
          </div>
          <TextInput
            label="Voucher page URL"
            value={form.productUrl}
            placeholder={`${gyftrOrigin}/amazon`}
            onChange={(v) => {
              urlTouched.current = true;
              set('productUrl', v.trim());
            }}
            error={errors.productUrl ?? (form.productUrl && !isSafeHref(form.productUrl) ? 'Enter a full https:// URL' : undefined)}
            hint="The gyftr.com brand page shoppers land on when they click this brand (where they buy the voucher)."
          />
          <ImageField label="Logo" hint="Transparent PNG/WebP, ~400×200 px" value={{ url: form.logoUrl, alt: form.name }} onChange={(img) => set('logoUrl', img.url)} />
          <div className="grid-2">
            <NumberInput label="Discount %" value={form.discountPercent} min={0} max={100} step={0.5} onChange={(v) => set('discountPercent', v)} hint="Shown as “Save X%”" />
            <TextInput label="Discount label override" value={form.discountLabel} maxLength={40} placeholder="e.g. Buy 1 Get 1" onChange={(v) => set('discountLabel', v)} />
            <TextInput label="Category" value={form.category} maxLength={60} placeholder="e.g. Fashion" onChange={(v) => set('category', v)} />
            <Select
              label="Redeemable"
              value={form.redemption}
              onChange={(v) => set('redemption', v)}
              options={REDEMPTION_MODES.map((m) => ({ value: m, label: m === 'BOTH' ? 'Online & in-store' : m === 'ONLINE' ? 'Online' : 'In-store' }))}
            />
            <NumberInput label="Starting denomination (₹)" value={form.minDenomination} min={0} onChange={(v) => set('minDenomination', v)} hint="Shown as “From ₹X”" />
          </div>
          <Toggle label="Active (shown on pages)" checked={form.isActive} onChange={(v) => set('isActive', v)} />
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming !== null}
        title="Save your changes?"
        confirmLabel="Yes, save"
        loading={save.isPending}
        message={
          <>
            <p>
              Are you sure you want to change <strong>{fieldList(confirming ?? [])}</strong> of “{brand?.name}”? Every live page showing this brand is updated.
            </p>
            {stopsSyncing.length > 0 && (
              <p>
                <strong>{fieldList(stopsSyncing)}</strong> will no longer be updated from GyFTR. “Use GyFTR data again” switches it back.
              </p>
            )}
          </>
        }
        onClose={() => setConfirming(null)}
        onConfirm={() => void persist()}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Use GyFTR data again?"
        confirmLabel="Yes, use GyFTR data"
        loading={reset.isPending}
        message={
          <p>
            {fieldList(brand?.manualFields ?? [])} of “{brand?.name}” will be replaced with GyFTR’s current values and kept up to date from GyFTR again.
          </p>
        }
        onClose={() => setConfirmReset(false)}
        onConfirm={() =>
          brand &&
          reset.mutate(brand.id, {
            onSuccess: () => {
              toast.success('The brand uses GyFTR data again');
              setConfirmReset(false);
              onClose();
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const imp = useImportBrands();
  const [file, setFile] = useState<File | null>(null);
  const result = imp.data;
  const sample =
    'name,slug,productUrl,logoUrl,discountPercent,discountLabel,category,redemption,minDenomination,isActive\n' +
    'Amazon Pay,amazon,https://www.gyftr.com/amazon,,0.5,,E-Commerce,ONLINE,100,true';
  const download = () => {
    const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brands-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        imp.reset();
        setFile(null);
        onClose();
      }}
      title="Import brands from CSV"
      size="md"
      footer={
        <Button variant="primary" disabled={!file} loading={imp.isPending} onClick={() => file && imp.mutate(file, { onError: (e) => toast.error(errorMessage(e)) })}>
          Import
        </Button>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          Brands are matched by <strong>slug</strong>: existing ones are updated, new ones created. Empty <span className="mono">productUrl</span> defaults to
          gyftr.com/&lt;slug&gt;. Max 2,000 rows.
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          Brands already come from GyFTR. For a GyFTR brand, a name, logo, discount, redeemable or active status the CSV changes counts as edited by hand and is
          no longer updated from GyFTR.
        </p>
        <div>
          <Button size="sm" variant="ghost" onClick={download}>
            ⬇ Download CSV template
          </Button>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {result && (
          <div className={`alert ${result.errors.length ? 'alert-warning' : 'alert-info'}`}>
            {result.created} created, {result.updated} updated, {result.errors.length} skipped.
            {result.errors.slice(0, 10).map((e) => (
              <div key={e.row}>
                Row {e.row}: {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
