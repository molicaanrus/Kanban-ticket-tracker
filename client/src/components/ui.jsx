import { useEffect, useState } from 'react';
import { TYPE_LABEL } from '../api.js';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// Explicit confirmation dialog, used before every delete
export function Confirm({ title, text, yesLabel = 'Delete', onYes, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p>{text}</p>
      <div className="row-end">
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          className="btn danger-solid"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onYes();
              onClose();
            } catch {
              setBusy(false);
              onClose();
            }
          }}
        >
          {busy ? 'Working…' : yesLabel}
        </button>
      </div>
    </Modal>
  );
}

export const TypeBadge = ({ type }) => <span className={`type-badge type-${type}`}>{TYPE_LABEL[type]}</span>;

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}
