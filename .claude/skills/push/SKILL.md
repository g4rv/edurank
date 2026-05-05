---
name: push
description: Push the current branch to remote. Use when the user wants to push, sync, or publish their commits.
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git branch *) Bash(git log *) Bash(git push *)
---

Push the current branch to remote.

## Steps

1. Run `git status` to verify the working tree is clean
2. Show the current branch and pending commits with `git log @{u}..HEAD --oneline`
3. Ask the user to confirm before pushing — this affects the remote and is hard to reverse
4. Push: `git push` or `git push -u origin <branch>` if no upstream is set yet
5. Confirm success
