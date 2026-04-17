"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { ToastContainer, type ToastType, type ToastProps } from "@/components/ui/toast";

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      setToasts((prev) => {
        const id = crypto.randomUUID();
        const newToast: ToastProps = { id, message, type, onClose: () => removeToast(id) };

        const existingIndex = prev.findIndex((t) => t.message === message && t.type === type);
        if (existingIndex !== -1) {
          // Replace in-place with a fresh toast — new id causes React to remount,
          // which resets the timer and restarts the progress bar from full.
          const next = [...prev];
          next[existingIndex] = newToast;
          return next;
        }

        // Drop the oldest toast if at the limit
        const base = prev.length >= MAX_TOASTS ? prev.slice(1) : prev;
        return [...base, newToast];
      });
    },
    [removeToast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => addToast(message, "success"),
      error: (message) => addToast(message, "error"),
      warning: (message) => addToast(message, "warning"),
      info: (message) => addToast(message, "info"),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
