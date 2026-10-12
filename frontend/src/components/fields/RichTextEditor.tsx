import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useId } from 'react';
import { isSafeHref } from '../../contracts';

interface Props {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
}

/**
 * WYSIWYG editor producing a small, predictable HTML subset (headings, lists,
 * links, emphasis). The server sanitises again — this is UX, not security.
 */
export function RichTextEditor({ label, value, onChange, hint }: Props) {
  const id = useId();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, codeBlock: false, code: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'], validate: (href) => isSafeHref(href) }),
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
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} className="rte-content" />
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (label: string, title: string, active: boolean, run: () => void) => (
    <button type="button" title={title} aria-label={title} aria-pressed={active} className={active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();

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
      {btn('↶', 'Undo', false, () => chain().undo().run())}
      {btn('↷', 'Redo', false, () => chain().redo().run())}
    </div>
  );
}
