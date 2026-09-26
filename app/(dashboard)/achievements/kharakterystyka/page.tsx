import { redirect } from 'next/navigation';

/** Moved to `/profile/kharakterystyka` — see the note on `/achievements`. */
export default function MyKharakterystykaRedirect() {
  redirect('/profile/kharakterystyka');
}
