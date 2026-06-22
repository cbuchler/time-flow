# Empty States

Empty states use guided onboarding tone: compact, calm, and action-oriented.

## First Run

Home opens with a guided state when no project/task exists. Primary action leads to creating a project and then a reusable task before starting a timer.

## No Projects

Disable start actions that require a project. Show a direct create-project action.

## No Tasks

When a project has no active tasks, the task field prompts inline creation. Start remains disabled until a task is valid.

## No Active Session

Home shows idle status and the primary New Timer action. Focus remains available once a project/task exists.

## No Entries Today

Today section remains visible with a compact "No time logged today" state and a New Timer action.

## No Week Data

Week strip remains visible with zero bars and a zero total. Do not hide the section.

## Recovery/Error

Missing config/database is repaired locally by creating defaults. Corrupt config/database shows a local recovery error and never attempts online repair.
