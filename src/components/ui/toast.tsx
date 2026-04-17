'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onClose: () => void;
}

const DURATION = 5000;

export function Toast({ message, type, onClose }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(DURATION);
  const pausedAtRef = useRef<number | null>(null);

  // Start the dismiss timer on mount. useEffect with empty deps runs once —
  // we intentionally don't re-run when onClose changes reference.
  useEffect(() => {
    timerRef.current = setTimeout(onClose, remainingRef.current);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pausedAtRef.current = Date.now();
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    if (pausedAtRef.current !== null) {
      remainingRef.current -= Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    timerRef.current = setTimeout(onClose, Math.max(0, remainingRef.current));
    setIsPaused(false);
  };

  return (
    <div
      className={cn(
        'animate-in slide-in-from-top-2 pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 transition-all duration-300',
        {
          'bg-green-50 ring-green-200': type === 'success',
          'bg-red-50 ring-red-200': type === 'error',
          'bg-amber-50 ring-amber-200': type === 'warning',
          'bg-zinc-50 ring-zinc-200': type === 'info',
        }
      )}
      role="alert"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0">
          {type === 'success' && (
            <svg
              className="h-5 w-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {type === 'error' && (
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {type === 'warning' && (
            <svg
              className="h-5 w-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          )}
          {type === 'info' && (
            <svg
              className="h-5 w-5 text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
          )}
        </div>

        <p
          className={cn('flex-1 text-sm font-medium', {
            'text-green-900': type === 'success',
            'text-red-900': type === 'error',
            'text-amber-900': type === 'warning',
            'text-zinc-900': type === 'info',
          })}
        >
          {message}
        </p>

        <button
          type="button"
          onClick={onClose}
          className={cn(
            'flex-shrink-0 rounded-lg p-1.5 transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none',
            {
              'text-green-600 hover:bg-green-100 focus:ring-green-500':
                type === 'success',
              'text-red-600 hover:bg-red-100 focus:ring-red-500':
                type === 'error',
              'text-amber-600 hover:bg-amber-100 focus:ring-amber-500':
                type === 'warning',
              'text-zinc-600 hover:bg-zinc-100 focus:ring-zinc-500':
                type === 'info',
            }
          )}
          aria-label="Закрити"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Progress bar — purely visual. Dismiss is handled by setTimeout above.
          scaleX(1→0) from the left edge; animationPlayState mirrors isPaused. */}
      <div className="h-0.5 w-full overflow-hidden">
        <div
          className={cn('h-full w-full origin-left', {
            'bg-green-400': type === 'success',
            'bg-red-400': type === 'error',
            'bg-amber-400': type === 'warning',
            'bg-zinc-300': type === 'info',
          })}
          style={{
            animationName: 'toast-shrink',
            animationDuration: `${DURATION}ms`,
            animationTimingFunction: 'linear',
            animationFillMode: 'forwards',
            animationPlayState: isPaused ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: ToastProps[];
  onClose: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const container = document.getElementById('toast-root');
  if (!container) return null;

  return createPortal(
    <div
      className="fixed top-4 right-4 left-4 z-50 flex flex-col gap-2 sm:right-4 sm:left-auto sm:w-96"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={() => onClose(toast.id)} />
      ))}
    </div>,
    container
  );
}
