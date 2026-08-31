import 'dotenv/config';
import { db } from '../lib/db';
import { getDepartmentsKnpp } from '../lib/queries/get-department-knpp';
import { REQUIRED_POSITIONS } from '../lib/kharakterystyka/positions';

// Кнпп per кафедра — how many people meet at least four п.38 positions.
//
//   pnpm db:report-knpp [year]
//
// Read-only. Written to show the effect of `link-licence-positions-2025.ts`:
// run it before and after, and the difference IS the effect, because `Кнпп` is
// never stored — `get-department-knpp.ts` computes it from the activities every
// time it is asked.

async function main() {
  const year = Number(process.argv[2]) || 2026;

  const departments = await db.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const rows = await getDepartmentsKnpp(
    departments.map((d) => d.id),
    year
  );
  const byId = new Map(rows.map((r) => [r.departmentId, r]));

  let people = 0;
  let qualifying = 0;
  let withAny = 0;

  console.log(`Кнпп ${year} — потрібно позицій: ${REQUIRED_POSITIONS}\n`);
  console.log('  НПП  Кнпп  хоч 1  кафедра');
  for (const d of departments) {
    const r = byId.get(d.id);
    if (!r) continue;
    const any = r.staff.filter((s) => s.metCount > 0).length;
    people += r.headcount;
    qualifying += r.knpp;
    withAny += any;
    console.log(
      `${String(r.headcount).padStart(5)} ${String(r.knpp).padStart(5)} ${String(any).padStart(6)}  ${d.name}`
    );
  }
  console.log(
    `\n${String(people).padStart(5)} ${String(qualifying).padStart(5)} ${String(withAny).padStart(6)}  УСЬОГО`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
