# Reliability Assessment — Milestone 8

Verifies every reliability property the task named, using direct
evidence (tests, code reads) — not assumption.

## 1. Retry behavior

**Not implemented as an active system capability.** Confirmed via direct
read: `src/meca_engine/retry/__init__.py` is a 0%-coverage empty stub —
"Not implemented in Milestone 1 (Foundation)." Every exception class in
`exceptions/article_errors.py`/`batch_errors.py` carries a `retryable`
boolean classification (confirmed: `ArticleTransientError` subclasses
default `True`, `PackageAssemblyError` requires an explicit per-instance
value) — this classification scaffolding is complete and consistently
applied, but **nothing in the codebase currently reads `retryable` and
acts on it automatically** (no retry loop, no backoff timer exists
anywhere). A production run today would need an operator or external
script to inspect failures and manually decide whether to re-run.

## 2. Checkpoint behavior

**Fully implemented and proven for what exists.** `CheckpointStore`'s
atomic compare-and-set `transition()` is verified under real concurrent
access (`test_concurrent_transitions_are_serialized_and_exactly_one_wins`,
Milestone 2; extended by `PackageBatchRunner`'s own
`test_concurrent_runs_on_the_same_article_process_it_at_most_once` and
the deterministic `test_run_skips_when_the_claim_transition_loses_the_race`,
Milestone 7). Only an in-memory backend exists — durable
cross-process/cross-run checkpointing is not yet available (PA-1).

## 3. Atomic package generation

**Fully implemented and extensively proven.** `PackageBuilder.build()`
guarantees "all files exist or no package exists" via a hidden staging
directory, a hidden temp zip path, one atomic `os.replace()`, and an
`except BaseException` cleanup block. Verified by 4 dedicated failure-path
tests covering every distinct failure point (generator failure, DOI
collision, unresolvable manifest href, zip-write failure) — each
confirms zero trace of `MECA_*.zip`, `.package-staging-*`, or
`.MECA_*.zip.tmp` survives. This is the single most rigorously-tested
reliability property in the system.

**Caveat**: proven under **synchronous exception injection**, not under
a true process-kill (`SIGKILL`) at an arbitrary instant — the
`tests/fault_injection/` directory's own README explicitly names this as
"a separate, slower nightly-only variant," not yet built. The atomicity
*mechanism* (`os.replace` is OS-guaranteed atomic on a shared filesystem)
is sound in principle even under a hard kill, but this has not been
empirically demonstrated via a forced-kill test.

## 4. Failure recovery

**Partially implemented.** `recovery/__init__.py` is a 0%-coverage empty
stub — there is no automated routing of a classified failure to
retry/human-review/batch-pause (the Module 05_SYSTEM_MODULE_BREAKDOWN.md
"Error Recovery Module" responsibility). What *does* exist:
`PackageBatchRunner` correctly isolates one article's failure from the
rest of the batch (verified:
`test_run_continues_the_batch_after_one_article_fails`) and records a
clear `FAILED` checkpoint with a reason string — this is "failure
isolation," not "failure recovery" in the fuller sense the module
breakdown describes (no automatic re-queue, no escalation to a human
review queue, no batch-pause-on-systemic-outage logic).

## 5. Duplicate DOI handling

**Fully implemented and proven, including a fix made this milestone's
own predecessor.** `DoiRegistry.reserve()` correctly rejects a DOI
already held by a *different* article (`test_second_reservation_of_the_same_doi_fails`)
while correctly allowing idempotent re-reservation by the *same* article
(`test_re_reserving_the_same_doi_by_the_same_article_succeeds` — added in
Milestone 7 after a real defect was found and fixed: the original
implementation would have permanently blocked a failed article's own
legitimate retry). Verified under concurrency
(`test_concurrent_reservations_of_the_same_doi_serialize_to_exactly_one_winner`).
**Caveat**: only in-memory, non-durable (PA-1) — a real production batch
spanning multiple process restarts needs a durable backend before this
guarantee holds across restarts.

## 6. Partial failures

**Fully covered at the article level** (§3, §4). **Not covered at the
batch level**: there is no test or mechanism verifying "what happens if
the batch process itself is killed mid-run, with some articles PACKAGED
and others not yet started" beyond what `PackageBatchRunner`'s
per-article resume logic already provides when the *same* process is
simply re-invoked — this is proven (§7) but a true multi-process/crash
scenario is not.

## 7. Interrupted batch recovery

**Proven for the scope this milestone's own code covers.**
`test_run_redoes_an_article_that_previously_failed` and
`test_run_skips_an_article_already_packaged` directly demonstrate
ADR-017's "redo from scratch, never resume mid-stage" policy working
correctly across separate `PackageBatchRunner.run()` invocations sharing
the same `CheckpointStore`. **Not proven**: recovery of the *staging*
step (input discovery → local copy, `RunController`'s own scope) chained
together with the *packaging* step in one real interrupted run, because
no code currently chains these two together at all (see
`53_TECHNICAL_DEBT_REVIEW.md` TD-14).

## Summary table

| Property | Implementation status | Test evidence | Caveat |
|---|---|---|---|
| Retry behavior | Not implemented (classification only) | N/A | No automatic retry exists anywhere |
| Checkpoint behavior | Fully implemented | Extensive, incl. concurrency | In-memory only |
| Atomic package generation | Fully implemented | Extensive, 4+ failure-path tests | Proven under exception injection, not process-kill |
| Failure recovery | Partially implemented (isolation only) | Batch-continues-on-failure proven | No retry/escalation routing exists |
| Duplicate DOI handling | Fully implemented, incl. a fixed defect | Extensive, incl. concurrency | In-memory only |
| Partial failures | Fully covered (article level) | Extensive | Batch-process-level crash not covered |
| Interrupted batch recovery | Proven for packaging stage | Extensive | Staging+packaging not proven chained together |

## Overall reliability conclusion

Every reliability property **this milestone's own code (Package
Assembly) is responsible for** is implemented correctly and proven with
strong, direct evidence, including one real defect found and fixed
during verification. The properties that remain incomplete (retry,
recovery routing, durable backends, process-kill fault injection,
chained multi-stage interrupted-batch recovery) are consistently
attributable to modules **explicitly deferred to future milestones**,
not to any defect in what has been built — this matches, and is the
direct consequence of, the orchestration-wiring gap identified in
`48_COMPLETE_ARCHITECTURE_AUDIT.md` §7.
