Read `documentation/personal/learning-notes.md` in full.

Then review the current conversation from the beginning — identify:

1. Every new concept, tool, or pattern that was explained or learned
2. Every error that was encountered, its cause, and how it was fixed
3. Every architectural decision that was made (what was chosen, what was rejected, why)

---

## How to update

The file is organized by **topic**, not by session. Do not add session headers. Add each new piece of content to the most relevant existing section.

### New concepts

Find the right section from the table of contents (e.g. a new Prisma pattern goes under `## 3. Prisma ORM`, a new React hook goes under `## 6. React Patterns`).

Add a `###` subsection at the bottom of that section with:

- Plain-English explanation of what it is and why it matters
- Code examples where helpful
- Analogies where useful

If a new concept introduces a brand-new topic area not covered by any existing section, add a new `## N. Topic Name` section and update the Table of Contents entry at the top.

### Errors

Append to `## 11. Troubleshooting Reference`. Each entry must follow this format exactly:

````markdown
### Short descriptive title

**Error:** One sentence — what the error message said or what went wrong.
**Why:** The root cause.
**Fix:**
\```typescript
// code snippet if helpful
\```
````

Add a horizontal rule (`---`) after each entry to match existing style.

### Architectural decisions

Append to `## 12. Architectural Decisions Log` using the existing pattern:

```markdown
### Decision title

**Chose:** What was picked | **Rejected:** What was not picked

One or two sentences on why, including what would break or cost more with the rejected option.
```

### References

If a new package or official docs URL was introduced this session, add it to the relevant table in `## 13. References`.

---

## Style rules

- Match the tone and style of existing entries — concise, mentor-voice, explain the "why"
- Do not add entries for things already documented
- Do not rewrite or reformat existing content — only append
- Only document what is genuinely new this session
- Code examples should be minimal — just enough to illustrate the concept
