# Low-Level Design — Part 7: Readiness Assessment

---

## 15. Readiness Assessment

### 15.1 Is the Design Ready for Implementation?

**Yes, conditionally.** The LLD (Parts 1–6, this document's companions `10_LLD_01...` through `15_LLD_06...`) is internally consistent, traces every class/module back to a specific Business Rule Book entry or ADR, and defines a concrete package structure, canonical model, exception hierarchy, and testing strategy detailed enough for multiple developers to implement independently without inventing their own conventions. **The condition is that the business decisions already flagged in `09_FINAL_READINESS_REPORT.md` are resolved before the Epics that depend on them start** — this LLD does not reduce that dependency, it makes it more precise (see §15.3, which maps each unresolved ADR to the exact class(es) it blocks).

| LLD Readiness Dimension | Assessment |
|---|---|
| Package structure & import layering | Ready — zero ambiguity, CI-enforceable (import-linter) |
| ICAM design | Ready — every generator's data dependency is fully specified |
| Class-level interfaces | Ready — every class in Part 2 §4 has a stated interface; implementation is a mechanical exercise from here for ~70% of classes |
| Configuration schema | Ready structurally; **2 fields are explicit placeholders** pending business ADRs (`acronym`, license-template entries) — see §15.3 |
| Logging/exception framework | Ready — no open questions |
| Pipeline/scalability design | Ready structurally; **one design parameter (concurrency mechanism) is explicitly deferred to empirical measurement**, not business decision — see §15.2 |
| Validation framework | Ready — plugin architecture fully specified |
| Testing architecture | Ready — test folder structure and per-category strategy fully specified |
| Deployment architecture | Ready structurally; **specific AWS orchestrator choice (Batch/ECS/k8s) deferred to DevOps/Infra team**, not a blocker to starting `src/` development | 
| Coding standards | Ready — no open questions |

**Overall: the LLD is ready to start Phase 1 (Foundation) immediately, and ready to start Phases 2–3 as soon as the "must resolve first" business ADRs (031, 018, 028) land, per the existing recommendation in `09_FINAL_READINESS_REPORT.md`.**

### 15.2 Remaining Technical Questions (Engineering-Owned — Do NOT Require Business/Stakeholder Sign-Off)

These are implementation-detail decisions this LLD deliberately left open because they are best resolved by measurement/engineering judgment during early implementation, not by upfront design debate. Each has a low cost of being wrong and revised later — unlike the business ADRs, none of these blocks other work if left unresolved a little longer, and none needs a Portland Press/Silverchair-side answer.

**TQ-01 — Concurrency mechanism: process pool vs. thread pool vs. asyncio hybrid.**
Part 4 §9.1 recommends a process pool as the default but explicitly designed `WorkerPool`'s interface to be swappable. Resolve via: implement the process-pool version first (simplest to reason about), profile against TC-142/151, revisit only if profiling shows the mix of I/O-bound and CPU-bound work would benefit from a hybrid model. **Owner: Engineering Lead. Timing: resolve during Phase 7 (Performance Optimization), not before.**

**TQ-02 — Whether within-article generator concurrency (manifest/reviews/transfer running concurrently, Part 4 §8.1–8.2) is worth its complexity versus simple sequential generation.**
The design permits it but does not mandate it — sequential generation is a valid, simpler first implementation. Resolve via: implement sequentially first, measure per-article latency, only parallelize this specific fan-out if profiling shows it matters (the 3 generators involved are individually fast — XML string assembly, not heavy computation — so the benefit may be negligible). **Owner: Engineering Lead. Timing: Phase 4, revisit in Phase 7.**

**TQ-03 — Checkpoint Store and DOI Registry backend technology: Postgres vs. DynamoDB vs. another option.**
Part 5 §12.3 suggests RDS Postgres as a default; Part 2 §4.11/4.12 deliberately abstracted both behind a `backends/` plugin interface specifically so this choice doesn't ripple through the rest of the codebase. Resolve via: whichever the Infra team already has operational expertise/tooling for — this is an operational-fit decision, not a correctness one, given the abstraction. **Owner: Engineering Lead + DevOps. Timing: before Phase 1 ends (needed for Checkpoint Store to exist at all).**

**TQ-04 — AWS compute orchestrator for the batch job: AWS Batch vs. ECS Task vs. Kubernetes Job.**
Part 5 §12.3 leaves this to `infra/`. Resolve via: whichever the organization already operates elsewhere, to minimize new operational surface area. **Owner: DevOps/Infra Lead. Timing: needed by Phase 8 (Production Deployment), not earlier.**

**TQ-05 — Exact backoff/jitter parameters for the Retry Manager.**
`runtime.yaml`'s illustrative values (§5.7: base 2s, multiplier 2.0, max 60s) are placeholders. Resolve via: load-testing against realistic S3/DB failure-rate assumptions during Phase 7. **Owner: Engineering Lead. Timing: Phase 7.**

**TQ-06 — Disk-space safety threshold for the pre-flight/periodic check (Part 4 §9.4).**
Needs a concrete number (e.g. "pause new dispatch below 10% free space") tuned to actual worker host sizing, which isn't finalized until TQ-04 is resolved. **Owner: Engineering Lead + DevOps. Timing: Phase 7.**

**TQ-07 — Worker count (`runtime.yaml`'s `concurrency.worker_count`) starting value and autoscaling policy (if any).**
Explicitly deferred to empirical tuning per TC-142/151 in Part 5 §11.5. **Owner: Engineering Lead. Timing: Phase 7.**

**TQ-08 — Whether debug-category logging (Part 3 §6.3) should ever be selectively enabled for one specific in-flight article in production (for live troubleshooting) versus only in local/dev environments.**
A genuinely useful operational capability, but not yet designed (would need a safe, scoped, temporary-enablement mechanism, not a blanket flag). **Owner: Engineering Lead. Timing: nice-to-have, revisit post-launch (Phase 8+) based on real incident experience.**

**TQ-09 — Synthetic fixture authoring approach: hand-authored XML per scenario, or a small fixture-generator utility that mutates a real sample programmatically.**
Part 5 §11.4 describes the fixture library's purpose and growth policy but not how fixtures are physically produced. A generator utility (itself a test-support tool, explicitly out of scope for "no production code" since it never ships) would scale better than hand-authoring for the ~100+ needed fixtures. **Owner: QA Lead. Timing: Phase 2–3, needed before Phase 4's generator development can be fully tested.**

**TQ-10 — Whether `ArticlePipeline` instances are created fresh per article or pooled/reused across articles within one worker process (Part 2 §4.16 left this explicitly open).**
Low-risk either way given the stateless design of every dependency it holds; resolve via whichever is more idiomatic for the chosen concurrency mechanism (TQ-01). **Owner: Engineering Lead. Timing: Phase 2.**

**TQ-11 — API documentation generation tooling specifics (`mkdocs` + `mkdocstrings` was suggested in Part 5 §13.4 as an example, not a firm choice).**
Purely a developer-experience tooling choice. **Owner: Engineering Lead. Timing: any time before Phase 8.**

**TQ-12 — Event-driven input path (ADR-019's secondary option) concrete queue technology (SQS vs. other), if/when it's actually built.**
Part 4 §9.2 notes the `WorkerPool.submit` interface accommodates either an in-memory iterable or a queue-backed iterator, but the event-driven path itself is out of scope for the initial batch-pull-only build per ADR-019's primary recommendation. **Owner: Engineering Lead. Timing: not needed until this feature is actually prioritized — no current roadmap phase requires it.**

### 15.3 Business ADRs This LLD Newly Confirms as Blocking (Cross-Reference)

This LLD did not resolve any of the 29 outstanding ADRs from `02_ARCHITECTURE_DECISION_RECORDS.md` — that was never in scope here — but it does sharpen exactly which classes/files sit idle without each answer, which should accelerate the decision-review session recommended in `09_FINAL_READINESS_REPORT.md`:

| ADR | Blocks (LLD-specific) |
|---|---|
| ADR-031 (defect-replication policy) | `tests/golden/expected_output/` cannot be authored at all until this is answered — blocks Phase 8's entire acceptance-testing plan, and blocks §11.3's golden-test design from being executable |
| ADR-018 (metadata source strategy) | `extraction.kriyadocs_parser`'s scope (Part 2 §4.2) — whether it remains the *only* metadata source or needs a sibling `extraction.api_source` module from day one |
| ADR-028 (multi-tenancy) | `config/journals/`, `config/publishers/` structure (§5.2–5.3) is already multi-tenant-shaped at negligible cost, but whether Epic 14 / TC-184–187 are in scope at all depends on this |
| ADR-007 (journal acronym) | `config/journals/clinical-science.yaml`'s `acronym` field (§5.2) is a literal placeholder (`"<CONFIRM-VIA-ADR-007>"`) — **`generators.transfer_xml.generator.TransferXmlGenerator` cannot be correctly implemented or tested until this is set** |
| ADR-002 (non-CC-BY license text) | `config/license-templates.yaml` (§5.4) has exactly one entry (CC BY) — `generators.article_xml.license_builder` and `LicenseMappingError`'s "unmapped → fail" behavior can be implemented now, but cannot be *fully tested* until at least one non-CC-BY template is confirmed |
| ADR-015 (DOI uniqueness scope) | `registry.doi_registry.DoiRegistry`'s `reserve()` scope parameter (per-journal vs. global, Part 2 §4.11) needs this to size the backend schema correctly (TQ-03 depends on it too) |
| ADR-017 / ADR-022 (atomicity / checkpointing) | Already assumed resolved throughout this LLD (Part 4 §9.5, sequence diagram 14.4) — **if the actual business/architecture sign-off differs from the "atomic, redo-from-scratch" design assumed here, Parts 4 and the sequence diagrams need rework**, so confirming these two specifically protects against the most expensive possible rework in this LLD |
| ADR-003 (reviewer PDF: link vs. package) | `generators.reviews_xml`'s handling of `WorkflowLog.attachment_url` (Part 2 §3.4) currently models only the "link" case structurally; the "fetch and package" alternative would need a new field/class not yet designed |
| ADR-004 / ADR-005 (reviews.xml scope toggles) | Already structurally accommodated via `feature-flags.yaml` (§5.8) and `CorrespondenceEvent.event_kind` (Part 2 §3.4) — **no rework needed regardless of the answer**, only a config-value flip, which is a specific point of confidence this LLD adds beyond the earlier ADR document |

### 15.4 Recommendation

1. Proceed immediately with Phase 1 (Foundation) — nothing in §15.2's technical questions or §15.3's ADR list blocks `model/`, `config/`, `exceptions/`, `checkpoint/`(interface), or CI/CD scaffolding work.
2. Resolve ADR-031, ADR-018, ADR-028 before Phase 2 starts (unchanged from the prior Final Readiness Report — this LLD reinforces rather than changes that sequencing).
3. Resolve ADR-007 and ADR-002 before Phase 4's `generators.transfer_xml` and `generators.article_xml.license_builder` implementation specifically begins (not before Phase 4 starts generally — `raw_xml`, `manifest_xml` work can proceed in parallel without them).
4. Assign TQ-03 (backend technology) and TQ-09 (fixture authoring approach) owners this week — both are on the Phase 1–2 critical path even though neither requires business sign-off.
5. Treat §15.3's ADR-017/ADR-022 row as the highest-value confirmation to seek explicitly and early, given it protects the most design work already committed to paper in this LLD.

**No code should be written until step 2's three ADRs are confirmed — this LLD is the blueprint, not yet the green light.**
