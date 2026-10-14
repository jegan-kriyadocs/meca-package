# Milestone 7 — Package Assembly Implementation Report

Implements the Package Assembly layer that consumes the 5 existing XML
generators' output and the ICAM's `resolved_files`/manifest.xml to
produce the final, atomically-published `MECA_<ArticleID>.zip`. No
previous milestone's architecture was redesigned; no ICAM field was
added, removed, or changed; every XML byte in the final package comes
unmodified from the existing 5 generators.

---

## 1. Directory Tree — every new file

```
meca-engine/
├── config/
│   └── runtime.yaml                                   [MODIFIED — added `packaging:` section]
├── schemas/config-schema/
│   └── runtime.schema.json                             [MODIFIED — added `packaging` schema]
├── pyproject.toml                                       [MODIFIED — coverage `concurrency=["thread"]`]
├── src/meca_engine/
│   ├── config/
│   │   ├── schema.py                                    [MODIFIED — added `PackagingSettings`]
│   │   └── loader.py                                    [MODIFIED — wired `PackagingSettings`]
│   ├── packaging/
│   │   ├── __init__.py                                  [MODIFIED — was an empty stub]
│   │   ├── models.py                                    [NEW]
│   │   ├── document_reader.py                           [NEW]
│   │   ├── asset_copy.py                                [NEW]
│   │   ├── zip_builder.py                                [NEW]
│   │   ├── builder.py                                    [NEW]
│   │   └── batch_runner.py                               [NEW]
│   └── registry/
│       ├── __init__.py                                  [MODIFIED — was an empty stub]
│       ├── doi_registry.py                               [NEW]
│       └── backends/
│           ├── __init__.py                              [MODIFIED — was an empty stub]
│           └── in_memory.py                              [NEW]
└── tests/
    ├── fixtures/config/runtime.yaml                      [MODIFIED — added `packaging:` section]
    ├── unit/generators/conftest.py                       [MODIFIED — added `packaging=` arg]
    ├── unit/generators/{article_xml,manifest_xml,reviews_xml,transfer_xml}/conftest.py
    │                                                      [MODIFIED — added `packaging=` arg, x4]
    ├── golden/test_{raw,article,manifest,reviews,transfer}_xml_golden.py
    │                                                      [MODIFIED — added `packaging=` arg, x5]
    ├── unit/packaging/
    │   ├── __init__.py                                   [already existed, empty]
    │   ├── conftest.py                                    [NEW]
    │   ├── test_document_reader.py                        [NEW]
    │   ├── test_asset_copy.py                              [NEW]
    │   ├── test_zip_builder.py                             [NEW]
    │   ├── test_builder.py                                 [NEW]
    │   └── test_batch_runner.py                            [NEW]
    ├── unit/registry/
    │   ├── __init__.py                                   [already existed, empty]
    │   └── test_in_memory_doi_registry.py                  [NEW]
    └── golden/test_package_assembly_golden.py              [NEW]
```

The `packaging=` additions to 10 pre-existing test files are a
mechanical consequence of `RuntimeConfig` gaining a new required field
(§2) — no test's own assertions or business logic changed.

---

## 2. New Modules — every class and its responsibility

### `config/schema.py` — `PackagingSettings` (modified file, new dataclass)
Frozen dataclass: `zip_compression`, `zip_compresslevel`,
`staging_subdir_name`, `overwrite_policy`. No packaging/zip/checksum
config surface existed anywhere before this milestone (confirmed by
full-file review); added following the exact same pattern as every
other `*Settings` dataclass in this file, wired into `RuntimeConfig` and
`ConfigLoader.load_runtime_config` identically to `DoiRegistrySettings`.

### `registry/doi_registry.py` — `DoiRegistry` (ABC)
`reserve(doi, *, article_id) -> bool` (atomic check-and-reserve) and
`is_reserved(doi) -> bool`. Modeled directly on
`checkpoint.store.CheckpointStore`'s own compare-and-set contract.
Validates uniqueness only (BR-154) — never generates, derives, or
guesses a DOI.

### `registry/backends/in_memory.py` — `InMemoryDoiRegistry`
Thread-safe (`dict` + `threading.Lock`) concrete implementation, mirroring
`checkpoint.backends.in_memory.InMemoryCheckpointStore` line-for-line in
structure. A durable backend is deferred, matching the Checkpoint
Store's own already-established deferral.

### `packaging/models.py` — data types
- `GeneratedDocumentSet`: the 5 generators' `GenerationResult`s, one
  frozen dataclass field each.
- `PackagedFile`: one physical asset's `href` / `source_path` /
  `checksum` / `size_bytes` — the manifest-derived copy plan entry.
- `AssetCopyReport`: `copied` / `skipped` / `duplicate_hrefs`.
- `StagedPackage`: the `build()` return type — `article_id`, `zip_path`,
  `doi`, `packaged_files`, `xml_filenames`. This is the exact seam a
  future `output.writer.publish(staged_package)` will consume.

None of these 4 types (nor `StagedPackage`'s name) existed anywhere in
the codebase before this milestone — they are named directly from
`13_LLD_04_PIPELINE_SCALABILITY_VALIDATION.md` §8.2's
`packaging.builder.build(...) -> StagedPackage` signature.

### `packaging/document_reader.py` — pure functions, no class
- `extract_packaged_file_hrefs(manifest_xml_bytes, namespace_manager) -> tuple[str, ...]`:
  parses the **already-generated** manifest.xml back and returns every
  `files/...`-prefixed href, in document order — excluding the 3 fixed
  metadata items (their hrefs never start with `files/`, per BR-082's
  own convention). This is the literal implementation of "manifest.xml
  is the authoritative list of packaged files... never scan
  directories."
- `extract_generated_doi(article_xml_bytes) -> str | None`: reads
  `article-id[@pub-id-type="doi"]` back out of the **already-generated**
  article.xml. Never recomputes BR-058's DOI-generation formula itself —
  reading an already-decided value is not business logic.

### `packaging/asset_copy.py` — `AssetCopyService`
`copy_all(entries, *, destination_root, article_id) -> AssetCopyReport`.
Streams every file via
`utils.hashing.compute_stream_checksum_while_copying` (never buffers a
whole file in memory), verifies the transferred checksum/size against
the already-known `ResolvedFile.checksum`/`.size_bytes`, preserves
mtimes (`shutil.copystat`), detects duplicate hrefs without double-copy,
and honors a configurable `overwrite_policy` (`fail` / `overwrite` /
`skip`). Raises `PackageAssemblyError` for a missing source file, a
destination collision, or a post-copy integrity mismatch.

### `packaging/zip_builder.py` — `ZipBuilder`
`build(*, source_root, zip_path, article_id) -> None`. Deterministic
(files sorted by relative path before being added) and reproducible (a
fixed 1980-01-01 archive timestamp, independent of real file mtimes —
verified this milestone: two builds of the same input produce
byte-identical zips). Streams every file directly from disk into the
archive via `zipfile.ZipFile.open(info, "w")` + `shutil.copyfileobj`,
never holding a whole file in memory.

### `packaging/builder.py` — `PackageBuilder`
**The single orchestration point.** `build(context, *, output_root) -> StagedPackage`.
Constructor takes the 5 already-configured generator instances, the
`NamespaceManager`, `AssetCopyService`, `ZipBuilder`, an optional
`DoiRegistry`, and optional `BusinessRuleValidationHook`s — nothing else.
Contains no business logic: every generated byte comes from the 5
generators unmodified; the file list comes from `document_reader`; the
DOI comes from `document_reader`. Sequences: invoke all 5 generators →
run any configured validation hooks → resolve the manifest-declared file
list against `resolved_files` → reserve the DOI (if a registry is
configured) → write the 5 XML files and copy every asset into a hidden,
per-article staging directory → build the zip at a hidden temp path →
atomically `os.replace` into the final `MECA_<ArticleID>.zip`. Any
exception at any point (a `finally`-equivalent `except BaseException`
block) removes both temporary paths before re-raising — **no partial
package is ever left at the published location**.

### `packaging/batch_runner.py` — `PackageBatchRunner`, `PackageOutcome`, `PackageOutcomeStatus`
Drives `PackageBuilder` across many `GeneratorContext`s, integrating
with the existing `CheckpointStore` for resume support: an article
already at or past `ArticleStage.PACKAGED` is skipped; anything else
(including a crashed prior claim, or a previously `FAILED` attempt) is
claimed via a compare-and-set `transition(...)` call and redone from
scratch (ADR-017 — never resumed mid-assembly, since `PackageBuilder`
never leaves a usable partial result). One article's failure never
halts the batch. Sequential only, by explicit design (§5) — the correct,
minimal scope for this milestone.

---

## 3. Processing Flow

```
PackageBatchRunner.run(contexts, output_root=...)
  for each context:
    ├─ checkpoint_store.get_record(article_id)
    ├─ if already >= PACKAGED  → SKIPPED, done
    ├─ checkpoint_store.transition(current → GENERATED)  [claim]
    │    └─ if lost the race    → SKIPPED, done
    ├─ PackageBuilder.build(context, output_root)
    │    ├─ raw_generator.generate(context)         ─┐
    │    ├─ article_generator.generate(context)      │  any exception here
    │    ├─ manifest_generator.generate(context)      │  propagates unchanged;
    │    ├─ reviews_generator.generate(context)        │  no staging dir/zip
    │    ├─ transfer_generator.generate(context)     ─┘  ever created
    │    ├─ [optional] business_rule_hooks.validate(...) per document
    │    ├─ document_reader.extract_packaged_file_hrefs(manifest.xml_bytes)
    │    ├─ resolve each href → ResolvedFile (via resolved_files)
    │    ├─ document_reader.extract_generated_doi(article.xml_bytes)
    │    ├─ [optional] doi_registry.reserve(doi, article_id)
    │    │    └─ collision → DoiCollisionError, no artifacts left
    │    ├─ mkdir staging_dir (.package-staging-<id>)
    │    ├─ write 5 XML files to staging_dir
    │    ├─ asset_copy_service.copy_all(→ staging_dir/files/<round>/...)
    │    ├─ zip_builder.build(staging_dir → .MECA_<id>.zip.tmp)
    │    ├─ os.replace(tmp zip → MECA_<id>.zip)          [atomic]
    │    └─ rmtree(staging_dir)                            [cleanup]
    ├─ on success: transition(GENERATED → PACKAGED)
    └─ on MecaEngineError: transition(GENERATED → FAILED, reason); continue batch
```

---

## 4. Tests

| Metric | Value |
|---|---|
| New tests added this milestone | 50 (7 registry + 37 packaging unit + 2×3 golden = 6) |
| Total test suite | 945 passed, 0 failed |
| Coverage — every new module (`packaging/*`, `registry/*`) | **100%** |
| Coverage — overall project | 99% (4,113 statements, 8 missed — all pre-existing, in unimplemented future-milestone stub modules: `validation`, `recovery`, `reporting`, `monitoring`, `retry`, `output`) |
| Golden tests | 24 total (18 pre-existing + 6 new: 2 scenarios × 3 real samples) |
| Ruff | Clean (`src/`, `tests/`) |
| Ruff format | Clean (262 files) |
| Mypy `--strict` | Clean (119 source files, up from 111) |

Test categories delivered, matching every one the task required:
unit (registry, document_reader, asset_copy, zip_builder, builder,
batch_runner), integration/golden (full pipeline + assembly against all
3 real samples), failure (generator failure, zip-write failure, missing
asset, DOI collision), resume (checkpoint-based redo-from-FAILED,
skip-already-PACKAGED), missing asset (`test_copy_all_raises_for_missing_source_file`),
duplicate asset (`test_copy_all_detects_duplicate_hrefs_without_double_copying`),
partial failure (`test_build_leaves_no_artifacts_when_a_generator_fails`,
`test_build_cleans_up_a_partially_written_zip_on_zip_failure`), batch
(`test_run_processes_every_context_and_reports_success`,
`test_run_continues_the_batch_after_one_article_fails`), zip
verification (`archive.testzip() is None`, deterministic-ordering and
byte-reproducibility tests).

---

## 5. Performance Considerations

- **Memory**: no whole file is ever loaded into a Python object.
  `AssetCopyService` streams source→destination in 1 MiB chunks while
  computing the checksum in the same pass (reusing the existing
  `utils.hashing.compute_stream_checksum_while_copying`, not a new
  implementation). `ZipBuilder` streams each file from disk directly
  into the archive via `zipfile.ZipFile.open(info, "w")`. The 5 XML
  documents are the only in-memory byte blobs — already small (raw.xml,
  the largest, is ~1 MB per Milestone 6B's own measurement) and already
  held in memory by the generators themselves regardless of packaging.
- **Batch**: `PackageBuilder` is stateless (holds only injected,
  read-only collaborators), so one instance is safely reused across
  every article in a 6,000+-article run — confirmed by the unit tests
  reusing a single instance across multiple `build()` calls with no
  shared mutable state. `PackageBatchRunner` processes articles
  sequentially, matching `SequentialWorkerScheduler`'s own current
  scope; nothing in `PackageBuilder`'s design (no shared mutable state,
  no file-path collisions between articles — each uses its own
  per-article staging directory name) blocks a future parallel scheduler
  from driving many `PackageBuilder.build()` calls concurrently.
- **Zip**: compression is configurable (`deflated`/`stored`) via
  `PackagingSettings`; entries are sorted for deterministic,
  byte-reproducible output (verified: two builds of identical input
  produce identical zip bytes), which is also useful for detecting
  unintended drift across batch reruns.
- **Copy strategy**: manifest-driven, never a directory scan — `O(number
  of files in this one article)`, not `O(files in the whole staging
  tree)`. No repeated filesystem scanning: each `ResolvedFile`'s path is
  already known from the ICAM; `AssetCopyService` touches each source
  file exactly once.
- **Configuration loading overhead**: `PackagingSettings` loads as part
  of the existing single `runtime.yaml` read — no new file, no
  additional schema-validation pass beyond what `ConfigLoader` already
  performs once per batch startup.

No bottleneck was identified in this layer at any tested or projected
scale — consistent with the Milestone 6H Suite Review's own finding that
every generator (and now, the assembly layer wrapping them) is `O(n)` in
its own natural input size, and the ICAM-build stage upstream remains
the dominant per-article cost.

---

## 6. Evidence-based Findings

No confirmed implementation defect was discovered in any **prior**
milestone's code during this milestone's work. One pre-existing,
already-documented finding from Milestone 6H (TD-1, manifest.xml round
ordering) was explicitly re-confirmed as **not a blocker** for
assembly: `PackageBuilder`'s file-resolution logic (§2,
`document_reader.extract_packaged_file_hrefs`) reads manifest.xml's item
order as-is and never re-sorts it, per the Milestone 6H Readiness
Assessment's own explicit instruction. This was verified directly this
milestone: the golden test's zip-content assertions never depend on
manifest.xml's internal item order, only on href set membership.

**One confirmed defect was found and fixed in this milestone's own new
code** (not a prior milestone's), during its own verification pass:
`InMemoryDoiRegistry.reserve()`'s original implementation treated *any*
re-reservation of an already-reserved DOI as a collision — including a
re-reservation by the *same* `article_id` that reserved it first. This
meant a failed build (e.g. a zip-write I/O error occurring *after* DOI
reservation but before the package completed) would permanently block
that same article's own `PackageBatchRunner`-driven retry (§ ADR-017
redo-from-scratch semantics) with a spurious `DoiCollisionError`, even
though no real cross-article collision existed. Confirmed via direct
reproduction (`reserve()` called twice with the same DOI and same
`article_id` returned `True` then `False`) before any fix was applied.
**Fixed**: `reserve()` is now idempotent for the same `article_id` —
succeeding both on first reservation and on any subsequent
re-reservation by that same article, while still correctly rejecting a
different article_id's attempt on an already-held DOI. Regression tests
added: `test_re_reserving_the_same_doi_by_the_same_article_succeeds`
and `test_build_retry_after_a_later_failure_does_not_hit_its_own_doi_reservation`.

Every new module's behavior was verified empirically against real
reference package data (the 3 real samples) via the new golden test, not
merely against synthetic fixtures.

---

## 7. Assumptions

1. **DOI uniqueness scope is per-runner-instance / per-registry**, not
   automatically cross-run-durable — `InMemoryDoiRegistry` is explicitly
   non-durable (mirroring `InMemoryCheckpointStore`'s own documented
   limitation). A production deployment needing cross-run DOI durability
   must supply a durable `DoiRegistry` backend before going live —
   deferred, matching the Checkpoint Store's own precedent.
2. **"Support future S3 publishing"** was interpreted as: design the
   `StagedPackage` return type as the exact seam a future
   `output.writer.publish(staged_package)` will consume (a local,
   complete, checksummed zip file), without implementing any S3 client
   code this milestone — no `boto3` dependency was added, no network
   I/O was introduced anywhere in `packaging/`.
3. **"Support future checksum generation"** was interpreted as: this
   milestone's own asset-copy integrity check (verifying each copied
   file's SHA-256 against the already-computed `ResolvedFile.checksum`)
   is the checksum mechanism Package Assembly itself needs; a
   package-level (whole-zip) checksum for the future Output Writer's
   post-write integrity check (`PostWriteIntegrityError`) is that
   writer's own responsibility to compute over the final zip bytes, not
   something `PackageBuilder` needed to precompute and carry forward.
4. **Validation hook invocation is a no-op today by design** — since no
   concrete `BusinessRuleValidationHook`/`DtdValidationHook`/`SchemaValidationHook`
   implementation exists anywhere in the codebase yet (confirmed via
   `grep`, matching Milestone 6H's own finding), `PackageBuilder`
   accepts an optional, empty-by-default tuple of hooks — "reuse existing
   validation interfaces... only invoke existing hooks where
   appropriate" is satisfied by having a real invocation point ready for
   when the future Validation Engine milestone supplies real
   implementations, not by fabricating validation logic now.
5. **The checkpoint "claimed" stage reuses `ArticleStage.GENERATED`**
   rather than introducing a new enum value, since `PackageBuilder.build()`
   performs generation and packaging as one atomic unit (§3) — there is
   no intermediate, independently-observable "generation succeeded,
   packaging not yet attempted" state in this milestone's design, so
   introducing a finer-grained enum value would not correspond to any
   real, distinguishable code boundary.

---

## 8. Deferred Work (explicitly out of this milestone's scope)

- **Output Writer / S3 publishing** (`output/writer.py`) — the module
  breakdown's Module 10; genuinely unplanned beyond one paragraph of
  prose in the existing docs (confirmed via research). `StagedPackage`
  is the ready-made seam.
- **Durable DOI Registry backend** (Postgres/DynamoDB) — `registry/backends/`
  is structured to accept one without changing `PackageBuilder`'s
  constructor contract (it depends only on the `DoiRegistry` ABC).
- **Durable Checkpoint Store backend** — pre-existing Milestone 2
  deferral, unchanged by this milestone.
- **Parallel/distributed batch execution** — explicitly forbidden by
  this milestone's own instructions ("Do NOT implement distributed
  execution yet"); `PackageBatchRunner` and `PackageBuilder`'s stateless
  design deliberately do not block this, but no scheduler beyond
  sequential iteration was built.
- **Concrete validation hook implementations** (DTD/Schema/Business-Rule)
  — reserved for the future Validation Engine milestone, unchanged.
- **BR-160 batch-level atomicity guarantee across a whole run** — this
  milestone delivers per-article atomicity (ADR-017); a run-level
  guarantee (e.g., "no batch is considered complete until every article
  either succeeded or was explicitly marked failed") is an orchestration
  concern one layer up, not newly introduced here.
