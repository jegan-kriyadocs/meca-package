# Milestone 7 Test Summary — Package Assembly

## Headline numbers

| Metric | Value |
|---|---|
| Total tests (whole project, after this milestone) | 945 passed, 0 failed |
| Tests added this milestone | 50 |
| Coverage — every new module (`packaging/*`, `registry/*`) | **100%** |
| Coverage — overall project | 99% (4,113 statements, 8 missed — all pre-existing, unimplemented future-milestone stubs) |
| Golden tests (whole project) | 24 (18 pre-existing + 6 new) |
| Ruff | Clean |
| Ruff format | Clean |
| Mypy `--strict` | Clean (119 source files, up from 111) |

## New tests, by file

| File | Count | Covers |
|---|---|---|
| `tests/unit/registry/test_in_memory_doi_registry.py` | 7 | reserve/is_reserved, reset, same-article idempotent re-reservation, concurrent-race exactly-one-winner |
| `tests/unit/packaging/test_document_reader.py` | 6 | href extraction (order, fixed-item exclusion, no-instance-element skip), DOI extraction, unregistered-namespace error |
| `tests/unit/packaging/test_asset_copy.py` | 9 | single-file copy, timestamp preservation, missing source, duplicate detection, all 3 overwrite policies, checksum-mismatch cleanup, nested directory creation |
| `tests/unit/packaging/test_zip_builder.py` | 6 | entry completeness, deterministic ordering, byte-reproducibility, stored-vs-deflated compression, parent-dir creation, invalid-compression rejection |
| `tests/unit/packaging/test_builder.py` | 10 | all-5-invoked, zip content correctness, generator-failure atomicity, DOI reservation, same-article DOI retry after failure, DOI-collision atomicity, unresolvable-href atomicity, no-registry-still-works, validation-hook invocation, zip-failure atomicity |
| `tests/unit/packaging/test_batch_runner.py` | 6 | batch success, skip-already-packaged, redo-after-failed, continue-after-one-failure, concurrent-race (real threads), deterministic lost-claim |
| `tests/golden/test_package_assembly_golden.py` | 6 (2 × 3 real samples) | full pipeline + assembly against all 3 real reference packages; DOI-collision rejection against a real-sample-derived DOI |

## Required test categories — coverage matrix

| Required category | Satisfied by |
|---|---|
| Unit | All of `tests/unit/packaging/*`, `tests/unit/registry/*` |
| Integration | `tests/golden/test_package_assembly_golden.py` (real parse→extract→transform→generate→assemble, all 3 real samples) |
| Golden | Same file — the mandatory-merge-gate golden suite |
| Failure | `test_build_leaves_no_artifacts_when_a_generator_fails`, `test_build_cleans_up_a_partially_written_zip_on_zip_failure`, `test_copy_all_raises_for_missing_source_file`, `test_copy_all_raises_and_removes_partial_file_on_checksum_mismatch` |
| Resume | `test_run_redoes_an_article_that_previously_failed`, `test_run_skips_an_article_already_packaged` |
| Missing asset | `test_copy_all_raises_for_missing_source_file`, `test_build_raises_when_manifest_references_unresolvable_href` |
| Duplicate asset | `test_copy_all_detects_duplicate_hrefs_without_double_copying` |
| Partial failure | `test_build_leaves_no_artifacts_when_a_generator_fails`, `test_build_raises_doi_collision_and_cleans_up`, `test_build_cleans_up_a_partially_written_zip_on_zip_failure` |
| Batch | `test_run_processes_every_context_and_reports_success`, `test_run_continues_the_batch_after_one_article_fails` |
| Zip verification | `test_build_produces_a_zip_with_xml_and_asset_entries`, `test_package_assembly_produces_a_complete_self_consistent_zip` (`archive.testzip() is None`), `test_build_orders_entries_deterministically`, `test_build_produces_byte_identical_output_across_runs` |

Every category the task explicitly required has at least one directly
attributable test — none was satisfied only incidentally by an
unrelated test.

## Coverage gaps knowingly not closed (and why)

- **Durable (non-in-memory) `DoiRegistry`/`CheckpointStore` backends** —
  no test exists because no such backend was implemented this milestone
  (deferred, matching the Checkpoint Store's own precedent).
- **Real S3 publishing** — no test exists because no Output Writer was
  implemented this milestone (explicitly deferred per the task's own
  "support future S3 publishing" phrasing).
- **True multi-process/parallel batch execution** — no test exists
  because no parallel scheduler was implemented (explicitly forbidden
  this milestone).

None of these represent an untested *implemented* code path — they are
gaps in scope, not gaps in verification of what was actually built.
