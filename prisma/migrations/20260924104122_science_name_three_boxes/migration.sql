-- Owner, 2026-09-23: a ПІБ is typed into three boxes — Прізвище / Ім'я / По
-- батькові — never one. Rewrites the one-box `candidate` / `student` text field
-- of every science вид роботи, in EVERY template, into the joined set
-- `lib/science/work-types-2027.ts` declares (`personName`). The identity list
-- keeps naming `candidate` / `student`: `workKey` reads that as the joined
-- group, and gives the key the one box gave, so no stored work changes identity.
UPDATE "ScienceWorkType" w
SET "evidenceFields" = (
  SELECT jsonb_agg(p.part ORDER BY e.ord, p.sub)
  FROM jsonb_array_elements(w."evidenceFields") WITH ORDINALITY AS e(el, ord)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN e.el->>'kind' = 'text' AND e.el->>'name' IN ('candidate', 'student') THEN
        jsonb_build_array(
          jsonb_build_object(
            'kind', 'text', 'name', (e.el->>'name') || 'Last', 'label', 'Прізвище',
            'join', e.el->>'name', 'joinLabel', e.el->>'label', 'rule', 'cyrillicName'
          ),
          jsonb_build_object(
            'kind', 'text', 'name', (e.el->>'name') || 'First', 'label', 'Ім’я',
            'join', e.el->>'name', 'rule', 'cyrillicName'
          ),
          jsonb_build_object(
            'kind', 'text', 'name', (e.el->>'name') || 'Middle', 'label', 'По батькові',
            'join', e.el->>'name', 'rule', 'cyrillicName', 'optional', true
          )
        )
      ELSE jsonb_build_array(e.el)
    END
  ) WITH ORDINALITY AS p(part, sub)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(w."evidenceFields") f
  WHERE f->>'kind' = 'text' AND f->>'name' IN ('candidate', 'student')
);
