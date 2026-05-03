import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const BASE_Z_INDEX = 1000;

interface ModalConfig {
  title?: string;
  showClose?: boolean;
  width?: number;
  content: ReactNode | (() => ReactNode);
  footer?: ReactNode;
  maskClosable?: boolean;
  keyboard?: boolean;
  onClose?: () => void;
}

interface ModalRef {
  close: () => void;
}

interface ModalProps {
  title?: string;
  showClose?: boolean;
  width?: number;
  footer?: ReactNode;
  maskClosable?: boolean;
  keyboard?: boolean;
  onClose?: () => void;
  children: ReactNode;
}

interface ModalEntry {
  id: number;
  close: () => void;
  keyboard: boolean;
  maskClosable: boolean;
  render: () => ReactNode;
}

let idCounter = 0;
const modals = new Map<number, ModalEntry>();

// ── Global portal ──

const portalContainer = document.createElement("div");
portalContainer.id = "modal-portal";
document.body.appendChild(portalContainer);

let portalRoot: Root | null = null;

function renderPortal() {
  if (!portalRoot) portalRoot = createRoot(portalContainer);
  const entries = Array.from(modals.values());

  portalRoot.render(
    <>
      {entries.map((entry, i) => (
        <div key={entry.id} style={{ zIndex: BASE_Z_INDEX + i }}>
          {entry.render()}
        </div>
      ))}
    </>
  );
}

function register(entry: ModalEntry) {
  modals.set(entry.id, entry);
  renderPortal();
}

function unregister(id: number) {
  modals.delete(id);
  renderPortal();
}

function updateEntry(id: number, patch: Partial<ModalEntry>) {
  const entry = modals.get(id);
  if (entry) {
    Object.assign(entry, patch);
    renderPortal();
  }
}

// ── Global ESC handler ──

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const entry of Array.from(modals.values()).reverse()) {
    if (entry.keyboard) {
      e.stopPropagation();
      e.preventDefault();
      entry.close();
      return;
    }
  }
}, true);

// ── Modal shell ──

interface ModalShellProps {
  title?: string;
  showClose: boolean;
  width: number;
  content: ReactNode;
  footer?: ReactNode;
  maskClosable: boolean;
  keyboard: boolean;
  onClose?: () => void;
  onDestroy?: () => void;
  modalId: number;
}

function buildRender(
  props: { title?: string; showClose: boolean; width: number; content: ReactNode; footer?: ReactNode; maskClosable: boolean },
  modalId: number,
  handleClose: () => void,
): () => ReactNode {
  const { title, showClose, width, content, footer, maskClosable } = props;
  return () => (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const entries = Array.from(modals.values());
          const top = entries[entries.length - 1];
          if (top?.id === modalId && maskClosable) handleClose();
        }
      }}
    >
      <div className="modal" style={{ width }}>
        {title != null && (
          <div className="modal-header">
            <h2>{title}</h2>
            {showClose && (
              <button className="modal-close" onClick={handleClose}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{content}</div>
        {footer != null && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function ModalShell({ title, showClose, width, content, footer, maskClosable, keyboard, onClose, onDestroy, modalId }: ModalShellProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDestroyRef = useRef(onDestroy);
  onDestroyRef.current = onDestroy;

  const handleClose = () => {
    onCloseRef.current?.();
    onDestroyRef.current?.();
  };

  useEffect(() => {
    const renderProps = { title, showClose, width, content, footer, maskClosable };
    register({
      id: modalId,
      close: handleClose,
      keyboard,
      maskClosable,
      render: buildRender(renderProps, modalId, handleClose),
    });
    return () => unregister(modalId);
  }, []);

  useEffect(() => {
    const renderProps = { title, showClose, width, content, footer, maskClosable };
    updateEntry(modalId, {
      close: handleClose,
      keyboard,
      maskClosable,
      render: buildRender(renderProps, modalId, handleClose),
    });
  });

  return null;
}

// ── Public: Component ──

function Modal({ title, showClose = title != null, width = 400, footer, maskClosable = true, keyboard = true, onClose, children }: ModalProps) {
  const [modalId] = useState(() => ++idCounter);
  return (
    <ModalShell
      title={title}
      showClose={showClose}
      width={width}
      content={children}
      footer={footer}
      maskClosable={maskClosable}
      keyboard={keyboard}
      onClose={onClose}
      modalId={modalId}
    />
  );
}

// ── Public: Static API ──

Modal.open = function open(config: ModalConfig): ModalRef {
  const modalId = ++idCounter;
  let destroyed = false;

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    unregister(modalId);
  };

  const close = () => { config.onClose?.(); destroy(); };
  const renderedContent = typeof config.content === "function" ? config.content() : config.content;
  const maskClosable = config.maskClosable ?? true;

  register({
    id: modalId,
    close,
    keyboard: config.keyboard ?? true,
    maskClosable,
    render: buildRender(
      { title: config.title, showClose: config.showClose ?? config.title != null, width: config.width ?? 400, content: renderedContent, footer: config.footer, maskClosable },
      modalId,
      close,
    ),
  });

  return { close: destroy };
};

Modal.closeAll = function closeAll() {
  Array.from(modals.values()).reverse().forEach((m) => m.close());
};

export { Modal, type ModalConfig, type ModalRef };
