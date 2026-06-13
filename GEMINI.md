# Repository Guidelines

## Project Structure & Module Organization
Keep repository content organized by purpose.

- `README.md`: project overview and onboarding.
- `docs/`: supporting documentation (plans, notes, specifications).
- `.github/ISSUE_TEMPLATE/`: issue templates for consistent task tracking.

Add new files in the closest existing directory, and use clear, descriptive names (for example, `feature-auth.md` or `release-plan-q2.md`).

## Build, Test, and Development Commands
Use these common commands during development:

- `rg --files`: list repository files quickly.
- `git log --oneline -n 20`: review recent commit messages.
- `sed -n '1,200p' <file>`: inspect file contents from the terminal.
- `gh issue create --template <template.yml>`: open a new issue from a template.

If build or test tooling is added later, document project-specific commands in `README.md` and keep this guide in sync.

## Coding Style & Naming Conventions
Follow existing patterns in each file type and keep changes consistent.

- Use concise Markdown headings and short paragraphs.
- Prefer kebab-case for documentation file names.
- Keep labels, status values, and field names consistent across files.
- Avoid introducing new terminology when an equivalent term already exists in the repository.

## Architecture & Evolution
Prioritize long-term maintainability over short-term local fixes.

- Default to designs that remain consistent as features expand, not one-off patches for a single flow.
- Centralize domain rules and state-transition logic so every entry point follows the same behavior.
- Avoid adding route- or UI-specific exceptions when a shared rule can solve the same problem.
- Before implementing, evaluate whether the change reduces or increases future branching paths and maintenance cost.
- If a short-term workaround is unavoidable, document the limitation and a concrete follow-up plan to converge back to the long-term design.

## Testing Guidelines
Before opening a pull request, verify:

- Related files are internally consistent.
- Linked issues, references, and status values are accurate.
- Any changed instructions are actionable and unambiguous.

When automated tests are introduced, run them locally and include the command(s) used in the PR description.

## Commit & Pull Request Guidelines
Write commit messages in imperative form and keep them specific.

- Good example: `Add issue template for onboarding tasks`
- Avoid: `Update stuff`

For pull requests:

- Summarize what changed and why.
- Link related issues.
- Note follow-up work, if any.
- Include screenshots only when visual output changed.
