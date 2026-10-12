import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/api';
import { useMedia, useUploadMedia } from '../../lib/queries';
import type { Media } from '../../lib/types';
import { Button, EmptyState, Pagination, Spinner } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

/** Upload area + searchable grid of previously uploaded images. */
export function MediaLibrary({ onSelect, selectedUrl }: { onSelect?: (m: Media) => void; selectedUrl?: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const media = useMedia({ page, pageSize: 24, search });
  const upload = useUploadMedia();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const m = await upload.mutateAsync({ file });
        toast.success(`Uploaded ${file.name}`);
        if (files.length === 1) onSelect?.(m);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="stack">
      <div
        className={`dropzone ${dragging ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p style={{ margin: '0 0 8px' }}>Drag & drop images here (JPEG, PNG, WebP, GIF, AVIF · auto-optimised to WebP)</p>
        <Button variant="primary" onClick={() => input.current?.click()} loading={upload.isPending}>
          Upload images
        </Button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void uploadFiles(e.target.files)} />
      </div>
      <input className="input" placeholder="Search by file name or alt text…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      {media.isLoading ? (
        <Spinner />
      ) : !media.data?.items.length ? (
        <EmptyState title="No images yet">Upload your first banner or icon above.</EmptyState>
      ) : (
        <>
          <div className="media-grid">
            {media.data.items.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`media-tile ${selectedUrl === m.url ? 'selected' : ''}`}
                onClick={() => onSelect?.(m)}
                title={m.originalName}
              >
                <div className="img">
                  <img src={m.url} alt={m.alt} loading="lazy" />
                </div>
                <div className="meta">
                  {m.width}×{m.height} · {Math.round(m.sizeBytes / 1024)} KB
                  <br />
                  {m.originalName}
                </div>
              </button>
            ))}
          </div>
          <Pagination page={page} pageSize={24} total={media.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
