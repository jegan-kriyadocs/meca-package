# Implementation Roadmap — MECA Package Generation Engine

Phased plan mapping directly to the Epics in `04_PRODUCT_BACKLOG.md` and the Modules in `05_SYSTEM_MODULE_BREAKDOWN.md`. Complexity ratings: **Low / Medium / High / Very High**. Durations assume a small dedicated team (3–5 engineers + 1 QA) at typical enterprise velocity; adjust to actual staffing.

**Hard prerequisite for Phase 1 to start:** ADR-031 (defect-replication policy) and the highest-priority ADRs (007, 002, 015, 017, 018, 022) should be resolved first — several later phases are blocked on them, and resolving them early prevents costly mid-build rework (see Risk Register RISK-004, RISK-007).

---

## Phase 1 — Foundation
**Scope:** Configuration Manager, Checkpoint Store, DOI Registry Service (skeleton), Logging Framework, project scaffolding, CI/CD pipeline, environment provisioning (S3 buckets, dev/test AWS accounts).
**Backlog mapping:** Epic 2 (Configuration Management), foundational parts of Epic 10 (Checkpoint Store) and Epic 11 (Logging), Epic 15 Feature 15.2 start (synthetic fixture library scaffolding).
**Complexity:** Medium. **Duration:** ~2 sprints (4 weeks).
**Exit Criteria:** Config schema covers every identified constant (Business Rule Book §A–J); Checkpoint Store supports atomic per-article state read/write; structured logging schema implemented and emitting to a real log sink; CI pipeline runs the (still-empty) test suite on every commit.
**Key Risk:** RISK-004, RISK-007 (unresolved ADRs blocking config schema design).

## Phase 2 — Input Processing
**Scope:** Input Reader, Metadata Extractor, File Resolver.
**Backlog mapping:** Epic 1 (all features/stories).
**Complexity:** High (the Metadata Extractor must correctly classify the full custom-meta vocabulary, including open-ended/unmapped categories per BR-019).
**Duration:** ~2 sprints (4 weeks).
**Exit Criteria:** All 3 real sample articles parse into a correct, complete internal model (verified by manual/automated comparison against the Business Rule Book's field-by-field mapping); TC-001–010 and TC-037–048 (input-side subset) pass.
**Key Risk:** RISK-009 (source-format drift), RISK-011 (unmapped values at scale).

## Phase 3 — Transformation Engine
**Scope:** Transformation Engine coordinator; internal-model round-ordering and grouping logic; the shared confidential/non-confidential comment-splitting logic used by the Review Generator.
**Backlog mapping:** Bridges Epic 1 output to Epics 3–7; Epic 12 (Multi-Round Processing) largely belongs here.
**Complexity:** Medium.
**Duration:** ~1 sprint (2 weeks).
**Exit Criteria:** Round-ordering resolves correctly against all 3 real samples and the synthetic 3-round/10-round fixtures (TC-130–137); no round-count assumptions hard-coded.
**Key Risk:** RISK-016 (multi-round generalization untested against real 3+-round data).

## Phase 4 — MECA XML Generation
**Scope:** All 5 generators — Raw XML, Article XML (incl. DOI generation + DOI Registry integration + license synthesis), Manifest, Review (the largest and most interpretive generator), Transfer.
**Backlog mapping:** Epics 3, 4, 5, 6, 7 in full.
**Complexity:** Very High (Review Generator alone is XL-complexity per the Backlog; DOI Registry concurrency-safety adds cross-cutting complexity).
**Duration:** ~5–6 sprints (10–12 weeks) — the largest single phase by design effort, consistent with the Review Generator being flagged XL in the Backlog.
**Exit Criteria:** Output for all 3 real sample articles matches the confirmed field-by-field mapping in `01_BUSINESS_RULE_BOOK.md` for every "Confirmed" rule, and the chosen resolution for every applicable "Requires Business Confirmation" rule; TC-011–020 (generator-relevant subset), TC-049–187 (content-correctness sections) pass for the 3 real samples plus synthetic fixtures.
**Key Risk:** RISK-001, RISK-002, RISK-003 (unresolved business decisions directly blocking correct generator behavior), RISK-014 (DOI edge cases), RISK-024 (inconsistent defect-avoidance across generators built by different developers).

## Phase 5 — Validation
**Scope:** Validation Engine (structural, DTD, namespace, cross-file, severity-tiered per ADR-024), vendored DTD integration (per ADR-025's confirmed scope).
**Backlog mapping:** Epic 8 in full.
**Complexity:** High (DTD-validation performance is an open question, ADR-025/RISK-015).
**Duration:** ~2 sprints (4 weeks).
**Exit Criteria:** 100% of `03_TEST_SPECIFICATION.md` §1–16 (all content/structure/validation sections) pass against real + synthetic fixtures; severity-tiering behaves per ADR-024 (Critical/High block, Medium/Low warn-only).
**Key Risk:** RISK-015 (DTD validation performance at scale — must be measured here, not deferred).

## Phase 6 — Packaging
**Scope:** Package Builder (atomic staging/publish per ADR-017), Output Writer (operational + archival output per ADR-029), Error Recovery Module, Retry Manager.
**Backlog mapping:** Epic 9 in full, Epic 10 in full.
**Complexity:** High (atomicity + restart correctness are subtle to get right and expensive to get wrong — RISK-018, RISK-019).
**Duration:** ~3 sprints (6 weeks).
**Exit Criteria:** 100% of `03_TEST_SPECIFICATION.md` §14, 20, 21, 23, 24 (Package Validation, Recovery, Retry, S3 Failure, Packaging Errors) pass, including every forced-kill/fault-injection scenario.
**Key Risk:** RISK-017, RISK-018, RISK-019 (concurrency, atomicity, and restart correctness — the highest-consequence technical risks in the whole project).

## Phase 7 — Performance Optimization
**Scope:** Parallel-processing tuning (Epic 13), memory-safety validation at scale, S3 throughput tuning, DTD-validation performance mitigation if RISK-015 materializes, monitoring/alerting rollout (Epic 11 Feature 11.3).
**Backlog mapping:** Epic 13 in full, remaining Epic 11 features.
**Complexity:** High (requires realistic full-scale synthetic batch infrastructure to test against).
**Duration:** ~2–3 sprints (4–6 weeks).
**Exit Criteria:** 100% of `03_TEST_SPECIFICATION.md` §17–19, 22 (Performance, Memory, Large Batch, Parallel Processing) pass at target production scale (6,000–10,000+ synthetic articles); monitoring dashboards and alerting live against the test environment.
**Key Risk:** RISK-020, RISK-021, RISK-022 (large-file staging, memory leaks, S3 throttling at scale).

## Phase 8 — Production Deployment
**Scope:** Final acceptance testing against all 3 real sample packages (strict-replication regression baseline, Epic 15 Feature 15.1), production environment cutover, on-call runbook activation, first live production run (closely monitored, possibly at reduced initial batch size before ramping to full 6,000–10,000+ scale).
**Backlog mapping:** Epic 15 in full; operational readiness activities outside the Backlog's Epics proper.
**Complexity:** Medium (mostly operational/process, assuming Phases 1–7 are solid).
**Duration:** ~1–2 sprints (2–4 weeks), plus a monitored ramp-up period post-launch.
**Exit Criteria:** Regression baseline (TC-120) signed off; on-call rotation and runbook in place (RISK-025 closed); first production run at reduced scale completes with an acceptable failure rate before full-scale ramp-up is approved.
**Key Risk:** RISK-025 (undefined ownership), and re-emergence of any risk from earlier phases that wasn't fully closed.

---

## Roadmap Summary

| Phase | Complexity | Duration (est.) | Primary Blocking Risks |
|---|---|---|---|
| 1. Foundation | Medium | 4 weeks | RISK-004, RISK-007 |
| 2. Input Processing | High | 4 weeks | RISK-009, RISK-011 |
| 3. Transformation Engine | Medium | 2 weeks | RISK-016 |
| 4. MECA XML Generation | Very High | 10–12 weeks | RISK-001, RISK-002, RISK-003, RISK-014, RISK-024 |
| 5. Validation | High | 4 weeks | RISK-015 |
| 6. Packaging | High | 6 weeks | RISK-017, RISK-018, RISK-019 |
| 7. Performance Optimization | High | 4–6 weeks | RISK-020, RISK-021, RISK-022 |
| 8. Production Deployment | Medium | 2–4 weeks + ramp-up | RISK-025 |
| **Total** | | **~34–40 weeks (≈8–9 months)** | |

This is a **rough-order-of-magnitude estimate for a small dedicated team**, assuming ADR resolution happens promptly at each phase boundary rather than mid-phase. Unresolved business decisions are the single largest source of schedule risk in this roadmap — see `02_ARCHITECTURE_DECISION_RECORDS.md` and the Final Report's Outstanding Business Decisions list.
