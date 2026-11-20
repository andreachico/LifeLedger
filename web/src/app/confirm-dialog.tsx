"use client";

// A small, amber-themed confirmation modal used in place of the browser's
// default window.confirm(). Rendered to <body> via a portal so it overlays the
// whole page. Pass `open` to toggle visibility and wire `onConfirm`/`onCancel`.
import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="text-lg font-bold tracking-tight text-zinc-900">
          {title}
        </h3>
        <p className="mt-2 text-sm text-amber-900/70">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-amber-900/15 px-4 py-2 text-sm font-medium text-amber-900/80 transition-colors hover:bg-amber-900/5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="rounded-lg bg-linear-to-r from-red-700 to-red-600 px-4 py-2 text-sm font-semibold text-red-50 shadow-sm transition-all hover:from-red-600 hover:to-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
