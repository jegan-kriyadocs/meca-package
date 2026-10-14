# Technical Debt Review — Milestone 8

Re-examines every previously identified item (Milestone 6H's Technical
Debt Register, Milestone 7's Known Limitations and Open Questions) plus
the original project-level Risk Register, verifying each against the
**current** codebase — not merely re-quoting the original claim.

## Consolidated status table

| ID | Item | Original Priority | Still Valid? | Status | Current Priority | Recommendation |
|---|---|---|---|---|---|---|
| TD-1 | manifest.xml round ordering (`RoundInfo.label` vs. physical round folder mismatch) | Critical | **Yes** — `round_resolver.py`'s `label = get_attribute(element, "article-version-type")` unchanged, confirmed via direct read this milestone | Open | Critical | Requires business confirmation of round-naming semantics before `round_resolver.py` can be changed |
| TD-2 | ADR-007 journal acronym ambiguity | High | **Yes** — `_UNCONFIRMED_PLACEHOLDER_PREFIX = "<CONFIRM-VIA-"` mechanism still active in `config/loader.py`, confirmed this milestone | Open | High | Business/publisher confirmation required before onboarding any journal beyond the 3 known |
| TD-3 | DOI uniqueness not implemented | High | **No — Resolved** | **Resolved** by Milestone 7 (`DoiRegistry`/`InMemoryDoiRegistry`, wired into `PackageBuilder`) | Closed | Durable backend still needed for cross-run durability (tracked as PA-1, not a reopening of TD-3) |
| TD-4 | Atomic 5-file generation not implemented | High | **No — Resolved** | **Resolved** by Milestone 7 (`PackageBuilder`'s `os.replace`/`except BaseException` mechanism, extensively tested) | Closed | None — per-article atomicity is proven; batch-level atomicity is a distinct, separately-tracked concern (see BR-160 note in the BR Audit) |
| TD-5 | manifest.xml file-completeness gap (CS-2025-6808: 53/74 files unresolved) | High | **Yes** — re-confirmed live via this milestone's own end-to-end trace: identical 74→21 split | Open | High | Requires Milestone 3/4 (`custom_meta_classifier.py`) investigation — unchanged, out of generation/packaging scope |
| TD-6 | BR-156 cross-validation test gap | Medium | **Yes** — grep confirms no test cross-references reviews.xml decisions against history dates | Open | Medium | Low-effort; add one targeted assertion |
| TD-7 | Corresponding-email selection discrepancy (CS-2025-8493_C) | Medium | **Yes**, unchanged | Open | Medium | Milestone 5B question, needs real-world confirmation of "primary email" rule |
| TD-8 | reviews.xml extended-scope fields never exercised | Medium | **Yes**, unchanged (confirmed via BR Audit §G) | Open | Medium | No action needed unless/until real data populates these fields |
| TD-9 | `article_id` casing quirk | Medium | **Yes**, unchanged | Open | Medium | Source-data/Milestone 3 question |
| TD-10 | Round-naming beyond Original/R1 unverified | Low | **Yes**, unchanged | Open | Low | Revisit only if a real 3+-round sample appears |
| TD-11 | CRLF/line-wrapping cosmetic differences | Low | **Yes**, unchanged, by design | Open (no action needed) | Low | None recommended |
| TD-12 | Reference-package-internal defects (never replicated) | Low | **Yes**, unchanged | Open (informational only) | Low | None — correctly not replicated |
| TD-13 | Report numbering gap (missing `26_`) | Low | **Yes**, unchanged | Open (cosmetic) | Low | None |
| PA-1 | No durable DOI Registry / Checkpoint Store backend | High | **Yes** — confirmed only `InMemoryDoiRegistry`/`InMemoryCheckpointStore` exist, both thread-safe but process-local | Open | High | Implement a Postgres/DynamoDB backend for each `ABC`; no interface change needed |
| PA-2 | Output Writer / S3 publishing not implemented | High | **Yes** — `output/__init__.py` confirmed still a 0%-coverage empty stub | Open | High | Future milestone's own scope |
| PA-3 | Batch execution sequential only | Medium | **Yes**, unchanged, by design | Open (by design) | Medium | Deferred per explicit instruction; `PackageBuilder`'s stateless design does not block a future parallel scheduler |
| PA-4 | Concrete validation hooks not implemented | Medium | **Yes** — `validation/__init__.py` confirmed still 0%-coverage stub | Open | Medium | Future Validation Engine milestone's own scope |
| PA-5 | TD-1 restated (zip-content ordering) | Medium | **Yes**, same root cause as TD-1 | Open | (folded into TD-1) | See TD-1 |
| PA-6 | Zip archive-entry timestamps fixed at epoch | Low | **Yes**, by design | Open (no action needed) | Low | None recommended |
| PA-7 | Checkpoint "claim" stage reuses `ArticleStage.GENERATED` | Low | **Yes**, by design | Open (by design) | Low | Revisit only if generation/packaging become independently resumable |
| OQ-1 | Output-write retry granularity ambiguity (docs self-contradict) | — | **Yes**, genuinely unresolved — no Output Writer exists yet to resolve it against | Open | High (blocks Output Writer design) | Must be resolved before the Output Writer milestone begins |
| OQ-2 | `PACKAGED` vs. `published`/`archived` terminology for reporting | — | **Yes** | Open | Medium | Future Reporting module must distinguish these explicitly |
| OQ-3 | DOI Registry mandatory vs. opt-in | — | **Yes** — `PackageBuilder` still accepts `doi_registry=None` | Open | High | Whoever operates a real production batch must explicitly decide to wire a (durable) `DoiRegistry` |

## New item identified this milestone

| ID | Item | Priority | Status | Recommendation |
|---|---|---|---|---|
| **TD-14** | **No end-to-end orchestration wiring exists** — `RunController`/`cli/main.py`'s `run` command stops at `STAGED`; no code path invokes extraction → transform → generation → packaging as one production flow. Two CLI commands (`seed-doi-registry`, `rebuild-golden-baseline`) remain explicit placeholders whose own stated preconditions are now met. | **Critical** | Open — confirmed via direct code read (`48_COMPLETE_ARCHITECTURE_AUDIT.md` §7) | Build the next orchestration layer (`orchestrator/article_pipeline.py`, already named in `10_LLD_01`) wiring the existing, unchanged stages together, then extend `RunController`/`container.py`/`cli/main.py` to use it. This is the single blocking item for a real production run. |

## Risk Register (07_RISK_REGISTER.md) — status of the highest-priority original risks

| Risk | Status now |
|---|---|
| RISK-001 (journal acronym) | Still open — matches TD-2 |
| RISK-002 (non-CC-BY license) | Partially addressed — the mechanism (config-driven license templates) exists and is confirmed correct for CC-BY; no non-CC-BY value has ever been confirmed or tested (matches BR-065, BAO) |
| RISK-003 (reviewer-PDF attachment handling) | Still open — matches BR-108 (SSNE), ADR-003 unresolved |
| RISK-017 (DOI Registry / Checkpoint Store concurrency) | Partially addressed — correctness under concurrency is proven (dedicated thread-based tests for both `InMemoryDoiRegistry` and `InMemoryCheckpointStore`); true production-scale **stress** testing (many workers, sustained load) does not exist |
| RISK-018 (atomicity gap under exact crash timing) | Partially addressed — atomicity under synchronous exception injection is extensively proven (Milestone 7); true process-kill fault injection (the fault_injection/ directory's own stated "separate, slower nightly-only variant") does not exist |
| RISK-019 (restart/checkpoint gap) | Partially addressed — resume/skip/redo logic is proven under normal conditions (Milestone 7's `PackageBatchRunner` tests); the full "crash-at-every-stage matrix" fault-injection suite does not exist |
| RISK-020 (large supplementary files) | Still open — no load test with deliberately oversized synthetic files exists |
| RISK-021 (memory growth across a long batch) | Still open — `tests/performance/` remains empty; this milestone's own manual measurement (§ Performance Assessment) is a single-article, not long-run, data point |
| RISK-022 (S3 throttling) | Not yet applicable — no Output Writer/S3 code exists to throttle |

## Summary

- **2 items fully Resolved this review cycle** (TD-3, TD-4 — both by Milestone 7).
- **1 new Critical item identified** (TD-14 — missing orchestration wiring), which is also the underlying cause of the Test Coverage Audit's "integration/performance categories now overdue" finding and directly drives this milestone's Go/No-Go recommendation.
- **20 items remain open**, unchanged in substance from their prior determination — none has regressed, none was silently introduced by Milestones 6-7 beyond TD-14.
- **No item's priority should be downgraded** given Package Assembly's completion, except TD-3/TD-4 which are now closed entirely. TD-1 remains Critical and is now the single most load-bearing unresolved business ambiguity in the whole system (it affects 3 separate generators' output, per the Business Rule Audit).
