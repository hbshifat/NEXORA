---
name: factory
description: Run a feature through the software factory loop of spec, build, four parallel reviews, approval, and merge.
argument-hint: "<feature> | next | approve <job-id> | rework <job-id> <note>"
disable-model-invocation: true
---

You are the factory orchestrator. Run the loop below, spawn every agent, and be
the only writer of `factory/board.json`. Arguments: `$ARGUMENTS`

## The loop (edit this to change the factory)

                   ┌──────────────────┐
                   │     feature      │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │   spec-writer    │
                   │       opus       │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │     builder      │◄────────────────────┐
                   │       opus       │                     │
                   └─────────┬────────┘                     │
        ┌─────────────┬──────┴──────┬─────────────┐         │
        ▼             ▼             ▼             ▼         │
  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
  │  security │ │     ux    │ │ ui design │ │    code   │   │
  │    opus   │ │   sonnet  │ │   sonnet  │ │   sonnet  │   │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │
        └─────────────┴──────┬──────┴─────────────┘         │
                             ▼                              │
                   ┌──────────────────┐   any CHANGES:      │
                   │   WAIT FOR ALL   ├─────────────────────┘
                   │   4 reviews in   │   resume builder
                   └─────────┬────────┘   (max 2 rounds)
                             ▼ all PASS
                   ┌──────────────────┐
                   │     approver     │
                   │       opus       │
                   └─┬───────────────┬┘
             APPROVE │               │ ESCALATE
                     ▼               ▼
              ┌─────────────┐ ┌─────────────┐
              │merge to main│ │ needs-human │ ◄── /factory approve
              └─────────────┘ └─────────────┘

"Merge to main" always goes feature → `dev` → `main` → tag. See **Land**.

## Rules

- Agents get context from files, not the conversation, and write only their own
  file. Agent prompts contain paths only.
- Each review starts with `VERDICT: PASS` or `VERDICT: CHANGES`. `decision.md`
  starts with `APPROVE` or `ESCALATE`.
- WAIT FOR ALL: a round is done only when all four review files exist in the
  round folder. Never resume the builder mid-round.
- A round means one review round. The default limit is 2.
- Job ids are `NNN-slug`, lowercase letters, digits, and hyphens only. Check that
  a user-supplied job id is on the board before using it in a command.

## Board

Rewrite `factory/board.json` at every change below. The dashboard polls it.

```json
{ "jobs": [ {
  "id": "003-rate-limiting",
  "feature": "the feature text, verbatim",
  "branch": "factory/003-rate-limiting",
  "builder": "builder-003-rate-limiting",
  "from_backlog": false,
  "stage": "review",
  "round": 2,
  "round_limit": 2,
  "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "pending", "code": "PASS" },
  "past_rounds": [ { "security": "CHANGES", "ux": "PASS", "ui": "CHANGES", "code": "PASS" } ],
  "note": "why a human is needed, when stage is needs-human",
  "tag": "v0.3.0 once merged"
} ] }
```

`stage` is one of `spec`, `build`, `review`, `approve`, `needs-human`, `merged`.

## Preflight (every command)

1. If `dev` does not exist, create it from `main`.
2. If `git status --porcelain` shows any change other than `factory/backlog.md`,
   stop and tell the user to commit or stash first. Otherwise `git switch dev`.
   Backlog edits may stay uncommitted; **Land** commits them.
3. If `factory/board.json` is missing, create it as `{ "jobs": [] }`.

## Commands

The first word of the arguments selects the command. Anything else is a feature.

**`/factory <feature>`**: run **New job** with the feature text.

**`/factory next`**: find the first `- [ ]` line in `factory/backlog.md` whose text
is not the `feature` of a job on the board, then run **New job** with
`from_backlog: true`. If there is none, say the backlog is empty.

**`/factory approve <job-id>`**: the job must be in `needs-human`. Run **Land**.

**`/factory rework <job-id> <note>`**: the job must not be `merged` and must have
`round` of at least 1.
1. Write `factory/jobs/<id>/round-<round>/review-human.md`, with `VERDICT: CHANGES`
   as the first line and the note below it.
2. Set `round_limit` to `round + 2`.
3. If `.worktrees/<id>` is missing, run `git worktree add .worktrees/<id> factory/<id>`.
4. Continue at **Build** step 2, pointing the builder at that round folder.

## New job

1. Pick the next id: highest number on the board plus one, three digits, plus a
   short slug of the feature. Create `factory/jobs/<id>/`.
2. Add the job to the board with `stage: spec`, `round: 0`, `round_limit: 2`, and
   all reviews `pending`.
3. Spawn `spec-writer` with the job folder. When it returns, `spec.md` must exist.
4. Run `git worktree add .worktrees/<id> -b factory/<id> dev`.

## Build

1. First build: set `stage: build`. Spawn `builder` named `builder-<id>`, giving it
   the job folder and worktree path. Store its address in `builder`: the name, or
   the returned agent id if the Agent tool has no name field.
2. Rework: set `stage: build`. Resume that same builder with `SendMessage`, pointing
   it at the round folder to address. If it cannot be reached because this is a new
   session, spawn a fresh `builder` with the same name and the same paths.
3. When it returns, `build.md` must exist.

## Review

1. If `round` is above 0, push the current `reviews` onto `past_rounds`. Add 1 to
   `round` and reset all four reviews to `pending`.
2. Create `factory/jobs/<id>/round-<round>/`. Set `stage: review`.
3. Spawn `review-security`, `review-ux`, `review-ui`, and `review-code` together in
   one message, giving each the job folder, round folder, branch, and worktree path.
4. As each one finishes, read the first line of its file and update its chip.
5. WAIT FOR ALL. A reviewer that finished without a valid file gets respawned once.
   If it fails again, set `stage: needs-human` with a note and stop.
6. Any `CHANGES`: if `round` is below `round_limit`, return to **Build** step 2 with
   this round folder. Otherwise set `stage: needs-human`, note "review round limit
   reached", and stop.
7. All `PASS`: continue to **Approve**.

## Approve

Set `stage: approve`. Spawn `approver` with the job folder, final round folder,
branch, and worktree path. Read the first line of `decision.md`:

- `APPROVE`: run **Land**.
- `ESCALATE`: set `stage: needs-human`, put the reason in `note`, and stop.

## Land

Every feature reaches `dev` first. Every merge into `main` gets a tag, so any
release can be undone with `git revert -m 1 <tag>`.

1. If `from_backlog`, copy `factory/backlog.md` from the main checkout over
   `.worktrees/<id>/factory/backlog.md`, tick the item there, and commit it on the
   feature branch. Then run `git restore factory/backlog.md` in the main checkout.
   The merge brings the edits back, so the merge never meets local changes.
2. Feature into `dev`, while on `dev`:
   - With an `origin` remote and `gh` available: `git push -u origin factory/<id>`,
     `gh pr create --base dev --head factory/<id> --title "<id>" --body-file factory/jobs/<id>/decision.md`,
     `gh pr merge factory/<id> --merge`, then `git pull --ff-only origin dev`.
     For a job with no `decision.md`, use `spec.md` as the PR body.
   - Otherwise: `git merge --no-ff factory/<id> -m "feat: <id>"`.
3. `dev` into `main`: pick the tag by taking the highest `vX.Y.Z` and adding 1 to Y,
   starting at `v0.1.0`. Then `git switch main`, `git merge --no-ff dev -m "release: <tag> (<id>)"`,
   and `git tag -a <tag> -m "<id>"`. With a remote, first run `git pull --ff-only origin main`,
   and afterwards `git push origin main dev --follow-tags`.
4. `git switch dev`, `git worktree remove .worktrees/<id>`, and `git branch -d factory/<id>`.
   With a remote, also `git push origin --delete factory/<id>`.
5. Set `stage: merged` and store `tag`.

If any step fails or conflicts, run `git merge --abort` if a merge is in progress,
`git switch dev`, set `stage: needs-human` with the error in `note`, and stop.
