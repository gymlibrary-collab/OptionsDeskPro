# Gate Approvals — Position Lifecycle & Risk Monitor Improvements

**Feature folder:** `docs/FeatureRequests/position-lifecycle-riskmonitor-18Jul2026/`

---

## Gate 1 — BA Spec

| | |
|---|---|
| **Document** | `01-spec.md` |
| **Approved by** | leonard.simgt@gmail.com |
| **Date** | 2026-07-18 |
| **Notes** | Open questions resolved: OQ-1 collapsible "Closed Positions" section; OQ-2 last 90 days of closed trades; OQ-3 yes — `GET /api/portfolio` also triggers auto-settle; OQ-4 buy-to-close at intrinsic (no share assignment simulation); OQ-5 field label "Closing price (per contract)". |

☑ Approved &nbsp; ☐ Changes Requested

---

## Gate 2 — Architecture Design

| | |
|---|---|
| **Document** | `02-design.md` |
| **Approved by** | leonard.simgt@gmail.com |
| **Date** | 2026-07-18 |
| **Notes** | Approved with two amendments for Gate 3: (1) allow $0.00 closing price on close legs — remove the $0.01 floor for closes only, opens keep the floor; (2) late-sweep settlement of past-expiry legs must fetch the underlying's official close on the expiry date from yfinance daily history and compute intrinsic from that (not the current spot). |

☑ Approved &nbsp; ☐ Changes Requested

---

## Gate 3 — Implementation Diff

| | |
|---|---|
| **Branch / PR** | |
| **Approved by** | |
| **Date** | |
| **Key files changed** | |
| **Notes** | |

☐ Approved &nbsp; ☐ Changes Requested

---

## Gate 4 — Test Report

| | |
|---|---|
| **Document** | `04-test-report.md` |
| **Automated tests added** | |
| **All AC covered** | Yes / No |
| **Approved by** | |
| **Date** | |
| **Notes** | |

☐ Approved &nbsp; ☐ Changes Requested

---

## Gate 5 — Security Review

| | |
|---|---|
| **Document** | `05-security-review.md` |
| **Overall decision** | PASS / CONDITIONAL PASS / FAIL |
| **Critical findings** | |
| **High findings** | |
| **Approved by** | |
| **Date** | |
| **Notes** | |

☐ Approved &nbsp; ☐ Changes Requested

---

## Gate 6 — Deployment & Documentation

| | |
|---|---|
| **Document** | `06-release-note.md` |
| **Deployed to** | Railway |
| **Deployment date** | |
| **User Guide updated** | Yes / No / N/A |
| **Approved by** | |
| **Date** | |

☐ Released
