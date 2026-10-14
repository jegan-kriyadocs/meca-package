# Package Assembly Readiness Assessment — Milestone 6H

## Recommendation: **GO**

The XML generation subsystem is ready for Milestone 7 – Package
Assembly to begin. No finding from this review requires generation-layer
rework before Package Assembly can proceed.

## Readiness by dimension

| Dimension | Ready? | Basis |
|---|---|---|
| **XML validation** | **Ready** | All 5 generators produce well-formed XML on all 3 real samples (18/18 golden tests passing); `DtdValidationHook`/`SchemaValidationHook`/`BusinessRuleValidationHook` interfaces exist and are correctly unimplemented (reserved for the future `ValidationEngine` milestone — a separate, already-planned unit of work, not a generation-layer gap) |
| **Package Assembly (ZIP structure, manifest-driven file placement)** | **Ready, with one known caveat** | manifest.xml correctly and consistently declares file hrefs matching `resolved_files` (BR-152) — Package Assembly can trust this mapping. Caveat: TD-1 (round ordering) affects only the *order* file items appear in manifest.xml, not their presence/correctness/href validity — Package Assembly's ZIP-writer does not need file-item order to place files correctly, so this does not block assembly, though it should preserve manifest.xml's item order as-is (do not silently re-sort) |
| **ZIP creation** | **Ready** | Every file referenced by manifest.xml corresponds to a real `ResolvedFile.staged_physical_path` — no fabricated or dangling reference found (BR-152/153) |
| **Checksum generation** | **Ready** | No generation-layer dependency; checksums are computed over final file bytes, orthogonal to XML generation correctness |
| **Batch execution** | **Partially ready — 2 gaps, both natively Package Assembly's scope** | TD-3 (BR-154, DOI uniqueness across a batch) and TD-4 (BR-160, atomic 5-file generation per article) have no implementation yet — but both were always understood to be Package Assembly/orchestration-layer responsibilities (11_LLD_02 §`registry.doi_registry`; Milestone 7's own orchestration design), not something any individual generator could implement. Not a regression or surprise — expected sequencing. |
| **S3 publishing** | **Not yet assessed — out of this review's scope** | No generation-layer coupling to publishing exists; this dimension depends entirely on Milestone 7/8 design not yet built |

## Conditions carried forward (not blockers, but must be tracked)

1. **TD-1 (Critical)**: manifest.xml round ordering — Package Assembly should not attempt to "fix" this by re-sorting file items itself; the correct fix (if/when authorized) belongs in `round_resolver.py` with business confirmation of round-naming semantics. Document this as a known limitation in Package Assembly's own release notes if the ordering is externally visible/consumed downstream.
2. **TD-2 (High)**: ADR-007 journal acronym — must be resolved with business input before onboarding any journal beyond the 3 already validated. Not a blocker for continuing with the 3 known journals (fully config-driven already).
3. **TD-3 (High)**: DOI uniqueness must be implemented as part of Package Assembly's batch orchestration (not deferred further) — a real production run without this check risks silent DOI collisions across a batch.
4. **TD-4 (High)**: Atomic 5-file generation must be a first-class design requirement of Package Assembly's orchestration layer — partial-package output (e.g., 3 of 5 XML files generated, then a failure) must not be treated as a valid or partially-usable package.

## What was explicitly NOT done (per this milestone's scope)

- No Package Assembly code was written.
- No architecture was modified.
- No ICAM change was made.
- No new generation functionality was added.
- The single production change made was a **test-only** strengthening (`tests/golden/test_manifest_xml_golden.py`), adding an explicit assertion for an already-existing, already-documented behavior — not new logic.

## Final statement

All 5 XML generators, the shared generation framework, and the
transformation-layer corrections beneath them have been reviewed
end-to-end against architecture, business-rule, cross-generator
consistency, configuration, golden-evidence, performance, and test
dimensions, using empirical verification rather than assumption
throughout. One confirmed rule violation and several already-known
open items were found, documented, prioritized, and none of them
requires halting or reworking the generation layer.

**The project is ready to begin Milestone 7 – Package Assembly.**
