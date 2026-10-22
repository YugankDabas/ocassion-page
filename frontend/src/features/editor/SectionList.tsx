import { SECTION_TYPES, type Section, type SectionType } from '../../contracts';
import { SortableContainer, useSortableItem } from '../../components/fields/SortableList';
import { Modal } from '../../components/ui';
import { SECTION_CATALOG, sectionDefinition, sectionTitle } from './sections/catalog';

interface Props {
  sections: Section[];
  selectedId: string | null;
  invalidIds: Set<string>;
  onSelect: (id: string) => void;
  onChange: (sections: Section[]) => void;
}

/** Drag-and-drop ordered list of the page's sections. */
export function SectionList({ sections, selectedId, invalidIds, onSelect, onChange }: Props) {
  const patch = (id: string, p: Partial<Section>) => onChange(sections.map((s) => (s.id === id ? ({ ...s, ...p } as Section) : s)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };

  return (
    <SortableContainer items={sections} onReorder={onChange}>
      <ul className="section-list" aria-label="Page sections (drag to reorder)">
        {sections.map((s, index) => (
          <SectionRow
            key={s.id}
            section={s}
            selected={s.id === selectedId}
            invalid={invalidIds.has(s.id)}
            onSelect={() => onSelect(s.id)}
            onToggleVisible={() => patch(s.id, { visible: !s.visible })}
            onMoveUp={index > 0 ? () => move(index, -1) : undefined}
            onMoveDown={index < sections.length - 1 ? () => move(index, 1) : undefined}
          />
        ))}
      </ul>
    </SortableContainer>
  );
}

function SectionRow({
  section,
  selected,
  invalid,
  onSelect,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
}: {
  section: Section;
  selected: boolean;
  invalid: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const s = useSortableItem(section.id);
  const def = sectionDefinition(section.type);
  const title = sectionTitle(section);
  const summary = (def.summarize as (p: unknown) => string)(section.props);
  const subtitle = title === def.label ? summary : [def.label, summary !== title ? summary : ''].filter(Boolean).join(' · ');
  return (
    <li
      ref={s.ref}
      style={s.style}
      className={`section-item ${selected ? 'selected' : ''} ${section.visible ? '' : 'hidden-section'} ${s.isDragging ? 'dragging' : ''}`}
      onClick={onSelect}
      aria-current={selected || undefined}
    >
      <button type="button" className="drag-handle" aria-label={`Drag to reorder ${title}`} {...s.handleProps} onClick={(e) => e.stopPropagation()}>
        ⠿
      </button>
      <span className="label">
        <strong>
          {title} {invalid && <span title="Has errors" style={{ color: 'var(--danger)' }}>●</span>}{' '}
          {!section.visible && <span className="badge badge-neutral">Hidden</span>}
        </strong>
        <span>{subtitle || '—'}</span>
      </span>
      <span className="row" style={{ gap: 0 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" aria-label="Move up" title="Move up" disabled={!onMoveUp} onClick={onMoveUp}>
          ↑
        </button>
        <button type="button" className="icon-btn" aria-label="Move down" title="Move down" disabled={!onMoveDown} onClick={onMoveDown}>
          ↓
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={section.visible ? 'Hide section' : 'Show section'}
          title={section.visible ? 'Visible — click to hide' : 'Hidden — click to show'}
          onClick={onToggleVisible}
        >
          {section.visible ? '👁' : '🚫'}
        </button>
      </span>
    </li>
  );
}

export function AddSectionModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (type: SectionType) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a section" size="md">
      <div className="palette">
        {SECTION_TYPES.map((type) => {
          const def = SECTION_CATALOG[type];
          return (
            <button
              type="button"
              key={type}
              onClick={() => {
                onAdd(type);
                onClose();
              }}
            >
              <strong>{def.label}</strong>
              <span>{def.description}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
