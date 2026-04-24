'use client';

import { cn } from '@/utils/cn';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'default' | 'wide';
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  size = 'default',
  footer,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open) {
      if (!el.open) el.showModal();
      el.removeAttribute('data-closing');
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    } else if (el.open) {
      el.setAttribute('data-closing', '');
      const onEnd = () => {
        el.removeAttribute('data-closing');
        el.close();
      };
      el.addEventListener('animationend', onEnd, { once: true });
    }
  }, [open]);

  // Escape key fires the native `cancel` event — intercept it so the
  // parent controls state (prevents the dialog from self-closing).
  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  // Clicks that land directly on the <dialog> element itself
  // (not inside the panel) are backdrop clicks.
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={ref}
      onCancel={handleCancel}
      onClick={handleClick}
      className={cn(
        'hidden open:flex',
        'fixed m-auto max-h-[90vh] flex-col rounded-xl bg-white p-0 shadow-lg',
        'w-[calc(100%-2rem)]',
        size === 'default' ? 'max-w-lg' : 'max-w-2xl',
        'open:animate-modal-in',
        'data-[closing]:animate-modal-out'
      )}
    >
      {/* Clicks inside the panel must not reach the backdrop handler */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4">
          {title ? (
            <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div className="shrink-0 border-t border-zinc-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>,
    document.body
  );
}
