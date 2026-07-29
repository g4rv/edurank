'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActivityTypeDialog,
  type ActivityTypeDraft,
} from '@/components/admin/activity-type-dialog';

/** A blank indicator: fixed points, one text field for the proof */
function blankDraft(section: number, itemNumber: string): ActivityTypeDraft {
  return {
    code: '',
    section,
    itemNumber,
    label: '',
    coefficient: 10,
    coefficientNote: null,
    maxPerYear: null,
    inputSource: 'NPP_SUBMISSION',
    verifyingDivisionId: null,
    isActive: true,
    requiresVerification: false,
    scoring: { kind: 'FIXED' },
    fields: [{ kind: 'text', name: 'title', label: 'Назва' }],
  };
}

export function NewActivityType({
  templateId,
  section,
  nextItemNumber,
  divisions,
}: {
  templateId: string;
  section: number;
  /** Next free number in this section, so the admin rarely has to type one */
  nextItemNumber: string;
  divisions: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Додати показник
      </Button>
      <ActivityTypeDialog
        templateId={templateId}
        draft={blankDraft(section, nextItemNumber)}
        divisions={divisions}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
