---
name: commit
description: Stage and commit current changes with a descriptive commit message. Use when the user wants to commit, save changes, or create a checkpoint.
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git add *) Bash(git commit *) Bash(git log *)
---

Review changes and create a commit.

## Commit message format

```
<type>(<scope>): <short description>

<optional body>
```

- First line: 72 characters or less, no trailing period
- Imperative mood: "add", "fix", "update" — not "added", "fixed"
- Focus on WHAT changed and WHY — not HOW
- No AI attribution lines, co-author lines, or any mention of AI/Claude — ever

### Types

| Type       | When to use                                  |
| ---------- | -------------------------------------------- |
| `feat`     | New feature, page, or user-facing capability |
| `fix`      | Bug fix                                      |
| `chore`    | Tooling, config, dependency changes          |
| `refactor` | Code restructure with no behavior change     |
| `style`    | Formatting or CSS-only changes               |
| `test`     | Adding or updating tests                     |
| `docs`     | CLAUDE.md, comments, documentation files     |
| `db`       | Prisma schema changes, migrations, seed data |

### Scopes

Use the affected area of the app. Common scopes:
`auth`, `staff`, `faculty`, `department`, `division`, `permissions`, `layout`, `dashboard`, `profile`, `achievements`, `seed`, `docker`, `deps`

### Examples

```
feat(staff): add professor list page with search and filter
fix(auth): redirect to login when session expires
chore(deps): install prisma and @auth/prisma-adapter
db(schema): add DivisionEntityPermission table
docs(claude): update permission model and folder structure
refactor(permissions): extract field check into shared util
```

## Steps

1. Run `git status` to see all changed files
2. Run `git diff` and `git diff --staged` to understand what changed
3. Stage relevant files — avoid committing `.env`, secrets, or build artifacts
4. Write the commit message following the format above
5. Create the commit
6. Confirm with `git log --oneline -1`
