# Package Assembly Decision Log — Milestone 7

Authoritative reference for every implementation decision this
milestone made, and every assumption explicitly rejected. Mirrors the
format of `24_MANIFEST_DECISION_LOG.md` / `28_REVIEWS_DECISION_LOG.md` /
`29_TRANSFER_DECISION_LOG.md`.

## Configuration mapping

| Decision | Reason | Evidence |
|---|---|---|
| A new `PackagingSettings` dataclass was added to `config/schema.py`, wired the same way as `DoiRegistrySettings` | No packaging/zip/checksum config surface existed anywhere before this milestone (confirmed by full-file review of `schema.py`) | `RuntimeConfig`'s field list, pre-milestone, had no such section |
| `zip_compression`/`zip_compresslevel`/`staging_subdir_name`/`overwrite_policy` are all config, none hard-coded | Same discipline every prior generator milestone applied to its own "always this value" constants, per the task's explicit "no hard-coded values" instruction extended to this layer | `grep` confirms zero literal zip/overwrite-policy values in `packaging/*.py` outside default parameter fallbacks that are themselves overridden by config at call sites |
| `PackagingSettings` was added to the existing `runtime.yaml`/`runtime.schema.json` rather than a new dedicated file | Operational settings (not business-value data) belong in `runtime.yaml` per `12_LLD_03 §5.7`'s own precedent — matches `ConcurrencySettings`/`RetrySettings`/`StagingSettings` placement exactly | `runtime.yaml`'s own header comment: "operational settings, not business-value data" |

## Manifest-driven assembly

| Decision | Reason | Evidence |
|---|---|---|
| The copy plan is derived by parsing the **generated** manifest.xml bytes back (`document_reader.extract_packaged_file_hrefs`), not by reading `context.model.resolved_files` directly | Explicit task instruction: "Package Builder must use manifest.xml as the authoritative list of packaged files... Manifest controls assembly" — even though `resolved_files` and manifest.xml agree (confirmed in Milestone 6H's Suite Review, BR-152/153), the *artifact that ends up in the package* is the correct source of truth, not the in-memory model it was built from | `document_reader.py`'s own docstring |
| Fixed metadata items (article/reviews/transfer self-references) are excluded from the copy plan by checking `href.startswith("files/")`, not by item-type string | BR-082's own already-established convention: every genuine file item's href is `files/<round>/<filename>`; every fixed item's href is a bare filename. This is reading an existing structural fact, not inventing a new rule | `manifest_xml/generator.py`'s own `_add_fixed_items`/`_add_file_items` functions, confirmed via direct read this milestone |
| manifest.xml's item order is read and preserved as-is, never re-sorted | Explicit instruction from `35_PACKAGE_ASSEMBLY_READINESS_ASSESSMENT.md`: "Package Assembly should not attempt to 'fix' this by re-sorting file items itself... should preserve manifest.xml's item order as-is" (re: TD-1's confirmed BR-083/144 ordering issue) | `extract_packaged_file_hrefs` returns a plain ordered tuple built by iterating `root.findall("item")` in document order; nothing downstream sorts it |

## DOI handling

| Decision | Reason | Evidence |
|---|---|---|
| The DOI is read back from the **generated** article.xml bytes (`document_reader.extract_generated_doi`), never recomputed from `doi_prefix`/`doi_article_id_value` | Recomputing BR-058's formula inside Package Builder would duplicate business logic explicitly forbidden by this milestone's own "no business logic inside Package Builder" instruction | `article_xml/generator.py`'s own `_build_doi` (BR-058/059) is the single source of truth; this milestone reads its output, never its inputs |
| `DoiRegistry.reserve()` is optional (`doi_registry: DoiRegistry \| None = None`) | The task scoped this milestone to "validate uniqueness if this milestone includes it" without mandating every deployment must have one wired — matches the already-optional nature of `business_rule_hooks` for the same reason (no concrete backend is production-ready yet) | `PackageBuilder.__init__`'s own docstring: "If `None`, no uniqueness check is performed — the caller is responsible for deciding whether that is acceptable" |
| `DoiRegistry`/`InMemoryDoiRegistry` are modeled directly on `CheckpointStore`/`InMemoryCheckpointStore`'s own shape (atomic check-and-reserve, in-memory-only, durable backend deferred) | Reuse an already-approved, already-tested pattern rather than inventing a new one for a structurally identical problem (exactly-once claim on a shared string key) | Direct structural comparison, confirmed line-for-line similar in this milestone's own code review |
| `reserve()` treats re-reservation by the **same** `article_id` as success, not a collision (corrected after an initial implementation got this wrong — see `36_..._IMPLEMENTATION_REPORT.md` §6) | A failed build can leave a DOI reserved with no completed package; `PackageBatchRunner`'s own ADR-017 redo-from-scratch retry must be able to re-reserve its own DOI without a spurious `DoiCollisionError` | `test_re_reserving_the_same_doi_by_the_same_article_succeeds`, `test_build_retry_after_a_later_failure_does_not_hit_its_own_doi_reservation` |

## Atomicity mechanism

| Decision | Reason | Evidence |
|---|---|---|
| Assembly happens under a hidden, per-article staging directory (`.package-staging-<ArticleID>`) and a hidden temp zip path (`.MECA_<ArticleID>.zip.tmp`); the real filename only appears via `os.replace()` | `os.replace` is atomic on POSIX when source and destination share a filesystem (the same `output_root`) — the simplest, dependency-free mechanism satisfying "ALL files exist or NO package exists" without inventing a two-phase-commit protocol | Python's own `os.replace` documentation; consistent with how `ArticleModelBuilder.freeze()` and other "all-or-nothing" constructs in this codebase avoid partial states by construction rather than by cleanup-after-the-fact alone |
| Both temp paths are unconditionally removed in an `except BaseException` block (not `except Exception`) before re-raising | `BaseException` also catches `KeyboardInterrupt`/`SystemExit` — a partial package must not survive even an operator-initiated interrupt mid-build | `builder.py`'s own `build()` method |
| The loose staged tree (5 XML files + `files/`) is deleted after a **successful** zip build too, leaving only the zip | `13_LLD_04 §9.4`: "own working subdirectory... deleted after successful publish or terminal failure" — the loose tree is working state, not the deliverable | `builder.py`'s `build()`'s success path: `shutil.rmtree(staging_dir, ignore_errors=True)` runs in both the success and failure branches |

## Checkpoint / resume integration

| Decision | Reason | Evidence |
|---|---|---|
| `PackageBatchRunner` reuses the existing `ArticleStage.GENERATED` value as its "in-progress claim" stage, rather than adding a new enum member | `PackageBuilder.build()` performs generation-through-packaging as one atomic unit — there is no independently-observable "generated but not yet packaged" boundary in this milestone's own design to justify a new, finer-grained stage | `checkpoint/models.py`'s existing `ArticleStage` enum already has `GENERATED`/`PACKAGED` as consecutive, already-defined values; no enum change was made |
| An article whose prior attempt reached `FAILED` (or any stage short of `PACKAGED`) is always **redone from scratch**, never resumed mid-assembly | Explicit design note in `15_LLD_06 §14.4`: "an `IN_PROGRESS` article on restart is always redone from the beginning, never resumed mid-stage... since no partial package can ever have been published" — directly applicable here because `PackageBuilder` guarantees no partial result ever exists to resume from | `batch_runner.py`'s own module docstring; `test_run_redoes_an_article_that_previously_failed` |
| One article's failure never halts the batch | Matches `ArticleLevelError`'s own established batch-continues-on-article-failure contract (12_LLD_03 §7.3) | `test_run_continues_the_batch_after_one_article_fails` |

## Batch execution scope

| Decision | Reason | Evidence |
|---|---|---|
| `PackageBatchRunner` processes articles **sequentially** — no thread pool, process pool, or async scheduler was built | Explicit instruction: "Do NOT implement distributed execution yet unless already planned" — nothing in the existing docs plans a generic, non-staging-specific parallel executor beyond `orchestrator.scheduler.SequentialWorkerScheduler`'s own current, matching scope | `orchestrator/scheduler.py`'s own docstring: "no parallel execution yet", confirmed unchanged this milestone |
| `PackageBuilder` was still designed to be fully stateless and reusable, so a future parallel scheduler can drive it without any change | "Design for: thousands of articles... future parallel execution" — satisfied by not *blocking* parallelism, without building it prematurely | No mutable instance attribute exists on `PackageBuilder`; confirmed via code review (every field set in `__init__` is a read-only collaborator) |

## Validation hooks

| Decision | Reason | Evidence |
|---|---|---|
| `PackageBuilder` accepts an optional, empty-by-default tuple of `BusinessRuleValidationHook` instances | "Reuse existing validation interfaces... only invoke existing hooks where appropriate" — since no concrete hook implementation exists anywhere in the codebase (confirmed via `grep`, matching Milestone 6H's own finding), the correct action is to provide a real invocation point, not to fabricate validation logic | `validation_hooks.py` unchanged since Milestone 6A; `test_build_runs_configured_business_rule_hooks` proves the invocation point works once a real hook is supplied |
| `DtdValidationHook`/`SchemaValidationHook` were **not** wired into `PackageBuilder` | Only `BusinessRuleValidationHook` operates on arbitrary already-serialized document bytes with a generic signature suited to "run against every one of the 5 documents"; the other 2 hooks require a `dtd_path`/`schema_path` this milestone has no config surface for and was not asked to add | `validation_hooks.py`'s own 3 abstract signatures, compared directly |

## Assumptions explicitly rejected

| Rejected assumption | Why it was rejected |
|---|---|
| Reading `context.model.resolved_files` directly to decide package contents, skipping manifest.xml parsing entirely | Would violate the explicit "manifest.xml is the authoritative list... never scan directories to decide package contents" instruction — even though the two sources agree today, only one of them is the actual generated artifact this milestone is required to trust |
| Re-sorting manifest.xml's file items into "latest round first" before copying, to work around TD-1 | Explicitly forbidden by `35_PACKAGE_ASSEMBLY_READINESS_ASSESSMENT.md`'s own instruction; would also be a business-rule decision (round ordering) inside Package Builder, which "must only orchestrate" |
| Implementing a durable (Postgres) `DoiRegistry`/`CheckpointStore` backend this milestone | Out of scope — no database dependency exists anywhere in this project yet; matches the Checkpoint Store's own already-established deferral, not a new gap this milestone introduced |
| Implementing S3 publishing (`output/writer.py`) | Explicitly listed as "future" in the task's own requirements ("support future S3 publishing"), and confirmed genuinely unplanned beyond one paragraph of prose in the existing docs — building it now would be speculative, unapproved scope |
| Adding a new `ArticleStage` enum value for the packaging "claim" | Would be a Milestone-2 (`checkpoint/models.py`) architecture change; the existing `GENERATED` value already fits the actual boundary this milestone introduces |
| Computing a whole-package (zip-level) checksum inside `PackageBuilder` | "Support future checksum generation" is satisfied by the asset-level integrity checks already performed during copy; a package-level checksum is naturally the future Output Writer's own post-write concern (`PostWriteIntegrityError`'s own documented owner), not this milestone's |

## Notes for the future Output Writer / S3 Publishing milestone

- `StagedPackage.zip_path` is a complete, closed, real file on local disk
  by the time `PackageBuilder.build()` returns — ready to be streamed to
  S3 without any further local processing.
- `StagedPackage.doi` is already reserved (if a registry was configured)
  by the time the package is staged — the future Output Writer does not
  need to repeat any uniqueness check.
- No package is ever left half-written at `output_root` — the future
  Output Writer can safely assume every `MECA_*.zip` it finds there is
  complete.
