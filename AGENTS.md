# AGENTS.md

This file defines the working rules for the coding agent in this project.
If the user does not provide a newer direct instruction, follow the rules below.

## 1. Purpose

The agent should help the project grow predictably:

- keep the directory layout consistent;
- create new files only in appropriate places;
- avoid mixing business logic, infrastructure, and utility code;
- keep `PLAN.md` up to date;
- record important architectural decisions inside the repository.

## 2. Default project structure

The user approved a TypeScript full-stack architecture for this repository.
Use the structure below unless a newer direct instruction changes it:

```text
src/
  app/                 # active Vite/React frontend
  legacy/              # previous MVP / reference implementation
  main.tsx
  styles/
server/
  ai/                  # LLM integrations
  exports/             # server-side export helpers
  http/                # Express app and entrypoints
  persistence/         # SQLite storage
shared/
  domain/              # schemas, catalog, geometry, project engine
  exporters/
tests/
  integration/
  legacy/
  unit/
docs/
PLAN.md
AGENTS.md
```

## 3. File placement rules

- The client entry point should stay in `src/main.tsx`.
- Frontend application code should live in `src/app/`.
- Legacy code that is intentionally kept but not used by the active app should live in `src/legacy/`.
- Shared domain contracts and deterministic layout logic should live in `shared/domain/`.
- HTTP/API entrypoints should live in `server/http/`.
- LLM integrations should live in `server/ai/`.
- Persistence code should live in `server/persistence/`.
- Export helpers that depend on server/runtime concerns should live in `server/exports/`.
- Tests should live in `tests/` and should mirror the source structure when practical.
- Architecture and process documentation should live in `docs/` once it outgrows `AGENTS.md` or `PLAN.md`.

## 4. Rules for creating new files

- Do not create new files in the repository root unless there is a clear reason.
- Before creating a file, check whether the work belongs in an existing module.
- Every new file should have one clear responsibility.
- File names should describe responsibility and should not be vague names like `helper.py`, `temp.py`, or `misc.py`.
- If a new module is created, a matching test should also be added or planned.
- If the task introduces a new subsystem, record it in `PLAN.md` before or during implementation.

## 5. Rules for changing structure

- Do not change the directory structure silently.
- If the current structure is no longer enough, update `PLAN.md` first in `Decisions` or `Next`.
- If the change affects architecture, add a short explanation for why it is needed.
- If a new application layer is introduced, document its purpose in `AGENTS.md` or `docs/architecture.md`.

## 6. Quality rules

- Prefer small cohesive modules over large mixed-responsibility files.
- Avoid duplicated logic.
- Follow consistent naming conventions.
- Do not add temporary files, drafts, or one-off artifacts to the repository without a clear need.
- Add or update tests together with code whenever practical.

## 7. Mandatory PLAN.md workflow

`PLAN.md` is a live working document and must stay current.

Before meaningful work starts, the agent should:

- read `PLAN.md`;
- review the current task context;
- update `In Progress` if a new task has started.

After meaningful work is finished, the agent should:

- move completed items to `Done`;
- update `Next`;
- add newly discovered follow-up tasks to `Backlog`;
- record important decisions and assumptions.

## 8. Required PLAN.md sections

`PLAN.md` should contain:

- `Goal` - what we are building now;
- `Architecture / Structure` - current structure and architectural agreements;
- `Backlog` - known tasks that are not started yet;
- `In Progress` - what is actively being worked on;
- `Done` - completed work;
- `Decisions` - important architectural and process decisions;
- `Next` - the nearest next steps.

## 9. Agent behavior rules

- If the user request conflicts with the agreed structure, first propose the correct placement.
- If the structure is still undefined, use the default structure from this file.
- If the user approves a new structure, update `AGENTS.md` and follow the new version.
- If the task does not fit the current architecture, do not improvise silently; record the change in `PLAN.md`.

## 10. Instruction priority

Priority order:

1. Direct user instruction.
2. This file `AGENTS.md`.
3. Current `PLAN.md`.
4. Standard engineering judgment.
