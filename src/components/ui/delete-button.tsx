'use client';

import { useState } from 'react';
import { useToast } from '@/providers/toast-provider';
import { Button } from './button';
import { Modal } from './modal';

interface Props {
  id: string;
  name: string;
  title: string;
  successMessage: string;
  onDelete: (id: string) => Promise<{ error?: string }>;
  blockedBy?: string[];
}

export function DeleteButton({
  id,
  name,
  title,
  successMessage,
  onDelete,
  blockedBy,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const isBlocked = !!blockedBy?.length;

  const handleClose = () => {
    setOpen(false);
    setError(null);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    const result = await onDelete(id);
    setIsDeleting(false);
    if (result.error) {
      setError(result.error);
    } else {
      toast.success(successMessage);
      handleClose();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Видалити ${name}`}
        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={handleClose}
        title={title}
        footer={
          isBlocked ? (
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Закрити
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={isDeleting}
              >
                Скасувати
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Видалення...' : 'Видалити'}
              </Button>
            </div>
          )
        }
      >
        {isBlocked ? (
          <div>
            <p className="text-sm text-zinc-600">
              Неможливо видалити{' '}
              <span className="font-bold text-zinc-900">{name}</span> — спочатку
              видаліть:
            </p>
            <ul className="mt-3 space-y-1">
              {blockedBy!.map((item) => (
                <li key={item} className="text-sm text-zinc-700">
                  — {item}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Ви впевнені, що хочете видалити{' '}
              <span className="font-bold text-zinc-900">{name}</span>? Цю дію не
              можна скасувати.
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
