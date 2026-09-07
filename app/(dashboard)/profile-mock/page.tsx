import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil, ArchiveX, ArchiveRestore } from 'lucide-react';
import { auth } from '@/lib/auth';
import { AuroraButton } from '@/components/aurora/ui/button';
import { StaffProfileView } from '@/components/staff/profile/staff-profile-view';
import { RatingBars } from '@/components/staff/profile/rating-bars';
import { fullName } from '@/components/staff/profile/primitives';
import {
  FULL_STAFF,
  EMPTY_STAFF,
  ARCHIVED_STAFF,
  MOCK_STAKE_PARTS,
  MOCK_SECTIONS,
  MOCK_TOTAL,
  MOCK_YEAR,
} from '../_mock/staff';

/**
 * Service page — the redesigned profile, on invented data.
 *
 * It rendered the reader's own record until now, which on a dev database is
 * mostly empty, so half the cards never appeared and there was nothing to
 * judge. `mock-data.ts` fills every field instead, and the four states below
 * are the ones that actually differ:
 *
 *   1  own profile, everything filled — ставка visible, rating on the page
 *   2  the same record from the staff register — ставка hidden, as an EDITOR sees
 *   3  a brand-new НПП — the state ~200 people open on day one
 *   4  archived, and a сумісник with no primary кафедра
 *
 * 1 and 2 force `showEmpty` so the whole vocabulary is visible at once. 3 and 4
 * do NOT, because the point of those two is exactly the behaviour that hides a
 * blank field and collects it into the note at the foot.
 *
 * Nothing is replaced: no nav link, and `/profile` and `/staff/[id]` are
 * untouched. Every person here is invented, so the page reads no real record at
 * all — it needs a session only to keep a service page off the public internet.
 */
export default async function ProfileMockPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const bars = (href: string, label: string) => (
    <RatingBars
      year={MOCK_YEAR}
      sections={MOCK_SECTIONS}
      total={MOCK_TOTAL}
      href={href}
      linkLabel={label}
    />
  );

  return (
    <div className="space-y-12">
      <div className="rounded-xl border border-dashed bg-muted/25 p-4">
        <p className="text-sm font-medium">Чернетка профілю — вигадані дані</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Жодного реального запису тут немає. Варіанти 1 і 2 показують УСІ поля, зокрема порожні,
          щоб було видно повний набір. Варіанти 3 і 4 працюють як у готовому вигляді: порожнє поле
          зникає, а перелік того, чого бракує, збирається внизу.
        </p>
      </div>

      <Section title="1 · Власний профіль — усе заповнено, ставка видима">
        <StaffProfileView
          staff={FULL_STAFF}
          breadcrumbs={[{ label: 'Особисте' }, { label: 'Мій профіль' }]}
          showStake
          stakeParts={MOCK_STAKE_PARTS}
          editHref="/profile/edit"
          canFillOwn
          showEmpty
          actions={
            <AuroraButton asChild variant="outline" size="sm">
              <Link href="/profile/edit">
                <Pencil />
                Редагувати
              </Link>
            </AuroraButton>
          }
          rating={bars('/achievements', 'Мій рейтинг')}
        />
      </Section>

      <Section title="2 · Із реєстру персоналу — ставка прихована, як бачить EDITOR">
        <StaffProfileView
          staff={FULL_STAFF}
          breadcrumbs={[{ label: 'Персонал', href: '/staff' }, { label: fullName(FULL_STAFF) }]}
          showStake={false}
          stakeParts={MOCK_STAKE_PARTS}
          editHref="/staff/mock-full/edit"
          showEmpty
          actions={
            <>
              <AuroraButton asChild variant="outline" size="sm">
                <Link href="/staff/mock-full/edit">
                  <Pencil />
                  Редагувати
                </Link>
              </AuroraButton>
              <AuroraButton variant="outline" size="sm" disabled>
                <ArchiveX />
                Архівувати
              </AuroraButton>
            </>
          }
          rating={bars('/staff/mock-full/rating', 'Рейтинг')}
        />
      </Section>

      <Section title="3 · Новий НПП — нічого не заповнено, порожні поля приховано">
        <StaffProfileView
          staff={EMPTY_STAFF}
          breadcrumbs={[{ label: 'Особисте' }, { label: 'Мій профіль' }]}
          showStake
          stakeParts={[]}
          editHref="/profile/edit"
          canFillOwn
          actions={
            <AuroraButton asChild variant="outline" size="sm">
              <Link href="/profile/edit">
                <Pencil />
                Редагувати
              </Link>
            </AuroraButton>
          }
          rating={<RatingBars year={MOCK_YEAR} sections={[0, 0, 0, 0, 0]} total={0} />}
        />
      </Section>

      <Section title="4 · Архівований сумісник — без основної кафедри">
        <StaffProfileView
          staff={ARCHIVED_STAFF}
          breadcrumbs={[{ label: 'Персонал', href: '/staff' }, { label: fullName(ARCHIVED_STAFF) }]}
          showStake={false}
          stakeParts={[]}
          editHref="/staff/mock-archived/edit"
          actions={
            <AuroraButton variant="outline" size="sm" disabled>
              <ArchiveRestore />
              Відновити
            </AuroraButton>
          }
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
