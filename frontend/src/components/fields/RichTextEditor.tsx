import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useId, useState } from 'react';
import { isSafeHref } from '../../contracts';
import { Button, Modal } from '../ui';
import { MediaLibrary } from './MediaLibrary';

interface Props {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
  /** Adds table tools (insert table, rows, columns). */
  tables?: boolean;
  /** Adds an image button (media library, upload or https:// address). */
  images?: boolean;
}

/**
 * WYSIWYG editor producing a small, predictable HTML subset (headings, lists,
 * links, emphasis; tables and images where enabled). The server sanitises
 * again — this is UX, not security.
 */
export function RichTextEditor({ label, value, onChange, hint, tables = false, images = false }: Props) {
  const id = useId();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, codeBlock: false, code: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'], validate: (href) => isSafeHref(href) }),
      ...(tables ? [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell] : []),
      ...(images ? [Image.configure({ inline: false })] : []),
    ],
    content: value,
    editorProps: { attributes: { 'aria-labelledby': id } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  // Keep in sync when the value changes from outside (e.g. revision restore).
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="rte">
        {editor && <Toolbar editor={editor} tables={tables} images={images} />}
        <EditorContent editor={editor} className="rte-content" />
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function Toolbar({ editor, tables, images }: { editor: Editor; tables: boolean; images: boolean }) {
  const [picking, setPicking] = useState(false);
  const btn = (label: string, title: string, active: boolean, run: () => void) => (
    <button type="button" title={title} aria-label={title} aria-pressed={active} className={active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();
  const inTable = tables && editor.isActive('table');

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link URL (https://…, /path or #anchor). Leave empty to remove.', previous ?? 'https://');
    if (href === null) return;
    if (href.trim() === '') return void chain().extendMarkRange('link').unsetLink().run();
    if (!isSafeHref(href.trim())) return void window.alert('Only https:// links, /paths and #anchors are allowed.');
    const external = /^https?:\/\//.test(href) && !href.includes('gyftr.com');
    chain().extendMarkRange('link').setLink({ href: href.trim(), target: external ? '_blank' : null }).run();
  };

  return (
    <>
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        {btn('B', 'Bold', editor.isActive('bold'), () => chain().toggleBold().run())}
        {btn('I', 'Italic', editor.isActive('italic'), () => chain().toggleItalic().run())}
        {btn('U', 'Underline', editor.isActive('underline'), () => chain().toggleUnderline().run())}
        {btn('H2', 'Heading', editor.isActive('heading', { level: 2 }), () => chain().toggleHeading({ level: 2 }).run())}
        {btn('H3', 'Sub-heading', editor.isActive('heading', { level: 3 }), () => chain().toggleHeading({ level: 3 }).run())}
        {btn('• List', 'Bulleted list', editor.isActive('bulletList'), () => chain().toggleBulletList().run())}
        {btn('1. List', 'Numbered list', editor.isActive('orderedList'), () => chain().toggleOrderedList().run())}
        {btn('❝', 'Quote', editor.isActive('blockquote'), () => chain().toggleBlockquote().run())}
        {btn('🔗', 'Link', editor.isActive('link'), setLink)}
        {btn('―', 'Divider', false, () => chain().setHorizontalRule().run())}
        {tables && btn('▦ Table', 'Insert a table (3 × 3 with a header row)', inTable, () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {images && btn('🖼 Image', 'Insert an image', false, () => setPicking(true))}
        {btn('↶', 'Undo', false, () => chain().undo().run())}
        {btn('↷', 'Redo', false, () => chain().redo().run())}
      </div>
      {inTable && (
        <div className="rte-toolbar rte-subtoolbar" role="toolbar" aria-label="Table">
          {btn('+ Row', 'Add a row below', false, () => chain().addRowAfter().run())}
          {btn('+ Column', 'Add a column to the right', false, () => chain().addColumnAfter().run())}
          {btn('− Row', 'Delete this row', false, () => chain().deleteRow().run())}
          {btn('− Column', 'Delete this column', false, () => chain().deleteColumn().run())}
          {btn('Header row', 'Turn the first row into a header (or back)', false, () => chain().toggleHeaderRow().run())}
          {btn('Delete table', 'Delete the whole table', false, () => chain().deleteTable().run())}
        </div>
      )}
      {images && (
        <ImagePicker
          open={picking}
          onClose={() => setPicking(false)}
          onPick={(src, alt) => {
            chain().setImage({ src, alt }).run();
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

/** Media library (choose or upload), or an image address typed in. */
function ImagePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (src: string, alt: string) => void }) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const valid = /^https:\/\/\S+$/i.test(url.trim());
  return (
    <Modal open={open} onClose={onClose} title="Insert an image" size="xl">
      <div className="stack">
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <label className="field grow">
            <span className="field-label">Image address</span>
            <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field grow">
            <span className="field-label">Alt text</span>
            <input className="input" placeholder="Describe the image" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} />
          </label>
          <Button variant="primary" disabled={!valid} onClick={() => onPick(url.trim(), alt.trim())}>
            Insert
          </Button>
        </div>
        <p className="field-hint">…or choose one from the library below, or upload a new one.</p>
        <MediaLibrary onSelect={(m) => onPick(m.url, alt.trim() || m.alt)} />
      </div>
    </Modal>
  );
}
