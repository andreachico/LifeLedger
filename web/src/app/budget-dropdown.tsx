"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORY_ICONS, CategoryGlyph, iconColor } from "./category-icons";

// A modern, amber-themed dropdown with an optional inline "+ Add new…" action.
// The popover is portaled to <body> with fixed positioning so it's never clipped
// by a table/section that uses overflow-hidden. Used for Type/Category fields
// both inside row modals (variant "field") and inline table cells ("cell").
export default function BudgetDropdown({
  value,
  options,
  onChange,
  onAddNew,
  onRename,
  onDelete,
  isEditable,
  iconFor,
  onSetIcon,
  placeholder = "Select…",
  addLabel = "+ Add new…",
  ariaLabel,
  variant = "field",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAddNew?: (value: string) => void;
  onRename?: (oldValue: string, newValue: string) => void;
  onDelete?: (value: string) => void;
  isEditable?: (value: string) => boolean;
  // When provided, each option shows its chosen preset icon and the edit row
  // includes an icon picker. `iconFor` returns the current icon id for an
  // option; `onSetIcon` sets/clears it.
  iconFor?: (value: string) => string;
  onSetIcon?: (value: string, icon: string) => void;
  placeholder?: string;
  addLabel?: string;
  ariaLabel?: string;
  variant?: "field" | "cell";
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const [editOptDraft, setEditOptDraft] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen(true);
    setAdding(false);
  }
  function closeMenu() {
    setOpen(false);
    setAdding(false);
    setEditingOpt(null);
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setRect(r);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t))
        return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function confirmAdd() {
    const v = draft.trim();
    if (!v) return;
    onAddNew?.(v);
    onChange(v);
    setDraft("");
    closeMenu();
  }

  function confirmRename(oldValue: string) {
    const v = editOptDraft.trim();
    setEditingOpt(null);
    if (!v || v === oldValue) return;
    onRename?.(oldValue, v);
    if (value === oldValue) onChange(v);
  }

  const triggerClass =
    variant === "field"
      ? "flex w-full items-center justify-between gap-2 rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-2.5 text-sm shadow-sm transition-colors hover:border-amber-600/40 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
      : "flex w-full items-center justify-between gap-1 rounded-md border border-amber-900/15 bg-amber-50/50 px-2 py-1 text-sm transition-colors hover:border-amber-600/40 hover:bg-amber-900/5 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600/20";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeMenu() : openMenu())}
        className={triggerClass}
      >
        <span
          className={`truncate ${value ? "text-zinc-900" : "text-amber-900/40"}`}
        >
          {value || placeholder}
        </span>
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-amber-900/50 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: Math.max(rect.width, 180),
            }}
            className="z-60 max-h-64 overflow-auto rounded-2xl border border-amber-900/15 bg-white p-1.5 shadow-xl shadow-amber-900/10"
          >
            {options.length === 0 && !onAddNew && (
              <p className="px-3 py-2 text-sm text-amber-900/40">No options</p>
            )}
            {options.map((opt) => {
              const canModify =
                Boolean(onRename || onDelete) &&
                (isEditable ? isEditable(opt) : true);
              if (editingOpt === opt) {
                return (
                  <div key={opt} className="p-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={editOptDraft}
                        onChange={(e) => setEditOptDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            confirmRename(opt);
                          }
                          if (e.key === "Escape") setEditingOpt(null);
                        }}
                        className="w-full rounded-lg border border-amber-900/15 bg-amber-50/40 px-2.5 py-1.5 text-sm text-zinc-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600/20"
                      />
                      <button
                        type="button"
                        onClick={() => confirmRename(opt)}
                        aria-label="Save name"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-700 transition-colors hover:bg-emerald-50"
                      >
                        <svg
                          width={16}
                          height={16}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOpt(null)}
                        aria-label="Cancel"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5"
                      >
                        <svg
                          width={16}
                          height={16}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    {onSetIcon && (
                      <div className="mt-1.5 flex flex-wrap gap-1 px-0.5 pb-0.5">
                        {CATEGORY_ICONS.map((icon) => {
                          const selected = iconFor?.(opt) === icon.id;
                          return (
                            <button
                              key={icon.id}
                              type="button"
                              title={icon.label}
                              aria-label={icon.label}
                              aria-pressed={selected}
                              onClick={() =>
                                onSetIcon(opt, selected ? "" : icon.id)
                              }
                              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${iconColor(
                                icon.id,
                              )} ${
                                selected
                                  ? "border-amber-600 ring-2 ring-amber-500/40"
                                  : "border-transparent hover:border-amber-600/40"
                              }`}
                            >
                              <CategoryGlyph id={icon.id} size={15} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={opt} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      closeMenu();
                    }}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      opt === value
                        ? "bg-linear-to-br from-amber-800 to-amber-600 font-semibold text-amber-50 shadow-sm shadow-amber-900/20"
                        : "text-zinc-800 hover:bg-amber-900/5"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {iconFor && iconFor(opt) && (
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconColor(
                            iconFor(opt),
                          )}`}
                        >
                          <CategoryGlyph id={iconFor(opt)} size={14} />
                        </span>
                      )}
                      <span className="truncate">{opt}</span>
                    </span>
                    {opt === value && (
                      <svg
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  {canModify && onRename && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOpt(opt);
                        setEditOptDraft(opt);
                      }}
                      aria-label={`Rename ${opt}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
                    >
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                  {canModify && onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onDelete(opt);
                      }}
                      aria-label={`Delete ${opt}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
            {onAddNew && (
              <div className="mt-1 border-t border-amber-900/10 pt-1">
                {adding ? (
                  <div className="flex items-center gap-1.5 p-1">
                    <input
                      type="text"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmAdd();
                        }
                      }}
                      placeholder="New name"
                      className="w-full rounded-lg border border-amber-900/15 bg-amber-50/40 px-2.5 py-1.5 text-sm text-zinc-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600/20"
                    />
                    <button
                      type="button"
                      onClick={confirmAdd}
                      className="shrink-0 rounded-lg bg-amber-900 px-2.5 py-1.5 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-800"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(true);
                      setDraft("");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-amber-800 transition-colors hover:bg-amber-900/5"
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {addLabel}
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
