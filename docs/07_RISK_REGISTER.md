# Risk Register — MECA Package Generation Engine

Probability/Impact: **Low / Medium / High**. Priority = derived from Probability × Impact, expressed as **P0** (critical, must mitigate before build) through **P3** (monitor only). Owner is expressed as a role, not a named individual — assign at project kickoff.

---

## A. Business / Requirements Risks

| Risk ID | Description | Probability | Impact | Mitigation | Owner | Priority | Expected Outcome |
|---|---|---|---|---|---|---|---|
| RISK-001 | Wrong `transfer.xml` journal acronym shipped to production (ADR-007 unresolved) causes silent mis-routing or rejection at Silverchair | Medium | High | Resolve ADR-007 directly with Silverchair/Portland Press before Epic 7 development begins; add TC-125 as a release gate | Business Stakeholder (Publisher liaison) | P0 | Acronym confirmed and locked in config before first production run |
| RISK-002 | Non-CC-BY license text (ADR-002) is never confirmed, blocking any non-open-access article from processing correctly at go-live | Medium | High | Confirm license-table for all License Type values in use before Epic 4 Feature 4.3 development | Business Stakeholder (Legal/Publishing) | P0 | Full license-table confirmed pre-launch |
| RISK-003 | Reviewer-PDF-attachment handling (ADR-003) ships as "link only" but Silverchair actually requires self-contained packages, causing downstream ingestion failures discovered only in production | Medium | High | Confirm Silverchair's actual ingestion requirement before Epic 6 Feature 6.1.1c; do not default silently | Business Stakeholder (Publisher liaison) | P0 | Confirmed requirement drives implementation choice pre-launch |
| RISK-004 | 31 ADRs and 28 "Requires Business Confirmation" business rules remain unresolved past the planned decision-review point, stalling development | High | Medium | Time-box a formal ADR review session before Sprint 1; track sign-off status explicitly (see Final Report §Outstanding Business Decisions) | Product Manager | P0 | All Critical-priority ADRs resolved before Sprint 1 starts |
| RISK-005 | Scope creep: "enterprise-grade" ambition (multi-tenancy, multi-region, rich dashboards) expands beyond what's actually needed for Clinical Science / Portland Press alone | Medium | Medium | Resolve ADR-028 (multi-tenancy) explicitly early — if only one journal/publisher is truly in scope, formally deprioritize Epic 14 and simplify Epic 2 | Product Manager | P1 | Explicit scope decision recorded, backlog trimmed if applicable |
| RISK-006 | Only 3 real sample packages exist; some confirmed rules (BR entries marked "Strongly Inferred") may not generalize to the full production corpus, surfacing as defects only after go-live | Medium | Medium | Build the synthetic fixture library (Backlog Feature 15.2) aggressively before claiming any "Strongly Inferred" rule is production-ready | QA Lead | P1 | Every Strongly Inferred rule has at least one synthetic fixture test before release |
| RISK-007 | Business stakeholders disagree with the "never replicate a defect" policy (ADR-031) after implementation has already started, forcing rework | Low | Medium | Resolve ADR-031 first, explicitly, before any generator development begins (it gates ADR-010/011 and others) | Product Manager | P1 | ADR-031 signed off in the first decision-review session |
| RISK-008 | Legal/compliance exposure from an incorrectly generated `<license>` statement reaching a published article | Low | High | Treat ADR-002 as a hard release gate for any non-CC-BY article path; require legal sign-off on the license-text config table | Business Stakeholder (Legal) | P0 | Legal-approved license-table before any non-CC-BY article is processed in production |

---

## B. Data Quality / Source-System Risks

| Risk ID | Description | Probability | Impact | Mitigation | Owner | Priority | Expected Outcome |
|---|---|---|---|---|---|---|---|
| RISK-009 | Kriyadocs source-system export format changes (new custom-meta keys, restructured workflow tags) without notice, breaking the Metadata Extractor silently | Medium | High | Metadata Extractor tolerates unknown elements (BR-005) by design; add schema-drift monitoring (alert on a spike in "unrecognized category key" warnings) | Engineering Lead | P1 | Schema-drift alerting in place before go-live |
| RISK-010 | Source data contains malformed/corrupted XML at a higher real-world rate than the 3 samples suggest (0% observed) | Medium | Medium | Build robust parse-error handling and the full TC-007–010, TC-044/045 test coverage; treat as expected, not exceptional | Engineering Lead | P1 | Malformed-XML articles fail cleanly and are isolated, never crash a batch |
| RISK-011 | A real production article has an unmapped file extension, unmapped custom-meta category, or unmapped License Type not covered by the 3 samples | High | Medium | ADR-008/009's fallback policies plus config hot-reload (Story 2.1.2/2.1.3) allow rapid correction without a full redeploy | Engineering Lead | P1 | Unmapped values flagged, not silently mishandled; config fix turnaround < 1 business day |
| RISK-012 | Unicode/encoding corruption (mojibake) on non-Latin author names or special characters at production scale, undetected by 3 largely-Latin-script samples | Medium | High | Full Unicode test section (TC-029–036) built and run against synthetic non-Latin fixtures before go-live | QA Lead | P0 | Zero Unicode-corruption defects in acceptance testing |
| RISK-013 | Source system's `[object Object]` and similar JS-serialization artifacts (BR-020) expand into other fields not yet observed, polluting output | Low | Low | Metadata Extractor explicitly ignores known-junk fields; add a generic "suspicious literal value" detector (e.g. `[object`, `undefined`, `NaN`) as a defensive check | Engineering Lead | P2 | No JS-artifact strings ever reach output XML |
| RISK-014 | DOI-id field contains characters beyond the `-`/`_` cases seen in the 3 samples, producing an unexpected/invalid DOI | Low | High | TC-055 fixture coverage; explicit character-stripping rule confirmed with business (ADR-058 extension) before broad rollout | Engineering Lead | P1 | DOI generation formula covers 100% of real character variance observed in a pre-launch data audit |

---

## C. Technical / Architecture Risks

| Risk ID | Description | Probability | Impact | Mitigation | Owner | Priority | Expected Outcome |
|---|---|---|---|---|---|---|---|
| RISK-015 | Full JATS-DTD validation on every one of 10,000 articles proves too slow, forcing a late architecture change (ADR-025) | Medium | Medium | Benchmark DTD validation cost (TC-140) early, in Sprint 9, not deferred to performance-hardening phase | Engineering Lead | P1 | DTD validation performance measured and a go/no-go decision made by end of Sprint 9 |
| RISK-016 | Multi-round generalization (0, 1, 3+ rounds) has a latent bug because only 2-round real samples exist, surfacing on real 3+-round articles in production | Medium | High | Mandatory synthetic 3-round and 10-round fixtures (TC-131, TC-132) as release gates for Epic 12 | QA Lead | P1 | Multi-round test fixtures pass before Epic 12 is marked done |
| RISK-017 | Concurrency bugs in the DOI Registry Service or Checkpoint Store (race conditions) cause duplicate DOIs or double-processed articles under real production concurrency | Medium | High | Dedicated concurrency stress testing (TC-167, TC-183) before any production run above minimal concurrency | Engineering Lead | P0 | Concurrency stress tests pass at target production concurrency level |
| RISK-018 | Package atomicity design (ADR-017) has a gap allowing a partial package to become visible under a specific failure timing (e.g. crash exactly between local staging and S3 publish) | Low | High | Explicit atomicity test (TC-118) with forced-kill fault injection at multiple precise points in the pipeline | QA Lead | P0 | Zero partial packages observed across all forced-kill fault-injection scenarios |
| RISK-019 | Restart/checkpoint logic has a gap causing either (a) reprocessing of already-complete articles (wasted cost) or (b) skipping articles that were actually incomplete (data loss) | Medium | High | Dedicated recovery test suite (TC-154–159) covering crash-at-every-stage scenarios | QA Lead | P0 | All recovery test cases pass, including crash-at-every-checkpoint-stage matrix |
| RISK-020 | Large supplementary files (GB-scale, foreshadowed by the RNA-seq `.xlsx` already in the samples) exceed the working-folder staging strategy's practical limits (ADR-020) | Medium | Medium | Load-test with deliberately oversized synthetic files (TC-102, TC-146) before assuming Option 1 (full local staging) holds at all real-world file sizes | Engineering Lead | P1 | Staging strategy validated against the largest realistic file size, or revised per ADR-020-A |
| RISK-021 | Memory leaks or unbounded memory growth across a long-running 10,000-article batch cause late-batch OOM crashes, wasting hours of already-completed work | Medium | High | Long-run memory profiling (TC-145) as a mandatory pre-production gate, not an optional nice-to-have | Engineering Lead | P0 | Flat memory profile demonstrated across a full-scale synthetic batch run |
| RISK-022 | S3 throttling/rate-limiting at high concurrency becomes a hard bottleneck not anticipated in the initial design | Medium | Medium | Throughput benchmarking (TC-143) during performance-testing phase; design for configurable concurrency backoff specifically for S3 calls | Engineering Lead | P1 | S3 throughput confirmed sufficient at target concurrency, or request-rate increase requested from AWS in advance |
| RISK-023 | Vendored DTD files (JATS/MECA) become outdated or mismatched against the actual DOCTYPE strings hard-coded in generator output, causing validation to pass against the wrong grammar | Low | Medium | Version-pin DTD files explicitly alongside the DOCTYPE strings in configuration; add a startup check that they match | Engineering Lead | P2 | DTD version consistency check passes at every deployment |
| RISK-024 | The "never replicate a defect" policy (ADR-031) is implemented inconsistently across the 5 generators (some defects fixed, others accidentally reproduced) due to multiple developers working independently | Medium | Medium | Code review checklist explicitly references the Human-Mistakes Catalogue (Business Rule Book §14 equivalent) for every generator PR | Engineering Lead | P1 | Zero known sample-defects reproduced in the strict-replication regression baseline (TC-120) beyond the explicitly-approved corrections |

---

## D. Operational / Production Risks

| Risk ID | Description | Probability | Impact | Mitigation | Owner | Priority | Expected Outcome |
|---|---|---|---|---|---|---|---|
| RISK-025 | On-call/support ownership for production failures is undefined at launch, delaying incident response | Medium | Medium | Resolve ADR-030's alerting-ownership question explicitly before go-live; document an on-call runbook | Engineering Lead / Ops | P1 | On-call rotation and runbook exist before first production run |
| RISK-026 | Archival storage costs grow unexpectedly at 6,000–10,000+ articles/run × ongoing runs, without a defined retention/lifecycle policy | Medium | Low | Resolve ADR-029's retention policy explicitly with a cost estimate before committing to "long-term" archival | Business Stakeholder / Finance | P2 | Retention policy and storage-class lifecycle rules defined and cost-estimated pre-launch |
| RISK-027 | Config-table changes (media-type mappings, license text, article-type mapping) made in production without proper review/versioning introduce silent regressions | Medium | Medium | Config stored in version control with mandatory PR review (ADR-027 Option 3), never edited directly in a live environment | Engineering Lead | P1 | 100% of config changes are traceable to a reviewed commit |
| RISK-028 | Second-journal onboarding (if pursued) reveals hidden Clinical-Science-specific assumptions baked into code despite the multi-tenancy design intent | Medium | Medium | Treat Epic 14's synthetic second-journal fixture (Story 14.1.1) as a mandatory design-validation exercise, even if a real second journal isn't imminent | Engineering Lead | P2 | Synthetic second-journal fixture processes correctly with zero code changes, only config changes |
| RISK-029 | Human reviewers/operators misinterpret a Medium/Low-severity warning as "the package is broken" (or vice versa, ignore a real Critical issue), due to unclear reporting output | Low | Medium | Reporting Engine output format reviewed with actual operations staff before launch; severity tiers clearly visually distinguished | QA Lead / Ops | P2 | Operator usability review completed and signed off pre-launch |
| RISK-030 | Multiple developers implementing different Epics in parallel interpret an ambiguous Business Rule Book entry differently, producing inconsistent behavior across generators | Medium | Medium | Every "Requires Business Confirmation" rule must be resolved (via its linked ADR) before its dependent Epic starts development, not resolved ad-hoc mid-sprint by whichever developer reaches it first | Engineering Lead | P1 | Zero Epics start development with an unresolved blocking ADR in their dependency list |

---

## Risk Summary

| Priority | Count | Dominant Category |
|---|---|---|
| P0 (must mitigate before build/launch) | 10 | Business confirmation gaps, concurrency/atomicity/recovery correctness, Unicode correctness |
| P1 (high priority, address during build) | 14 | Source-system drift, performance/scale unknowns, config governance |
| P2 (monitor, address opportunistically) | 5 | Cost/ops housekeeping, defensive coding |
| P3 | 0 | — |

**Top 3 risks requiring immediate business attention (before Sprint 1):** RISK-001 (journal acronym), RISK-002 (license text), RISK-004 (unresolved ADR backlog generally). These three block the largest number of downstream Epics if left unresolved.
