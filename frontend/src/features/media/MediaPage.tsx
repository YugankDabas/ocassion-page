import { useState } from 'react';
import { toast } from 'sonner';
import { MediaLibrary } from '../../components/fields/MediaLibrary';
import { Button, ConfirmDialog, Modal, PageHeader, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDeleteMedia } from '../../lib/queries';
import type { Media } from '../../lib/types';
import { useQueryClient } from '@tanstack/react-query';

export function MediaPage() {
  const [selected, setSelected] = useState<Media | null>(null);
  return (
    <>
      <PageHeader title="Media library" description="Banners, icons and logos. Uploads are validated, stripped of metadata and converted to optimised WebP." />
      <div className="card card-body">
        <MediaLibrary onSelect={setSelected} />
      </div>
      {selected && <MediaDetails media={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function MediaDetails({ media, onClose }: { media: Media; onClose: () => void }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const [alt, setAlt] = useState(media.alt);
  const [confirm, setConfirm] = useState(false);
  const del = useDeleteMedia();

  const saveAlt = async () => {
    try {
      await api.patch(`/media/${media.id}`, { alt });
      await qc.invalidateQueries({ queryKey: ['media'] });
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={media.originalName}
      size="lg"
      footer={
        <>
          {auth.can('media.delete') && (
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Delete
            </Button>
          )}
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(media.url);
              toast.success('URL copied');
            }}
          >
            Copy URL
          </Button>
          <Button variant="primary" onClick={() => void saveAlt()}>
            Save alt text
          </Button>
        </>
      }
    >
      <div className="stack">
        <img src={media.url} alt={media.alt} style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain', background: '#f3f4f6', borderRadius: 8 }} />
        <p className="muted small" style={{ margin: 0 }}>
          {media.width}×{media.height}px · {Math.round(media.sizeBytes / 1024)} KB · <span className="mono">{media.url}</span>
        </p>
        <TextInput label="Default alt text" value={alt} maxLength={200} onChange={setAlt} />
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete image?"
        danger
        confirmLabel="Delete"
        loading={del.isPending}
        message={<p>Pages still using this image will show a broken image. Make sure it is no longer used.</p>}
        onClose={() => setConfirm(false)}
        onConfirm={() =>
          del.mutate(media.id, {
            onSuccess: () => {
              toast.success('Image deleted');
              onClose();
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </Modal>
  );
}
