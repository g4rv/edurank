'use client';

import { createContext, useContext } from 'react';
import type { PersonOption } from '@/lib/aspirants/pick';

/**
 * Who a `pickFrom` ПІБ may name, provided once by the page that has the forms
 * (owner, 2026-10-07) — rather than threaded as a prop through the plan view,
 * the record list and both record dialogs down to `EvidenceFields`.
 */
export interface PickLists {
  aspirants?: readonly PersonOption[];
}

const PickListsContext = createContext<PickLists>({});

export function PickListsProvider({
  aspirants,
  children,
}: PickLists & { children: React.ReactNode }) {
  return <PickListsContext.Provider value={{ aspirants }}>{children}</PickListsContext.Provider>;
}

export function usePickLists(): PickLists {
  return useContext(PickListsContext);
}
