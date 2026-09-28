import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The inspector on a phone: a bottom sheet on a native `<dialog>`, opened with
 * `showModal()`, so Escape, keeping focus inside, the backdrop and returning
 * focus on close all come from the platform rather than from code here
 * (D-042, D-050). Closing it by any route — Escape, the ×, a tap on the
 * backdrop — calls `onClose`, which clears the selection.
 *
 * The dialog is always in the page, closed, so opening it is a method call
 * rather than a mount; its content renders only while it is open.
 */
export function InspectorSheet({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean
  /** The dialog's accessible name. */
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      // The content fills the dialog, so a click whose target is the dialog
      // itself landed on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[70dvh] w-full max-w-none overflow-y-auto rounded-t-xl border-t border-neutral-200 bg-[var(--background)] p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/50 dark:border-neutral-800"
    >
      {open && children}
    </dialog>
  )
}
