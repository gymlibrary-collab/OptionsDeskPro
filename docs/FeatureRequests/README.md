# OptionsDesk — Feature Requests

This folder tracks all features through the gated SDLC workflow.
Each feature lives in its own subfolder named `<feature-slug>-<ddMMMyyyy>`.

## Active Features

| Feature | Folder | Stage | Status |
|---------|--------|-------|--------|
| _(none yet)_ | — | — | — |

## Completed Features

| Feature | Folder | Released |
|---------|--------|----------|
| _(none yet)_ | — | — |

---

## Folder structure per feature

```
<feature-slug>-<ddMMMyyyy>/
  01-spec.md            BA spec — requirements, user stories, acceptance criteria
  02-design.md          Architect design — API contracts, schema, caching, frontend state
  03-approvals.md       Gate log — who approved what and when
  04-test-report.md     QA + manual test results
  05-security-review.md Security audit findings and gate decision
  06-release-note.md    Release notes, deployment steps, rollback procedure
```

## Gate sequence

```
[BA spec] → approve → [Architect design] → approve →
[Developers build] → approve diff →
[Tester validates + QA automates] → approve →
[Security Reviewer audits] → approve →
[Operator deploys + TechWriter documents]
```

Say **approve** to advance any gate, or give feedback to request changes.

## Adding a new feature

1. Describe the feature to the AI.
2. The business-analyst agent runs and writes `01-spec.md` to a new folder named `<feature-slug>-<ddMMMyyyy>`.
3. Follow the gate sequence above to completion.
