'use client';

import { Button, Modal } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import { useState } from 'react';
import { deleteProfessor } from '../actions';

interface Props {
  id: string;
  name: string;
}

export function DeleteProfessorButton({ id, name }: Props) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteProfessor(id);
    setIsDeleting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Викладача видалено');
      setOpen(false);
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
        onClose={() => setOpen(false)}
        title="Видалити викладача"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
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
        }
      >
        <p className="text-sm text-zinc-600">
          Ви впевнені, що хочете видалити{' '}
          <span className="font-medium text-zinc-900">{name}</span>? Цю дію не
          можна скасувати.
        </p>
      </Modal>
    </>
  );
}
