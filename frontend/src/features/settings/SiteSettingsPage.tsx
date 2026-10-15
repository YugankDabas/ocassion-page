import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { siteSettingsSchema, type Link as LinkValue, type SiteSettings } from '../../contracts';
import { IconItemsEditor } from '../../components/fields/IconItemsEditor';
import { ImageField } from '../../components/fields/ImageField';
import { ListEditor } from '../../components/fields/SortableList';
import { Button, PageHeader, Spinner, TextArea, TextInput } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { newId } from '../../lib/ids';
import { useSaveSiteSettings, useSiteSettings } from '../../lib/queries';
import { HrefInput } from '../editor/sections/HrefInput';

type WithId<T> = T & { id: string };
const withIds = <T,>(items: T[]): WithId<T>[] => items.map((i) => ({ ...i, id: newId() }));
const stripIds = <T,>(items: WithId<T>[]): T[] => items.map(({ id: _id, ...rest }) => rest as T);

function LinksEditor({ label, links, onChange }: { label: string; links: WithId<LinkValue>[]; onChange: (l: WithId<LinkValue>[]) => void }) {
  return (
    <ListEditor
      label={label}
      items={links}
      onChange={onChange}
      addLabel="Add link"
      summary={(l) => `${l.label} → ${l.href}`}
      createItem={() => ({ id: newId(), label: '', href: '' })}
      renderItem={(l, update) => (
        <div className="grid-2">
          <TextInput label="Label" value={l.label} maxLength={80} onChange={(label) => update({ label })} />
          <HrefInput label="URL" value={l.href} onChange={(href) => update({ href })} />
        </div>
      )}
    />
  );
}

const LABEL_FIELDS: [keyof SiteSettings['labels'], string][] = [
  ['breadcrumbHome', 'Breadcrumb: home'],
  ['breadcrumbParent', 'Breadcrumb: section'],
  ['brandSearchPlaceholder', 'Brand search placeholder'],
  ['filterAll', 'Discount filter: all'],
  ['viewMore', '“View more” button'],
  ['noResults', 'No brands match'],
  ['comingSoon', 'Empty brand tab'],
  ['noDiscount', 'Brand without discount'],
  ['redeemOnline', 'Redeem: online'],
  ['redeemOffline', 'Redeem: in store'],
  ['redeemBoth', 'Redeem: both'],
  ['priceFrom', 'Price prefix'],
  ['readMore', '“Read more”'],
  ['readLess', '“Read less”'],
  ['cardBrandMark', 'Small text on every brand card (empty = none)'],
];

/** Header & footer shown around every occasion page (mirrors gyftr.com chrome). */
export function SiteSettingsPage() {
  const auth = useAuth();
  const settings = useSiteSettings();
  const save = useSaveSiteSettings();
  const [headerLinks, setHeaderLinks] = useState<WithId<LinkValue>[]>([]);
  const [columns, setColumns] = useState<WithId<{ title: string; links: WithId<LinkValue>[] }>[]>([]);
  const [form, setForm] = useState<SiteSettings | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setForm(settings.data);
    setHeaderLinks(withIds(settings.data.header.links));
    setColumns(settings.data.footer.columns.map((c) => ({ id: newId(), title: c.title, links: withIds(c.links) })));
  }, [settings.data]);

  if (settings.isLoading || !form) return <Spinner />;

  const submit = async () => {
    const value: SiteSettings = {
      header: { ...form.header, links: stripIds(headerLinks) },
      footer: { ...form.footer, columns: columns.map((c) => ({ title: c.title, links: stripIds(c.links) })) },
      labels: form.labels,
    };
    const parsed = siteSettingsSchema.safeParse(value);
    if (!parsed.success) return toast.error('Check the links: ' + parsed.error.issues.slice(0, 3).map((i) => i.message).join('; '));
    try {
      await save.mutateAsync(parsed.data);
      toast.success('Saved — all live pages refresh shortly');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const disabled = !auth.can('settings.write');
  return (
    <>
      <PageHeader
        title="Header & footer"
        description="Navigation shown on every occasion page so it matches the rest of gyftr.com."
        actions={!disabled && <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>Save</Button>}
      />
      <fieldset className="card card-body stack" disabled={disabled} style={{ border: 0 }}>
        <h2>Header</h2>
        <div className="grid-2">
          <ImageField
            label="Logo"
            hint="Leave empty to show a text wordmark"
            value={{ url: form.header.logoUrl, alt: 'GyFTR' }}
            onChange={(img) => setForm({ ...form, header: { ...form.header, logoUrl: img.url } })}
          />
          <HrefInput label="Logo link (home page)" value={form.header.homeUrl} onChange={(homeUrl) => setForm({ ...form, header: { ...form.header, homeUrl } })} />
        </div>
        <div className="grid-2">
          <TextInput
            label="Announcement strip"
            value={form.header.announcement}
            maxLength={160}
            hint="Thin bar above the header. Leave empty to hide."
            onChange={(announcement) => setForm({ ...form, header: { ...form.header, announcement } })}
          />
          <HrefInput
            label="Check voucher status URL"
            value={form.header.voucherStatusUrl}
            onChange={(voucherStatusUrl) => setForm({ ...form, header: { ...form.header, voucherStatusUrl } })}
          />
        </div>
        <div className="grid-3">
          <HrefInput label="Search URL prefix" value={form.header.searchUrl} onChange={(searchUrl) => setForm({ ...form, header: { ...form.header, searchUrl } })} hint="The search term is appended" />
          <HrefInput label="Cart URL" value={form.header.cartUrl} onChange={(cartUrl) => setForm({ ...form, header: { ...form.header, cartUrl } })} />
          <HrefInput
            label="Login URL"
            value={form.header.loginUrl.href}
            onChange={(href) => setForm({ ...form, header: { ...form.header, loginUrl: { ...form.header.loginUrl, href } } })}
          />
        </div>
        <div className="grid-3">
          <TextInput
            label="Voucher status button text"
            value={form.header.voucherStatusLabel}
            maxLength={40}
            onChange={(voucherStatusLabel) => setForm({ ...form, header: { ...form.header, voucherStatusLabel } })}
          />
          <TextInput
            label="Search box placeholder"
            value={form.header.searchPlaceholder}
            maxLength={60}
            onChange={(searchPlaceholder) => setForm({ ...form, header: { ...form.header, searchPlaceholder } })}
          />
          <TextInput
            label="Search button text"
            value={form.header.searchButtonLabel}
            maxLength={20}
            onChange={(searchButtonLabel) => setForm({ ...form, header: { ...form.header, searchButtonLabel } })}
          />
        </div>
        <TextInput
          label="Login button text"
          value={form.header.loginUrl.label}
          maxLength={80}
          onChange={(label) => setForm({ ...form, header: { ...form.header, loginUrl: { ...form.header.loginUrl, label } } })}
        />
        <LinksEditor label="Category navigation" links={headerLinks} onChange={setHeaderLinks} />
        <h2 style={{ marginTop: 12 }}>Footer</h2>
        <div className="grid-2">
          <ImageField
            label="Footer logo"
            hint="Leave empty to use the white GyFTR logo"
            value={{ url: form.footer.logoUrl, alt: 'GyFTR' }}
            onChange={(img) => setForm({ ...form, footer: { ...form.footer, logoUrl: img.url } })}
          />
          <TextArea label="Tagline under the logo" value={form.footer.tagline} maxLength={240} onChange={(tagline) => setForm({ ...form, footer: { ...form.footer, tagline } })} />
        </div>
        <IconItemsEditor label="Promise strip (top of footer)" items={form.footer.promises} onChange={(promises) => setForm({ ...form, footer: { ...form.footer, promises } })} />
        <ListEditor
          label="Footer columns"
          items={columns}
          onChange={setColumns}
          max={6}
          addLabel="Add column"
          summary={(c) => `${c.title} (${c.links.length} links)`}
          createItem={() => ({ id: newId(), title: '', links: [] })}
          renderItem={(c, update) => (
            <>
              <TextInput label="Column title" value={c.title} maxLength={60} onChange={(title) => update({ title })} />
              <LinksEditor label="Links" links={c.links} onChange={(links) => update({ links })} />
            </>
          )}
        />
        <TextInput label="Copyright line" value={form.footer.copyright} maxLength={200} onChange={(copyright) => setForm({ ...form, footer: { ...form.footer, copyright } })} />
        <h2 style={{ marginTop: 12 }}>Small texts</h2>
        <p className="field-hint">Short interface texts used on every page — buttons, placeholders and labels.</p>
        <div className="grid-3">
          {LABEL_FIELDS.map(([key, name]) => (
            <TextInput key={key} label={name} value={form.labels[key]} maxLength={120} onChange={(v) => setForm({ ...form, labels: { ...form.labels, [key]: v } })} />
          ))}
        </div>
      </fieldset>
    </>
  );
}
