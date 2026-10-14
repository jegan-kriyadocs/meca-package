# Batch Execution Flow — Milestone 7

Describes `PackageBatchRunner`'s exact behavior across a batch of
articles, including resume-after-interruption semantics, per the task's
"Design for: thousands of articles, resume after interruption,
checkpoint integration, future parallel execution" requirement.

## 1. Entry point

```python
runner = PackageBatchRunner(
    package_builder=package_builder,   # one shared, stateless instance
    checkpoint_store=checkpoint_store, # existing CheckpointStore (Milestone 2)
    logger=logger,
)
outcomes = runner.run(contexts, output_root=output_root)
```

`contexts` is any `Sequence[GeneratorContext]` — one per article. There
is no hidden global state: calling `run()` twice with overlapping
articles is safe (governed entirely by the checkpoint store's
compare-and-set semantics, §3).

## 2. Per-article flow

```
                         ┌─────────────────────────┐
                         │ get_record(article_id)  │
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────┴──────────────────┐
                    │ is_at_least(PACKAGED)?              │
                    └───────┬───────────────────┬─────────┘
                          yes│                   │no
                    ┌────────▼────────┐  ┌────────▼─────────────────┐
                    │ SKIPPED         │  │ transition(current→GENERATED) │
                    │ (already done)  │  │        [claim attempt]        │
                    └─────────────────┘  └────────┬──────────────────┘
                                                  │
                                    ┌──────────────┴───────────────┐
                                    │ claim succeeded?              │
                                    └──────┬─────────────────┬──────┘
                                         yes│                 │no
                              ┌─────────────▼───────┐  ┌───────▼──────────┐
                              │ PackageBuilder.build │  │ SKIPPED          │
                              │  (§ full atomic      │  │ (lost the race — │
                              │   assembly sequence) │  │  another worker  │
                              └──────┬─────────┬─────┘  │  owns it now)    │
                                success│      failure│  └──────────────────┘
                          ┌────────────▼──┐  ┌─────────▼──────────────┐
                          │ transition(   │  │ transition(            │
                          │  →PACKAGED)   │  │  →FAILED, reason)      │
                          │ SUCCEEDED     │  │ FAILED                 │
                          └───────────────┘  └────────────────────────┘
```

**One article's outcome never affects any other article's processing** —
`run()` iterates the full `contexts` sequence unconditionally, collecting
one `PackageOutcome` per input regardless of earlier failures.

## 3. Resume-after-interruption semantics (ADR-017)

| Prior checkpoint state | This run's behavior | Why |
|---|---|---|
| No record (`NOT_STARTED`) | Processed normally | First attempt |
| `PACKAGED` or beyond | **Skipped** | Already has a complete package; redoing would waste work and risk a duplicate DOI reservation attempt |
| `GENERATED` (a crashed prior claim, never reached `PACKAGED`) | **Redone from scratch** — claimed again, `PackageBuilder.build()` re-runs all 5 generators and re-assembles fully | `PackageBuilder` never leaves a usable partial result (per its own atomicity guarantee) to resume *from* — there is nothing partial to continue, so a full redo is not wasted extra work, it is the *only* correct option |
| `FAILED` | **Redone from scratch**, claimed from the `FAILED` state directly | A permanent failure on a prior attempt does not preclude success on a redo if, e.g., the underlying data issue was a transient `PackageAssemblyError` (disk-full) rather than a genuine data defect |

This exactly matches `15_LLD_06_SEQUENCE_DIAGRAMS.md` §14.4's own stated
design: *"an `IN_PROGRESS` article on restart is always redone from the
beginning, never resumed mid-stage... since no partial package can ever
have been published, the only cost of restarting-from-scratch is
re-doing already-cheap, already-idempotent... work."* Verified directly
by `test_run_redoes_an_article_that_previously_failed`.

## 4. Concurrency safety (present-day, single-process)

Even without a parallel scheduler, `PackageBatchRunner`'s claim step
(`transition(current → GENERATED)`) is a genuine atomic compare-and-set
against the shared `CheckpointStore` — verified under real
`threading.Thread` concurrency
(`test_concurrent_runs_on_the_same_article_process_it_at_most_once`):
of 5 concurrent attempts on the same article, exactly 1 succeeds and 4
are cleanly `SKIPPED`, with `PackageBuilder.build()` invoked exactly
once. This is the same guarantee a future parallel scheduler would rely
on — no additional locking is needed above what `CheckpointStore`
already provides.

## 5. Future parallel execution (explicitly deferred, not built)

`PackageBatchRunner.run()` iterates `contexts` sequentially today,
matching `orchestrator.scheduler.SequentialWorkerScheduler`'s own
current, approved scope — the task explicitly forbids building
distributed/parallel execution ahead of its own milestone. Nothing in
`PackageBuilder`'s design blocks this: it holds no mutable instance
state, and every article's on-disk work happens under a uniquely-named,
per-article temporary path (`.package-staging-<ArticleID>`,
`.MECA_<ArticleID>.zip.tmp`) — two articles processed concurrently, in
separate threads or processes, cannot collide on any filesystem path. A
future parallel scheduler need only replace the `for context in contexts`
loop with a pool-based dispatch of `_process_one`; the per-article claim
step (§4) already provides the correctness guarantee that dispatch would
need.

## 6. Batch-level result shape

```python
outcomes: tuple[PackageOutcome, ...]
# PackageOutcome(article_id, status, staged_package, error_message)
# status ∈ {SUCCEEDED, FAILED, SKIPPED}
```

One `PackageOutcome` per input context, in input order — sufficient for
a caller to build its own run-level summary (succeeded/failed/skipped
counts), mirroring the shape `orchestrator.models.RunSummary` already
uses for the staging stage.
