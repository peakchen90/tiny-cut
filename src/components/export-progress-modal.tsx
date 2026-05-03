import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Modal, type ModalRef } from "./modal";
import { t } from "../lib/i18n";

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

  return (
    <div className="export-progress">
      <div className="export-progress-path" title={outputPath}>
        {outputPath}
      </div>

      <div className="export-progress-bar">
        <div className="export-progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="export-progress-percent">{Math.round(percent)}%</div>

      <div className="export-status export-status-exporting">
        {t("export.exporting")}
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
  return (
    <div className="export-progress">
      <div className="export-progress-path" title={outputPath}>
        {outputPath}
      </div>

      <div className="export-progress-bar">
        <div className="export-progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="export-progress-percent">{Math.round(percent)}%</div>

      <div className={`export-status export-status-${status}`}>
        {status === "success" && t("export.exportSuccess")}
        {status === "error" && t("export.exportFailed")}
      </div>

      {status === "error" && errorMessage && (
        <div className="export-error-message">{errorMessage}</div>
      )}
    </div>
  );
}
