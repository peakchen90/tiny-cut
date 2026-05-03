import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Modal, type ModalRef } from "./modal";
import { t } from "../lib/i18n";
import { revealInFileManager } from "../lib/tauri";

interface ExportProgress {
  percent: number;
  status: "exporting" | "success" | "error";
  message?: string;
}

interface Props {
  outputPath: string;
  modalRef: React.MutableRefObject<ModalRef | null>;
}

export function openExportProgressModal(outputPath: string): ModalRef {
  const modalRef: { current: ModalRef | null } = { current: null };
  modalRef.current = Modal.open({
    title: t("export.export"),
    width: 420,
    keyboard: false,
    maskClosable: false,
    showClose: false,
    content: () => <ExportProgressContent outputPath={outputPath} modalRef={modalRef} />,
  });
  return modalRef.current;
}

function ExportProgressContent({ outputPath, modalRef }: Props) {
  const [percent, setPercent] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    const unlisten = listen<ExportProgress>("export-progress", (event) => {
      const { percent: p, status: s, message } = event.payload;
      setPercent(p);
      if ((s === "success" || s === "error") && !completedRef.current) {
        completedRef.current = true;
        const ref = modalRef.current;
        if (ref) {
          ref.close();
        }
        Modal.open({
          title: t("export.export"),
          width: 420,
          keyboard: false,
          maskClosable: false,
          content: () => (
            <ExportResultContent
              outputPath={outputPath}
              status={s}
              percent={p}
              errorMessage={s === "error" ? message : undefined}
            />
          ),
        });
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [outputPath, modalRef]);

  const handleReveal = () => {
    revealInFileManager(outputPath).catch(() => {});
  };

  return (
    <div className="export-progress">
      <div className="export-progress-path-row">
        <span className="export-progress-label">{t("export.outputPath")}</span>
        <div className="export-progress-input-wrapper">
          <input
            className="export-progress-input"
            value={outputPath}
            readOnly
            title={outputPath}
          />
          <button className="export-progress-reveal" onClick={handleReveal} title={t("export.reveal")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="export-progress-bar">
        <div className="export-progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="export-status-row">
        <span className="export-status export-status-exporting">{t("export.exporting")}</span>
        <span className="export-progress-percent">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

function ExportResultContent({ outputPath, status, percent, errorMessage }: {
  outputPath: string;
  status: "success" | "error";
  percent: number;
  errorMessage?: string;
}) {
  const handleReveal = () => {
    revealInFileManager(outputPath).catch(() => {});
  };

  return (
    <div className="export-progress">
      <div className="export-progress-path-row">
        <span className="export-progress-label">{t("export.outputPath")}</span>
        <div className="export-progress-input-wrapper">
          <input
            className="export-progress-input"
            value={outputPath}
            readOnly
            title={outputPath}
          />
          <button className="export-progress-reveal" onClick={handleReveal} title={t("export.reveal")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="export-progress-bar">
        <div className="export-progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="export-status-row">
        <span className={`export-status export-status-${status}`}>
          {status === "success" && t("export.exportSuccess")}
          {status === "error" && t("export.exportFailed")}
        </span>
        <span className="export-progress-percent">{Math.round(percent)}%</span>
      </div>

      {status === "error" && errorMessage && (
        <div className="export-error-message">{errorMessage}</div>
      )}
    </div>
  );
}
