'use client';

import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { AddProfessorForm } from './add-professor-form';

type Department = { id: string; name: string };

export function AddProfessorButton({
  departments,
}: {
  departments: Department[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
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
          className="mr-1.5"
        >
          <path d="M5 12h14M12 5v14" />
        </svg>
        Додати
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Додати викладача"
        size="wide"
      >
        <AddProfessorForm
          departments={departments}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
