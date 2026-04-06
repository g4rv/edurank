# Commit Schema

Reference this file every time a commit is requested.

---

## Format

```
type(scope): short description

Optional body — explain WHY, not what. Only add if the change
isn't self-evident from the title.
```

---

## Types

| Type | When to use |
|---|---|
| `feat` | New page, feature, or capability |
| `fix` | Bug fix |
| `schema` | Any change to `prisma/schema.prisma` |
| `chore` | Dependencies, config, tooling, Docker |
| `docs` | Documentation only |
| `style` | Tailwind / CSS changes with no logic change |
| `refactor` | Code restructure with no behavior change |

---

## Scope (optional but helpful)

Put the area of the codebase affected in parentheses:

```
feat(professors): ...
fix(auth): ...
schema(professor): ...
chore(docker): ...
```

Common scopes: `auth`, `professors`, `departments`, `faculties`, `ui`, `api`, `docker`, `prisma`

---

## Rules

- First line max 72 characters
- No period at the end of the first line
- No AI attribution (`Co-Authored-By`, `Generated with`, etc.)
- `schema:` commits must always include both `prisma/schema.prisma` and the corresponding `prisma/migrations/` file
- Use imperative mood — "add field" not "added field" or "adds field"

---

## Examples

```
chore: initial docker compose setup with postgres, adminer and minio
```
```
schema(professor): add faculty and department models with relations
```
```
feat(auth): add login page with email and password
```
```
fix(auth): redirect to login when session expires
```
```
chore(prisma): install prisma 7 and generate client
```
```
docs: add setup guide and personal learning notes
```
```
feat(professors): add professor list page with department filter
```
