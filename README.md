# NEXORA — Software Factory

A software factory built on [Claude Code](https://claude.com/claude-code) agents.
You hand it a feature request in one sentence; it writes a spec, builds the
feature on its own branch, runs four independent reviews, decides whether the
result is safe to ship, and merges it to `main` with a release tag — or stops and
asks you when a person should decide.

```
feature ─► spec-writer ─► builder ─► 4 reviews ─► approver ─► dev ─► main + tag
                             ▲          │ (security · ux · ui · code)
                             └──────────┘ any CHANGES (max 2 rounds)
```

## Contents

- [Install into your project](#install-into-your-project)
- [Quick start](#quick-start)
- [Commands](#commands)
- [How a job flows](#how-a-job-flows)
- [The agents](#the-agents)
- [The dashboard](#the-dashboard)
- [Repository layout](#repository-layout)
- [Branching and releases](#branching-and-releases)
- [Customizing the factory](#customizing-the-factory)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Install into your project

From the root of any git repository:

```bash
curl -fsSL https://raw.githubusercontent.com/hbshifat/NEXORA/main/get.sh | bash
```

This installs the latest [release](https://github.com/hbshifat/NEXORA/releases)
(or `main` when there is none yet). It adds:

| Path | On a later run |
|---|---|
| `.claude/skills/factory/SKILL.md` and the seven `.claude/agents/*.md` | replaced with the new version |
| `factory/dashboard.html` | replaced with the new version |
| `factory/backlog.md` | created only if missing; your backlog is never touched |
| `factory/.install.json` | records the installed version |
| three run-state lines in `.gitignore` | added only if missing |

Then commit those files (`/factory` will not run with uncommitted changes) and run
`/factory <feature>` in Claude Code. The repository needs a `main` branch; the
factory creates `dev` from it on first run.

**Options** — pass them after `bash -s --`:

```bash
curl -fsSL https://raw.githubusercontent.com/hbshifat/NEXORA/main/get.sh | bash -s -- --ref v0.2.0 --dry-run
```

| Option | Effect |
|---|---|
| `--ref <tag\|branch>` | install a specific version |
| `--target <dir>` | install into another folder instead of the current one |
| `--dry-run` | show what would change and write nothing |
| `--force` | overwrite files at the factory's paths that the factory did not install |

**Safe by default.** On a first install, if you already have a file at one of the
factory's paths (for example your own `.claude/agents/builder.md`), the installer
stops, names the file, and changes nothing. Rerunning the installer later is an
upgrade and only replaces the factory's own files.

**Without curl.** Clone this repository and run `./install.sh /path/to/your/project`
— same options, minus `--ref` and `--target`.

## Quick start

These steps run the factory inside this repository itself, which is how the
factory is developed. To use it in your own project, [install it](#install-into-your-project) first.

**Requirements**

- [Claude Code](https://docs.claude.com/en/docs/claude-code) (CLI, desktop app, or IDE extension)
- `git` 2.5+ (for worktrees)
- Optional: an `origin` remote and the [GitHub CLI](https://cli.github.com/) (`gh`), so
  jobs land through pull requests instead of local merges
- Optional: `python3`, to serve the dashboard

**Run your first job**

1. Clone the repo and open it in Claude Code. Make sure the working tree is clean.
2. Start a job:

   ```
   /factory Add a dark mode toggle that remembers the user's choice
   ```

3. Watch it on the dashboard (in a second terminal):

   ```bash
   cd factory && python3 -m http.server
   ```

   Then open <http://localhost:8000/dashboard.html>.

The job ends in one of two states: **merged** (with a new tag such as `v0.2.0`) or
**needs-human** (with a note explaining why). See [Commands](#commands) for what to
do with the second.

## Commands

| Command | What it does |
|---|---|
| `/factory <feature>` | Starts a new job from the feature text. |
| `/factory next` | Starts a job from the first unticked item in [`factory/backlog.md`](factory/backlog.md) that is not already on the board. |
| `/factory approve <job-id>` | Lands a job that is waiting in `needs-human`. Use this when you have checked it and are happy to ship. |
| `/factory rework <job-id> <note>` | Sends a job back to the builder with your note as a `VERDICT: CHANGES` review, and allows two more review rounds. |

`/factory` only runs when you type it — Claude never starts the factory on its own.

Every command first runs a **preflight**: it creates `dev` from `main` if needed,
refuses to continue if you have uncommitted changes, switches to `dev`, and creates
an empty board if there isn't one.

### Using the backlog

Add one feature per line to [`factory/backlog.md`](factory/backlog.md):

```markdown
- [ ] Add tags to notes and filter the list by tag
- [ ] Export all notes as a Markdown file
```

`/factory next` picks the first unticked line. When the job lands, its line is
ticked in the same commit as the feature.

## How a job flows

Each job gets an id like `002-dark-mode`, a folder `factory/jobs/<id>/`, a branch
`factory/<id>`, and a git worktree at `.worktrees/<id>`.

1. **Spec** — `spec-writer` reads the feature and the repo and writes `spec.md`:
   repo facts (language, test command, conventions), goal, testable acceptance
   criteria, out-of-scope items, and which surfaces (UI, auth, data) it touches.
2. **Build** — `builder` implements the spec in the job's worktree, adds tests,
   runs them, commits, and writes `build.md` with evidence for every acceptance
   criterion.
3. **Review** — four reviewers run in parallel against `git diff dev...factory/<id>`
   and write into `round-N/`. The factory waits for **all four** before acting.
   - Any `VERDICT: CHANGES` → the same builder is resumed to fix them, then a new
     round starts. After 2 rounds the job stops at `needs-human`.
   - All `VERDICT: PASS` → on to approval.
4. **Approve** — `approver` checks the evidence and writes `decision.md`:
   - `APPROVE` → the job lands.
   - `ESCALATE` → the job stops at `needs-human`. The approver escalates when the
     evidence is thin, the change goes beyond the spec, or it touches auth,
     payments, secrets, data migrations or deletion, CI/deploy config, or a major
     new dependency.
5. **Land** — the feature merges into `dev`, `dev` merges into `main`, and `main`
   is tagged. The worktree and feature branch are removed.

A job's `stage` on the board is always one of
`spec` → `build` → `review` → `approve` → `merged`, or `needs-human`.

### Ground rules the agents follow

- Agents get their context **from files, not the conversation**. Prompts contain
  only paths, so a job can be resumed from a fresh session.
- Each agent **writes exactly one file**, whose first line is a machine-readable
  verdict (`VERDICT: PASS` / `VERDICT: CHANGES`, or `APPROVE` / `ESCALATE`).
- Only the orchestrator (the `/factory` skill) writes `factory/board.json`.
- Reviewers and the approver never change code; only the builder does, and only
  inside its worktree.

## The agents

Defined in [`.claude/agents/`](.claude/agents/).

| Agent | Model | Job | Writes |
|---|---|---|---|
| [`spec-writer`](.claude/agents/spec-writer.md) | opus | Turns the feature into a testable spec | `spec.md` |
| [`builder`](.claude/agents/builder.md) | opus | Implements, tests, commits; addresses review rounds | code + `build.md` |
| [`review-security`](.claude/agents/review-security.md) | opus | Injection, auth, secrets, unsafe input, risky deps, data exposure | `round-N/review-security.md` |
| [`review-code`](.claude/agents/review-code.md) | sonnet | Runs tests; correctness, edge cases, conventions | `round-N/review-code.md` |
| [`review-ux`](.claude/agents/review-ux.md) | sonnet | Flows, errors, empty states, accessibility | `round-N/review-ux.md` |
| [`review-ui`](.claude/agents/review-ui.md) | sonnet | Layout, spacing, type, contrast, responsiveness | `round-N/review-ui.md` |
| [`approver`](.claude/agents/approver.md) | opus | Final ship / escalate decision | `decision.md` |

The orchestrator itself is the skill at
[`.claude/skills/factory/SKILL.md`](.claude/skills/factory/SKILL.md).

## The dashboard

[`factory/dashboard.html`](factory/dashboard.html) is a single static page that
polls `board.json` every 2 seconds and shows each job's stage, review chips per
round, and its files (spec, build, reviews, decision).

It loads data with `fetch`, so it must be served over HTTP from the `factory/`
folder — opening the file directly (`file://`) will not work:

```bash
cd factory && python3 -m http.server
```

Open <http://localhost:8000/dashboard.html>.

## Repository layout

```
.
├── .claude/
│   ├── agents/              # the seven factory agents
│   └── skills/factory/      # the /factory orchestrator (the loop lives here)
├── factory/
│   ├── backlog.md           # queued features for /factory next
│   ├── dashboard.html       # live board viewer
│   ├── board.json           # run state (gitignored)
│   └── jobs/<id>/           # per-job files (gitignored)
│       ├── spec.md
│       ├── build.md
│       ├── round-N/review-{security,ux,ui,code,human}.md
│       └── decision.md
├── .worktrees/<id>/         # one git worktree per in-flight job (gitignored)
├── get.sh                   # one-line installer: downloads a release, runs install.sh
├── install.sh               # copies the factory into a target repository
├── tests/test-install.sh    # installer tests (bash tests/test-install.sh)
└── advanced-todo/           # app built by the factory (job 001)
```

When you add a file the factory needs at runtime, add it to `MANAGED_FILES` (or
`SEED_FILES`) in [`install.sh`](install.sh) and to `MANAGED` in the test, then run
`bash tests/test-install.sh`.

`board.json`, `jobs/`, and `.worktrees/` are deliberately gitignored: run state
lives on disk so it survives branch switches and rollbacks. The approver's
`decision.md` becomes the pull request body, so the reasoning still reaches GitHub.

## Branching and releases

The factory follows gitflow:

- Every job is built on `factory/<id>`, branched from `dev`.
- It lands in `dev` first — through a pull request (`gh pr create` + `gh pr merge`)
  when an `origin` remote and `gh` are available, otherwise via a local
  `git merge --no-ff`.
- `dev` is then merged into `main` with `--no-ff` and tagged. Tags bump the minor
  version: `v0.1.0`, `v0.2.0`, `v0.3.0`, …

Because every merge into `main` is tagged, any release can be undone with:

```bash
git revert -m 1 <tag>
```

If a merge conflicts or any landing step fails, the factory aborts the merge,
returns to `dev`, and parks the job in `needs-human` with the error.

### Publishing an installable release

`get.sh` installs the latest **GitHub Release**, not the latest tag. After a
release lands on `main`, publish it so users get it:

```bash
gh release create v0.2.0 --verify-tag --generate-notes
```

Only releases that include `install.sh` can be installed this way; `v0.1.0`
predates the installer.

## Customizing the factory

The loop is plain Markdown — edit it like any other file.

| To change… | Edit |
|---|---|
| The loop, stages, or landing steps | [`.claude/skills/factory/SKILL.md`](.claude/skills/factory/SKILL.md) |
| The default review round limit (2) | `round_limit` in **New job** in the skill |
| What gets escalated to a person | the escalation list in [`approver.md`](.claude/agents/approver.md) |
| An agent's model or tools | that agent's frontmatter in [`.claude/agents/`](.claude/agents/) |

**Adding a reviewer** (for example, performance): create
`.claude/agents/review-perf.md` modeled on an existing reviewer, then in the skill
add it to the parallel spawn in **Review** step 3, the `reviews` object in the
board schema, and the "all four reviews" wait condition. Add it to `REVIEWERS` in
the dashboard so its chip shows up.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/factory` stops immediately asking you to commit or stash | Preflight needs a clean working tree. Commit or stash, then rerun. |
| Dashboard says "Cannot read board.json" | Serve it from `factory/` over HTTP (see [The dashboard](#the-dashboard)); no job has run yet if the file doesn't exist. |
| Job is in `needs-human` | Read `note` on the board and `decision.md` / the latest round. Then `/factory approve <id>` to ship or `/factory rework <id> <note>` to send it back. |
| Builder can't be resumed in a new session | Expected — the factory starts a fresh builder with the same name and paths; all context is in the job folder. |
| `git worktree add` fails for a job | A stale worktree or branch exists. Run `git worktree prune` and check `git branch --list 'factory/*'`. |

## Contributing

Bug reports, ideas and pull requests are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) first: pull requests branch off `dev` and
target `dev`, and installer changes need `bash tests/test-install.sh` to pass.

## License

[MIT](LICENSE)
