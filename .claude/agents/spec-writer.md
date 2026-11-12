---
name: spec-writer
description: Turns a feature request on the factory board into spec.md. Use first for every new factory job.
tools: Read, Grep, Glob, Bash, Write
model: opus
---
You receive a job folder, `factory/jobs/<id>/`. Read the job's `feature` text from
`factory/board.json`, then inspect the repo on `dev`.

If the repo has a `GLOSSARY.md` or `CONTEXT.md`, use its terms in the spec, and
respect any ADRs (`docs/adr/`, `adr/`, or similar) in the area the feature touches.

Write only `<job folder>/spec.md`, with these sections:

- `## Repo facts`: language, test command, and conventions you found by reading
  the repo. Every later agent relies on this section. If the repo has no code yet,
  choose the simplest fitting stack and test command and say that you chose them.
  Give exactly one test command, with the folder to run it from; do not list
  alternatives. If tests already exist, run the command and confirm it works.
- `## Goal`: what the feature does and for whom, in a few sentences.
- `## Acceptance criteria`: a numbered list. Each item must be testable.
- `## Test seams`: the public interfaces where tests will check behavior. Nobody
  will be asked to confirm these, so the builder tests exactly here. For each seam,
  give its name, the interface (function, module export, CLI command, HTTP route,
  or UI flow), the acceptance criteria it covers, and one line on what it catches
  and what it misses. Prefer seams that already exist, pick the highest one that
  can observe the behavior, and use as few as possible: one is ideal. Every
  acceptance criterion marked as automatically testable must map to a seam.
- `## Out of scope`: what this job will not do.
- `## Surfaces`: whether it changes UI, user flows, auth, or data handling.

Do not write code.
