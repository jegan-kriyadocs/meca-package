# Milestone 10 — Warning-Based Filename Fallback ("Generate With Warnings") Implementation Report

## 1. Executive Summary

A prior independent specification audit (triggered by `cs-2024-5238`'s
persistent `FileReferenceMissingError`) established, by direct citation
of the Business Rule Book, every ADR, the LLD, and the Milestone 9
decision record, that the engine's strict fail-fast behavior when a
custom-meta `form-files` entry has no declared `name` field is
**specification-correct** — no document anywhere authorized deriving a
filename from the entry's `path` field instead.

The product direction has since changed. This milestone implements that
change as a **new, explicit product decision (ADR-032)** — not a
correction of BR-013/016/017, which remain textually unchanged and
still describe the correct default/strict behavior. The engine now:

- derives a filename from `declared_path_hint` when `original_filename`
  is missing and that derivation can succeed safely, instead of
  aborting the whole package;
- records every such recovery as a structured, first-class
  `EngineWarning` (`BR013_FALLBACK_FILENAME_FROM_PATH`) that survives
  all the way from extraction to the built `StagedPackage`;
- computes a new `PackageStatus` (`PASS`/`PASS_WITH_WARNINGS`/`FAILED`)
  visible to any caller holding the package, without re-running
  validation;
- remains fully reversible via one configuration flag
  (`allow_filename_fallback`, default `true`), with zero code changes
  required to restore the pre-Milestone-10 strict behavior;
- never mutates the ICAM's own record of what was actually declared —
  the derived name is used solely for this generation run's output.

**Real-world result, honestly reported**: re-running the 3 packages the
prior audit investigated (`etls-2025-3020`, `cs-2025-6682`,
`cs-2024-5238`) against the new default configuration shows:
- `etls-2025-3020`, `cs-2025-6682` — **unchanged**, fail identically.
  Both have a genuinely absent physical file behind a *populated*
  `name` field; the fallback only ever activates when `name` is
  entirely empty, so it correctly never engages for these two.
- `cs-2024-5238` — **partially recovered, still ultimately fails**. The
  fallback correctly resolves the exact defect the prior audit
  investigated (the `category="tables"` entry, whose `name` field is
  entirely absent from source) and the pipeline advances further than
  before — but the same source document has other, independent
  `name`-missing entries (embedded manuscript-image references under a
  `.../resources/.../image1.tiff.JPEG`-style path) whose derived
  filenames do **not** correspond to any physical file anywhere in the
  package (confirmed absent by direct search). The pipeline correctly
  continues to fail on that entry — proving the "fail only when safe
  recovery is impossible" boundary holds even on a real, multi-defect
  document, rather than overclaiming a full fix this feature was never
  designed to provide.

## 2. Product Rationale (why this is a product decision, not a BR-013 correction)

BR-013's own text ("Output filename string must be byte-identical to
the source `name` field") and BR-016/017 ("`path` ... hint only, not
authoritative ... final output filename comes from BR-013, not this
path") are unchanged by this milestone and remain the accurate
description of what the engine does when `allow_filename_fallback` is
`false`. Nothing in this milestone claims those rules were ever wrong —
the prior audit already proved they weren't. What changed is a
**business risk tolerance decision**: the organization has decided that
shipping a *smaller, warned-about* set of assumptions is preferable to
not shipping a package at all, in the one narrow case where recovery
can be verified safe (a real, on-disk file exists at the derived name).
That is a product/business trade-off a specification audit cannot make
on its own — it requires the explicit sign-off ADR-032 records.

## 3. Files Modified

| File | Change |
|---|---|
| `src/meca_engine/model/warnings.py` | **New.** `WarningSeverity`, `WarningCategory`, `EngineWarning`. |
| `src/meca_engine/model/article.py` | `ArticleModel.warnings` field; `ArticleModelBuilder.set_warnings()` (optional, write-once). |
| `src/meca_engine/config/schema.py` | `FeatureFlagsConfig.allow_filename_fallback: bool`. |
| `config/feature-flags.yaml`, `schemas/config-schema/feature-flags.schema.json`, `tests/fixtures/config/feature-flags.yaml` | New key/property, default `true`. |
| `src/meca_engine/extraction/file_resolver.py` | Fallback derivation + warning construction; `resolve_files()` now returns `(resolved_files, warnings)` and accepts `allow_filename_fallback`. |
| `src/meca_engine/transform/coordinator.py` | `TransformationCoordinator.__init__` accepts `feature_flags`; wires warnings onto the built `ArticleModel`. |
| `src/meca_engine/packaging/models.py` | **New** `PackageStatus` enum; `StagedPackage.status`/`.warnings`. |
| `src/meca_engine/packaging/builder.py` | Computes `status`/`warnings` from `context.model.warnings` at build time. |
| 14 test conftest/golden files | `FeatureFlagsConfig(...)` construction sites updated for the new required field. |
| `tests/unit/extraction/test_file_resolver.py`, `tests/unit/transform/test_coordinator.py`, `tests/unit/packaging/test_builder.py`, `tests/unit/model/test_article.py` | Updated for the new return shape / new coverage. |
| `tests/unit/model/test_warnings.py` | **New.** |
| `02_ARCHITECTURE_DECISION_RECORDS.md` | **New ADR-032.** |
| `01_BUSINESS_RULE_BOOK.md` | Cross-reference notes on BR-013/BR-016 (rule text unchanged). |
| `22_BUSINESS_TRANSFORMATION_DECISION_LOG.md` | Cross-cutting addendum. |

## 4. Code Changes (key excerpts)

`model/warnings.py`:
```python
@unique
class WarningCategory(str, Enum):
    MISSING_REQUIRED_METADATA = "missing_required_metadata"
    SPECIFICATION_FALLBACK = "specification_fallback"
    SOURCE_DATA_INCONSISTENCY = "source_data_inconsistency"
    BUSINESS_RULE_WARNING = "business_rule_warning"

@dataclass(frozen=True)
class EngineWarning:
    code: str
    category: WarningCategory
    severity: WarningSeverity
    rule_id: str | None
    message: str
    article_id: str | None
    suggested_action: str | None
    context: tuple[tuple[str, str], ...] = field(default_factory=tuple)

    def context_dict(self) -> Mapping[str, str]:
        return dict(self.context)
```

`extraction/file_resolver.py` (fallback derivation, per entry, before physical matching):
```python
effective_entry = entry
if allow_filename_fallback:
    derived_filename = _derive_fallback_filename(entry)
    if derived_filename is not None:
        effective_entry = replace(entry, original_filename=derived_filename)
        warnings.append(_build_fallback_warning(entry, derived_filename, article_id))
match = _find_physical_file(root, effective_entry)
```
`entry` (the ICAM's own record) is never reassigned — only the local
`effective_entry` copy carries the derived name, and only
`ResolvedFile` (the generation-time, for-output type) is built from it.

**A design correction made during implementation**: `EngineWarning
.context` was initially typed `Mapping[str, str]` defaulting to `dict`,
mirroring `GeneratorDiagnostic.context`. Testing found this silently
broke `ArticleModel`'s hashability (`hash(ArticleModel(...))`) the
moment `warnings` was non-empty — a `dict` field makes a frozen
dataclass unhashable, and `test_article_model_is_usable_as_a_dict_key`/
`test_equal_article_models_hash_equal` already establish that
`ArticleModel` must stay hashable. Fixed by storing `context` as
`tuple[tuple[str, str], ...]` (immutable, hashable) with a
`context_dict()` method for convenient `dict`-style lookup — caught by
writing a direct `hash()` test before considering the type "first-class
data" ready, not discovered downstream.

## 5. Test Results

- `pytest tests/` — 995/995 pass (3 pre-existing, already-tracked golden
  ICAM-snapshot failures from an earlier, unrelated affiliation-structure
  fixture-regeneration task remain, untouched by this milestone).
- `tests/golden/ -m golden` — 21/24 pass (same 3 pre-existing failures,
  confirmed unrelated: none of the 3 golden packages trigger the
  missing-name condition, so this milestone's code path never executes
  for them — byte-for-byte unaffected).
- Coverage, modified modules: `extraction/file_resolver.py` 100%,
  `transform/coordinator.py` 100%, `model/warnings.py` 100%,
  `model/article.py` 99%→100% after adding direct `set_warnings()`
  tests, `packaging/builder.py` 100%, `packaging/models.py` 100%.
- `ruff check`/`ruff format --check` — clean. `mypy --strict` — clean,
  122 source files.

## 6. Fatal vs. Warning Classification

| Class | Examples | Behavior |
|---|---|---|
| **Fatal** (exception, no package produced) | Cannot locate physical file (no path to fall back to, fallback disabled, or derived name still unresolvable — e.g. `cs-2024-5238`'s embedded-image entries above); duplicate DOI; cannot generate XML; corrupted ZIP; unreadable XML; broken XSLT; malformed XML; unsafe XML (XXE/entity-expansion) | `MecaEngineError` subclass raised; `PackageBuilder.build()` never returns a `StagedPackage`; a caller may map this to `PackageStatus.FAILED` |
| **Warning** (package still produced) | Filename derived from path (this milestone, `SPECIFICATION_FALLBACK`); unknown custom-meta key (`BUSINESS_RULE_WARNING`, BR-071's existing deny-list philosophy); unknown contributor/reviewer role (`SOURCE_DATA_INCONSISTENCY`); unexpected attribute/namespace (`SOURCE_DATA_INCONSISTENCY`); data normalization (`SPECIFICATION_FALLBACK`); recovered metadata (`MISSING_REQUIRED_METADATA`); deprecated structure (`BUSINESS_RULE_WARNING`) | Recorded as an `EngineWarning` on `ArticleModel.warnings`; `PackageBuilder.build()` returns a `StagedPackage` with `status=PASS_WITH_WARNINGS` |

Only the filename-fallback warning is implemented in this milestone —
the other Warning-class examples are documented here as the intended
home (`WarningCategory`) for future work, per the approved scope
(aggregating the separate, pre-existing `GeneratorDiagnostic` system was
explicitly deferred, not part of this milestone).

## 7. Architecture Compliance

- **Layering preserved**: `model/warnings.py` defines its own
  `WarningSeverity` rather than importing `extraction.parsed_model
  .DiagnosticSeverity` or `generators.diagnostics.DiagnosticSeverity` —
  `model` must never depend on `extraction`/`generators`; this mirrors
  the same reasoning `generators/diagnostics.py` already documents for
  not importing `extraction`'s version. Two independent diagnostic
  systems already existed by design; this milestone adds a third,
  purpose-built type rather than collapsing the existing two.
- **`extraction`/`transform` → `model` dependency direction unchanged**
  — `file_resolver.py` importing `model.warnings` is the same direction
  as its existing `model.article.ResolvedFile` import.
- **No generator touched** — the fallback and warning-construction
  happen entirely in `extraction`/`transform`, before any
  `GeneratorContext` exists; every generator inherits the effect
  (a resolved file, a warning on the model) without any generator-level
  code change.
- **ICAM write-once discipline preserved** — `set_warnings()` follows
  the exact same `_assert_not_already_set` pattern as the other 7
  fields, differing only in being optional (most articles have zero
  warnings) rather than mandatory.
- **`FeatureFlagsConfig` reaching `extraction`/`transform`** is new —
  confirmed, during design, to be the first feature flag read outside
  `generators/`. `TransformationCoordinator.__init__`'s new
  `feature_flags: FeatureFlagsConfig | None = None` parameter is
  additive; all 20 existing test call sites (constructing it without
  this parameter) are confirmed unaffected.

## 8. Certification Re-run

Direct re-execution (`extract_all_metadata` → `TransformationCoordinator
.build_model`, real `config/feature-flags.yaml`,
`allow_filename_fallback: true`) against the 3 packages the prior
specification audit investigated:

| Package | Before this milestone | After this milestone |
|---|---|---|
| `etls-2025-3020` | `FileReferenceMissingError`: `'Licence to publish.pdf'` absent | **Unchanged** — identical error, identical reason (no `.pdf` file exists anywhere in the package; `name` field was populated, so fallback never engages) |
| `cs-2025-6682` | `FileReferenceMissingError`: `'Licence to Publish Form - OA 2025 - CCBY.pdf'` absent | **Unchanged** — identical error (the physically-present, similar-sounding file is a blank template download link embedded in correspondence text, not a submission; `name` field was populated, so fallback never engages) |
| `cs-2024-5238` | `FileReferenceMissingError`: `category='tables'`, empty `name` | **Different failure, further progress**: the `tables` entry now resolves via fallback (1 `BR013_FALLBACK_FILENAME_FROM_PATH` warning recorded); pipeline now fails on a *different*, independent entry (`category='figure'`, an embedded-resource image reference with no name field **and** no corresponding physical file anywhere in the package — confirmed by direct search) |

`cs-2024-5238` is **not** newly certifiable as a result of this
milestone alone — it has multiple, independent source-data gaps, and
this feature addresses exactly one class of them (missing `name` with a
resolvable `path`). This is reported precisely rather than overstated.

## 9. Remaining Risks

- `cs-2024-5238`'s embedded-image entries remain a genuine, separate,
  unrecovered gap (Category A, missing physical asset) — out of this
  milestone's scope; requires either a source-data fix or a future,
  separately-justified product decision (image references embedded in
  an HTML/DOCX export are a materially different risk profile from a
  standalone declared file, since there is no path-derivable filename
  to even attempt safe recovery against — no fallback is proposed here).
- The pre-existing, separate `GeneratorDiagnostic` system still
  dead-ends after each `GenerationResult` — `PackageStatus` does not
  yet reflect generator-level diagnostics, only the new ICAM-level
  `ArticleModel.warnings`. Deferred by explicit, approved scope
  decision, not an oversight.
- `allow_filename_fallback` defaulting to `true` is itself the
  business-risk decision ADR-032 records — every derived filename is
  unverified against the source's true intent (which is, by definition,
  unknown when `name` is absent); mitigated by the mandatory warning
  and the unchanged strict-mode opt-out, not eliminated.

## 10. Recommendations

- Business review of ADR-032's default (`true`) before wider rollout,
  per its own "Business Confirmation Required: Yes."
- Treat `cs-2024-5238`'s embedded-image gap as a new, separate
  investigation — do not assume this milestone's fallback should be
  widened to cover it without the same evidence-based process ADR-032
  itself went through.
- When a future need arises to surface generator-level diagnostics on
  the dashboard, extend `PackageStatus` computation to also read
  `context.diagnostics`, rather than introducing a third warning type —
  `EngineWarning`'s `context: Mapping[str, str]` is already
  open-vocabulary enough to carry generator-originated detail if that
  data is ever threaded through.
