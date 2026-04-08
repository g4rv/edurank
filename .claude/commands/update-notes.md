Read `documentation/personal/learning-notes.md` in full.

Then review the current conversation from the beginning — identify:
1. Every new concept, tool, or pattern that was explained or learned
2. Every error that was encountered, its cause, and how it was fixed

---

## What to append

### New session section

Add a new `## Session N — Topic` header (increment N from the last session in the file).

Under it, write:
- One subsection per new concept (use `###` headers matching the style of existing sessions)
- Plain-English explanation of what it is and why it matters
- Code examples where helpful
- Analogies where useful

If any errors occurred this session, add at the bottom of the session section:

```
**Errors this session:** [Short error title](#err-slug)
```

Use one line per error, each linking to its anchor in the Errors section.

### Errors section

The file must have an `## Errors` section at the very end. If it doesn't exist yet, create it.

For each new error this session, append:

```markdown
### <a name="err-slug"></a> Short descriptive title
**What happened:** One sentence — what the error message said or what went wrong.
**Why:** The root cause — what Next.js / Node / Prisma actually does that caused it.
**Fix:** What we changed to resolve it, with a code snippet if helpful.
```

- `err-slug` must be lowercase, hyphen-separated, unique (e.g. `err-searchparams-async`)
- Keep each entry concise — this is a reference, not an essay

---

## Style rules
- Match the tone and style of existing sessions in the file
- Do not rewrite or reformat existing content
- Do not add entries for things already documented
- Only document what is genuinely new this session
