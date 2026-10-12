import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type ReactNode } from 'react';
import { Button } from '../ui';

export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Generic vertical drag-and-drop reorder for anything with an `id`. */
export function SortableContainer<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useDndSensors();
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function useSortableItem(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return {
    ref: setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined, position: 'relative' as const },
    handleProps: { ...attributes, ...listeners },
    isDragging,
  };
}

/**
 * Editable, reorderable list of items (slides, FAQs, features…). Each item
 * collapses to a one-line summary so long lists stay manageable.
 */
export function ListEditor<T extends { id: string }>({
  label,
  items,
  onChange,
  createItem,
  renderItem,
  summary,
  max,
  addLabel = 'Add item',
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  summary: (item: T, index: number) => string;
  max?: number;
  addLabel?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(items[0]?.id ?? null);
  const update = (id: string, patch: Partial<T>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div className="field">
      <div className="row-between">
        <span className="field-label">
          {label} <span className="muted">({items.length}{max ? `/${max}` : ''})</span>
        </span>
      </div>
      <SortableContainer items={items} onReorder={onChange}>
        <div className="list-editor">
          {items.map((item, index) => (
            <ListRow
              key={item.id}
              id={item.id}
              title={summary(item, index) || `Item ${index + 1}`}
              open={expanded === item.id}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
              onDuplicate={max !== undefined && items.length >= max ? undefined : () => {
                const copy = { ...structuredClone(item), id: createItem().id };
                const next = [...items];
                next.splice(index + 1, 0, copy);
                onChange(next);
              }}
              onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
            >
              {renderItem(item, (patch) => update(item.id, patch))}
            </ListRow>
          ))}
        </div>
      </SortableContainer>
      <div>
        <Button
          size="sm"
          disabled={max !== undefined && items.length >= max}
          onClick={() => {
            const item = createItem();
            onChange([...items, item]);
            setExpanded(item.id);
          }}
        >
          + {addLabel}
        </Button>
      </div>
    </div>
  );
}

function ListRow({
  id,
  title,
  open,
  onToggle,
  onDuplicate,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  onDuplicate?: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const s = useSortableItem(id);
  return (
    <div ref={s.ref} style={s.style} className={`list-item ${open ? '' : 'collapsed'}`}>
      <div className="list-item-head">
        <button type="button" className="drag-handle" aria-label={`Reorder ${title}`} {...s.handleProps}>
          ⠿
        </button>
        <button type="button" className="icon-btn" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? '▾' : '▸'}
        </button>
        <span className="label" onClick={onToggle}>
          {title}
        </span>
        {onDuplicate && (
          <button type="button" className="icon-btn" title="Duplicate" aria-label="Duplicate" onClick={onDuplicate}>
            ⧉
          </button>
        )}
        <button type="button" className="icon-btn" title="Remove" aria-label="Remove" onClick={onRemove}>
          🗑
        </button>
      </div>
      {open && <div className="list-item-body">{children}</div>}
    </div>
  );
}
