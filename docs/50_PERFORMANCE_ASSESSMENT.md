# Performance Assessment — Milestone 8

Estimates production readiness for a 6,000-article batch, based on
direct, fresh measurements taken this milestone (not reused from prior
reports without re-running) against all 3 real reference packages,
covering the complete pipeline (parse → extract → transform → generate
→ package).

## 1. Measured per-article timing (real samples, single-threaded)

| Article | Parse | Extract | Transform | Generate+Package | **Total** | Peak memory | Zip size |
|---|---|---|---|---|---|---|---|
| CS-2025-6808 | 425ms | 158ms | 116ms | 537ms | **1236ms** | 32.4 MiB | 14.3 MB |
| CS-2025-8493_C | 366ms | 126ms | 62ms | 276ms | **831ms** | 23.3 MiB | 3.3 MB |
| cs-2025-8827 | 129ms | 68ms | 95ms | 1274ms | **1565ms** | 13.5 MiB | 58.1 MB |
| **Average** | 307ms | 117ms | 91ms | 696ms | **1211ms** | 23.1 MiB | 25.2 MB |

`cs-2025-8827`'s generate+package time (1274ms) is dominated by its
much larger zip (58 MB vs. 3-14 MB) — I/O-bound asset copying and
compression, not CPU-bound generation. This confirms the design intent
(13_LLD_04 §9.3): binary payload size, not article complexity, is the
dominant packaging-time cost.

## 2. Extrapolation to 6,000 articles (sequential, single worker)

```
6,000 × 1.211s ≈ 7,266s ≈ 2.02 hours
```

This is the **current, actually-achievable** figure, since
`PackageBatchRunner` processes articles sequentially by design (PA-3,
`53_TECHNICAL_DEBT_REVIEW.md`). `runtime.yaml`'s own configured
`concurrency.worker_count: 8` is **not yet actually usable** for this
pipeline — no parallel scheduler exists to consume it (confirmed:
`orchestrator/scheduler.py` provides only `SequentialWorkerScheduler`).
If/when parallel execution is built, a naive 8-way parallelization would
reduce this to roughly 15-20 minutes, assuming no shared-resource
contention beyond the already-proven-safe `CheckpointStore`/`DoiRegistry`
compare-and-set operations.

## 3. Memory

Peak memory per article ranged **13.5–32.4 MiB**, measured via
`tracemalloc`, including the largest real sample's 58 MB output zip.
This confirms the streaming design (never buffering a whole file in
memory — `AssetCopyService`/`ZipBuilder`, Milestone 7) holds under real
data: the sample with the **largest** output (cs-2025-8827, 58 MB) had
the **lowest** peak memory (13.5 MiB) of the three, because its few
resolved files stream through in fixed-size chunks regardless of total
size.

**At 6,000 articles processed sequentially**, memory does not
accumulate across articles — each `PackageBuilder.build()` call's
temporary state (staging directory, in-memory XML bytes) is fully
released (`shutil.rmtree`) before the next article begins, and
`PackageBuilder`/generators hold no cross-article mutable state. No
memory-growth risk is evidenced for a long sequential run. **This has
not been verified under sustained load** (a real `tests/performance/`
long-run test does not exist — Technical Debt Review TD-item, Risk
Register RISK-021) — this assessment is a reasoned extrapolation from
per-article measurement and static code analysis (no cross-article
mutable state exists to leak), not a direct multi-hour measurement.

## 4. CPU utilization

No CPU-bound bottleneck was identified. XML generation itself
(raw.xml/article.xml/manifest.xml/reviews.xml/transfer.xml) is
sub-100ms combined per Milestone 6H's own measurements, dwarfed by I/O
(zip compression, asset copying) and by extraction/transform's own XML
parsing cost (307ms + 117ms + 91ms ≈ 515ms of the 1211ms average — 43%
of total time, before any generator runs at all). A future performance
optimization pass, if warranted, should target the parser/extraction
stage before the generation/packaging stage, based on this evidence.

## 5. ZIP generation

Deterministic, streamed, and configurable (deflated/stored compression).
No unnecessary memory copy: files stream directly from disk into the
archive via `zipfile.ZipFile.open(info, "w")`. Compression level is
config-driven (`PackagingSettings.zip_compresslevel`), allowing a
production operator to trade compression ratio for CPU time if the
6,000-article batch proves CPU-bound at the zip-compression step
specifically — not evidenced as a bottleneck at the 3-sample scale
tested, but a reasonable dial to have.

## 6. Asset copying

Manifest-driven (never a directory scan — `O(files in this one
article)`, confirmed in `48_COMPLETE_ARCHITECTURE_AUDIT.md`), streamed
with in-pass checksum verification. No redundant I/O: each source file
is read exactly once (streamed directly to both the destination file and
the running checksum digest).

## 7. Batch execution

Sequential only (§2). `PackageBuilder` is stateless and safely reusable
across all 6,000 articles in one process — confirmed by every unit and
golden test reusing single instances across multiple `build()` calls
with no observed cross-call state leakage.

## 8. Resume

Checkpoint-based resume (`PackageBatchRunner`) adds negligible overhead:
one `get_record()` read and one `transition()` compare-and-set write per
article, both in-memory operations (`InMemoryCheckpointStore`) on the
order of microseconds — immaterial next to the ~1.2s per-article
processing cost.

## 9. Logging overhead

Every generator and packaging component emits structured log events
(start/complete/asset-copied/zip-completed/package-complete, etc.) via
`StructuredLogger`. No performance measurement isolated logging's own
contribution to per-article time; given the event count is small
(roughly 10-15 structured log calls per article) and each is a
synchronous in-process call with no network I/O, this is very unlikely
to be measurable against the 1.2s per-article baseline — but this is an
inference, not a direct measurement, since no logging-disabled
comparison run was performed this milestone.

## Recommendations (only where evidence supports one)

1. **Do not build parallel batch execution speculatively** — no evidence
   of a scaling requirement beyond what sequential processing already
   achieves (~2 hours for 6,000 articles) has been demonstrated as
   inadequate; building it should wait for an explicit throughput
   requirement.
2. **Add a genuine long-run memory test** (`tests/performance/`,
   currently empty) before committing to an unattended 6,000-article
   production run — this assessment's memory conclusion is reasoned, not
   directly measured at scale.
3. **No change recommended to XML generation, asset copying, or zip
   building** — none is evidenced as a bottleneck at any tested or
   reasoned-about scale.
