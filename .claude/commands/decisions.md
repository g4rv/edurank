Read `documentation/technical/decisions.md` if it exists.

Then review the current conversation from the beginning and identify every architectural or technical decision that was made — things where we chose one approach over another for a specific reason.

---

## What counts as a decision

- Choosing one tool/library over another (e.g. tsx over ts-node)
- Choosing one pattern over another (e.g. sessionVersion over DB sessions)
- Deciding NOT to do something and why (e.g. not adding seed to docker compose)
- Any trade-off that was consciously discussed

Do not include things that were obvious or had no real alternative.

---

## Output format

Append new entries to `documentation/technical/decisions.md` under a `## Session N` header.

Each entry:

```markdown
### Decision title

**Chose:** What we went with
**Rejected:** What we didn't use
**Why:** The actual reason — constraints, trade-offs, limitations discovered
```

If the file doesn't exist yet, create it with this header:

```markdown
# Architectural Decisions

A log of technical choices made during development — what was picked, what was rejected, and why.
Exists so future-us doesn't re-debate settled questions.

---
```

---

## Rules

- Be specific — "tsx works with esnext moduleResolution, ts-node does not" beats "tsx is better"
- One entry per decision — don't merge unrelated choices
- Do not rewrite existing entries
- Do not document decisions already in the file
