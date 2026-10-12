import type { PageContent } from '../../contracts';
import { ImageField } from '../../components/fields/ImageField';
import { TextArea, TextInput, Toggle } from '../../components/ui';
import { HrefInput } from './sections/HrefInput';
import { ThemeEditor } from './ThemeEditor';

interface Props {
  title: string;
  pageUrl: string;
  publicBaseUrl: string;
  liveUrl: string | null;
  content: PageContent;
  onTitle: (v: string) => void;
  onPageUrl: (v: string) => void;
  onContent: (c: PageContent) => void;
}

export function PageSettingsPanel({ title, pageUrl, publicBaseUrl, liveUrl, content, onTitle, onPageUrl, onContent }: Props) {
  const seo = content.seo;
  const setSeo = (patch: Partial<typeof seo>) => onContent({ ...content, seo: { ...seo, ...patch } });
  const urlValid = pageUrl.startsWith(`${publicBaseUrl}/`) && /^[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(pageUrl.slice(publicBaseUrl.length + 1));
  const urlChanged = liveUrl !== null && liveUrl !== pageUrl.replace(/\/$/, '');

  return (
    <div className="stack">
      <fieldset className="group stack">
        <legend>Page</legend>
        <TextInput label="Internal title" value={title} maxLength={160} onChange={onTitle} hint="Shown in the admin panel and as the default breadcrumb." />
        <TextInput
          label="Page URL"
          value={pageUrl}
          onChange={onPageUrl}
          placeholder={`${publicBaseUrl}/diwali-gift-cards`}
          error={urlValid ? undefined : `Must be ${publicBaseUrl}/<lowercase-words-with-hyphens>`}
          hint={
            urlChanged
              ? `⚠ Currently live at ${liveUrl}. Publishing moves the page to the new URL — set up a redirect from the old URL.`
              : 'The gyftr.com address this page is published for. gyftr.com asks for the page by the last part of this URL.'
          }
        />
        <Toggle
          label="Show breadcrumb"
          checked={content.breadcrumb.show}
          onChange={(show) => onContent({ ...content, breadcrumb: { ...content.breadcrumb, show } })}
        />
        {content.breadcrumb.show && (
          <TextInput
            label="Breadcrumb label"
            placeholder={title}
            maxLength={80}
            value={content.breadcrumb.label}
            onChange={(label) => onContent({ ...content, breadcrumb: { ...content.breadcrumb, label } })}
          />
        )}
      </fieldset>

      <fieldset className="group stack">
        <legend>SEO</legend>
        <TextInput label="Meta title" value={seo.metaTitle} maxLength={70} onChange={(metaTitle) => setSeo({ metaTitle })} hint={`${seo.metaTitle.length}/70 · shown in Google results and browser tabs`} />
        <TextArea label="Meta description" value={seo.metaDescription} maxLength={170} onChange={(metaDescription) => setSeo({ metaDescription })} hint={`${seo.metaDescription.length}/170`} />
        <TextInput label="Keywords" value={seo.keywords} maxLength={300} onChange={(keywords) => setSeo({ keywords })} hint="Comma separated (optional)" />
        <HrefInput label="Canonical URL" value={seo.canonicalUrl} onChange={(canonicalUrl) => setSeo({ canonicalUrl })} hint="Leave empty to use the page URL." placeholder={pageUrl} />
        <ImageField label="Social share image" hint="1200×630 px. Falls back to the first hero banner." value={seo.ogImage} onChange={(ogImage) => setSeo({ ogImage })} />
        <Toggle label="Hide from search engines (noindex)" checked={seo.noIndex} onChange={(noIndex) => setSeo({ noIndex })} />
      </fieldset>

      <fieldset className="group">
        <legend>Theme</legend>
        <ThemeEditor value={content.theme} onChange={(theme) => onContent({ ...content, theme })} />
      </fieldset>
    </div>
  );
}
