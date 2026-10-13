"use client";

import { Button } from "./button";
import { Modal } from "./modal";

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = "تأكيد", danger, loading,
}: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>إلغاء</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}
    >
      <p>{message}</p>
    </Modal>
  );
}
