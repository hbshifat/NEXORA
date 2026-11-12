# Contributing to NEXORA

Thanks for helping improve the software factory. This guide covers how to propose
a change and what a pull request needs before it can be merged.

## Ways to help

- **Report a bug** or **suggest a feature**: open an
  [issue](https://github.com/hbshifat/NEXORA/issues/new/choose). Check existing
  issues first.
- **Fix something or add a feature**: send a pull request (below). For anything
  bigger than a small fix, open an issue first so we can agree on the approach.
- **Improve the docs**: README and agent prompts count as code here, so the same
  pull request process applies.

## Branches

This repository uses gitflow:

| Branch | What it holds |
|---|---|
| `main` | Released code. Every merge into `main` is tagged (`v0.2.0`, `v0.3.0`, …). |
| `dev` | The next release. **All pull requests target `dev`.** |
| `feature/<name>` | Your work, branched from `dev`. |

GitHub opens pull requests against `main` by default. **Change the base branch to
`dev`** when you open yours; pull requests into `main` are only for releases.

## Making a change

1. **Fork** the repository on GitHub, then clone your fork:

   ```bash
   git clone https://github.com/<your-username>/NEXORA.git
   cd NEXORA
   git remote add upstream https://github.com/hbshifat/NEXORA.git
   ```

2. **Branch off the latest `dev`:**

   ```bash
   git fetch upstream
   git switch -c feature/<short-name> upstream/dev
   ```

3. **Make your change** and keep it focused on one thing.

4. **Test it** (see [Testing](#testing)).

5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/)
   prefixes, as the history does: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

   ```bash
   git commit -m "fix: keep .gitignore lines when the file has CRLF endings"
   ```

6. **Push to your fork** and open a pull request **into `dev`**:

   ```bash
   git push -u origin feature/<short-name>
   gh pr create --repo hbshifat/NEXORA --base dev
   ```

   Fill in the pull request template. If `dev` moves on while you wait, rebase:
   `git fetch upstream && git rebase upstream/dev`.

## Testing

| You changed | Run |
|---|---|
| `install.sh` or `get.sh` | `bash tests/test-install.sh` — all tests must pass. Add a test for new behavior. |
| The factory loop (`.claude/skills/factory/SKILL.md`) or an agent (`.claude/agents/*.md`) | Install your branch into a scratch repository and run a small job end to end (see below). Say in the pull request what you ran and what happened. |
| `factory/dashboard.html` | Serve it (`cd factory && python3 -m http.server`) with a `board.json` that has jobs in several stages, and check it at desktop and phone width. |

**Trying your branch of the factory in a scratch repository:**

```bash
mkdir /tmp/factory-try && cd /tmp/factory-try
git init -b main && git commit --allow-empty -m init
bash /path/to/your/NEXORA/install.sh
git add -A && git commit -m "chore: add factory"
```

Then open Claude Code there and run something small, such as
`/factory Add a hello.txt file that says hello`.

## Changing the factory

The factory is plain Markdown that agents follow, so small wording changes can
change behavior. Keep these rules intact unless your pull request is explicitly
about changing them:

- Agents get context from files, not the conversation, and each writes only its
  own file.
- Each review starts with `VERDICT: PASS` or `VERDICT: CHANGES`; `decision.md`
  starts with `APPROVE` or `ESCALATE`.
- Only the orchestrator writes `factory/board.json`.
- Risky changes (auth, payments, secrets, data, CI/deploy config, major
  dependencies) always escalate to a person.

If you add a file the factory needs at runtime, add it to `MANAGED_FILES` (or
`SEED_FILES`) in `install.sh` and to `MANAGED` in `tests/test-install.sh`.

## Review and merge

- The maintainer reviews every pull request. Expect questions or requested changes.
- Pull requests are merged into `dev` with a merge commit.
- Changes reach users when `dev` is released to `main` and tagged; see
  [Branching and releases](README.md#branching-and-releases).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers this project.
