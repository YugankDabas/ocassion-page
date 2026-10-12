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
import { useBrandCategories, useBrands, useConfig, useDeleteBrand, useImportBrands, useSaveBrand } from '../../lib/queries';
import type { Brand } from '../../lib/types';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

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
  const canWrite = auth.can('brands.write');

  return (
    <>
      <PageHeader
        title="Brands"
        description="The brand library used by every occasion page. Discounts and voucher-page links changed here update all live pages."
        actions={
          canWrite && (
            <>
              <Button onClick={() => setImporting(true)}>Import CSV</Button>
              <Button variant="primary" onClick={() => setEditing('new')}>
                + Add brand
              </Button>
            </>
          )
        }
      />
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
            Add brands one by one or import a CSV.
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
                            <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}>
                              Delete
                            </Button>
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

function BrandFormModal({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const save = useSaveBrand();
  const config = useConfig();
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
  const [errors, setErrors] = useState<Record<string, string[]>>({});
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

  const submit = async () => {
    const parsed = brandInputSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    try {
      await save.mutateAsync({ id: brand?.id, input: parsed.data });
      toast.success(brand ? 'Brand updated — live pages refresh shortly' : 'Brand added');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    }
  };

  return (
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
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            Save brand
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <TextInput label="Brand name" value={form.name} maxLength={120} onChange={(v) => set('name', v)} error={errors.name} />
          <TextInput
            label="Slug"
            value={form.slug}
            maxLength={120}
            onChange={(v) => {
              slugTouched.current = true;
              set('slug', v.toLowerCase());
            }}
            error={errors.slug}
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
