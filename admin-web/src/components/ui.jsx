import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const HUE = { 'Pending': 'grey', 'Assigned': 'blue', 'Accepted': 'blue', 'On the way': 'violet', 'In Progress': 'amber', 'On Hold': 'amber',
  'Awaiting Approval': 'violet', 'Completed': 'green', 'Unable to Complete': 'red', 'Cancelled': 'grey' };
export const Badge = ({ children, hue }) => <span className={`badge h-${hue || HUE[children] || 'grey'}`}>{children}</span>;

export function Modal({ title, sub, onClose, children, footer, wide }) {
  useEffect(() => { const h = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head"><div><h2>{title}</h2>{sub && <div className="muted sm">{sub}</div>}</div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
export const Empty = ({ title, children }) => <div className="empty"><b>{title}</b>{children}</div>;
export const Loading = () => <div className="empty"><span className="spinner" /> Loading…</div>;
export const ErrorBox = ({ msg, retry }) => <div className="error-box">{msg} {retry && <button className="link" onClick={retry}>Try again</button>}</div>;

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((text, err) => {
    const id = Math.random();
    setList(l => [...l, { id, text, err }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3800);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" aria-live="polite">{list.map(t => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.text}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

export function Confirm({ title, message, okLabel, danger, onOk, onClose, children }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}>Go back</button>
    <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={async () => { setBusy(true); try { await onOk(); } finally { setBusy(false); } }}>{okLabel}</button></>}>
    <p style={{ margin: 0 }}>{message}</p>{children}
  </Modal>;
}
