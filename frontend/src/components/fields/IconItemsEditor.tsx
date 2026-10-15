import type { IconItem } from '../../contracts';
import { newId } from '../../lib/ids';
import { Select, TextInput } from '../ui';
import { ICON_OPTIONS } from './IconSlotField';
import { ImageField } from './ImageField';
import { ListEditor } from './SortableList';

/** Editable list of icon + title + text items (trust bar, footer promises). */
export function IconItemsEditor({ label, items, max = 6, onChange }: { label: string; items: IconItem[]; max?: number; onChange: (items: IconItem[]) => void }) {
  return (
    <ListEditor
      label={label}
      max={max}
      addLabel="Add item"
      items={items}
      onChange={onChange}
      summary={(t) => t.title}
      createItem={(): IconItem => ({ id: newId('i_'), icon: 'sparkles', image: { url: '', alt: '' }, title: '', text: '' })}
      renderItem={(t, update) => (
        <>
          <div className="grid-2">
            <TextInput label="Title" value={t.title} maxLength={60} onChange={(title) => update({ title })} />
            <TextInput label="Text" value={t.text} maxLength={120} onChange={(text) => update({ text })} />
          </div>
          <Select label="Icon" value={t.icon} onChange={(icon) => update({ icon })} options={ICON_OPTIONS} />
          <ImageField label="Custom icon image (optional)" hint="Replaces the icon. Square, 96×96 px." value={t.image} onChange={(image) => update({ image })} />
        </>
      )}
    />
  );
}
