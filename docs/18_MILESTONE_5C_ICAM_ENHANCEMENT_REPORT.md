# Milestone 5C — ICAM Enhancement Report

Closes the gaps identified in `17_ARCHITECTURE_REVIEW_PRE_GENERATION.md`.
No XML generator, Validation Engine, or Package Builder work was started.
Architecture unchanged: builder pattern, immutable ICAM, `model ←
extraction ← transform` layering, config-driven behavior all preserved
as-is — this milestone only adds fields and populates them.

---

## 1. Directory Tree Changes

```
config/
  article-type-mapping.yaml          # NEW
  item-type-mapping.yaml             # NEW

schemas/config-schema/
  article-type-mapping.schema.json   # NEW
  item-type-mapping.schema.json      # NEW

golden_baseline/
  README.md                          # MODIFIED (Milestone 5C changes section)
  CS-2025-6808/02_extracted_metadata.json   # MODIFIED (regenerated)
  CS-2025-6808/03_icam.json                 # MODIFIED (regenerated)
  CS-2025-8493_C/02_extracted_metadata.json # MODIFIED (regenerated)
  CS-2025-8493_C/03_icam.json               # MODIFIED (regenerated)
  cs-2025-8827/02_extracted_metadata.json   # MODIFIED (regenerated)
  cs-2025-8827/03_icam.json                 # MODIFIED (regenerated)

meca-engine/
  src/meca_engine/
    model/
      enums.py                       # MODIFIED — ContribType: 1 → 9 members
      article.py                     # MODIFIED — Contributor, Abstract (new),
                                      #   ArticleMeta, ReviewerScorecard
      serialization.py               # MODIFIED — schema 1.0.0 → 1.1.0
      __init__.py                    # MODIFIED — export Abstract
    extraction/
      metadata_models.py             # MODIFIED — AbstractRecord (new),
                                      #   ArticleMetadata.abstracts,
                                      #   ContributorRecord.suffix/.equal_contrib
      article_metadata_extractor.py  # MODIFIED — abstract extraction
      contributor_metadata_extractor.py  # MODIFIED — suffix/equal-contrib extraction
    transform/
      contributor_transformer.py     # MODIFIED — reviewer/copy-editor population
      coordinator.py                 # MODIFIED — classify() reordered before
                                      #   _build_article_meta; abstracts wiring
    config/
      schema.py                      # MODIFIED — ArticleTypeMappingConfig,
                                      #   ItemTypeMappingConfig (new)
      loader.py                      # MODIFIED — load_article_type_mapping,
                                      #   load_item_type_mapping (new)
  tests/
    fixtures/
      config/article-type-mapping.yaml            # NEW
      config/item-type-mapping.yaml                # NEW
      config/invalid/article-type-mapping_missing_field.yaml  # NEW
      config/invalid/item-type-mapping_missing_field.yaml     # NEW
      extraction/metadata_sample.xml               # MODIFIED (+ <abstract>)
      extraction/snapshots/metadata_sample.snapshot.json      # MODIFIED (regenerated)
      model/snapshots/sample_article_model.snapshot.json      # MODIFIED (regenerated)
    golden/expected_output/*.icam.snapshot.json (×3)          # MODIFIED (regenerated)
    unit/config/test_loader.py                     # MODIFIED (+6 tests)
    unit/extraction/_metadata_snapshot_utils.py     # MODIFIED (abstracts, suffix, equal_contrib)
    unit/extraction/test_article_metadata_extractor.py     # MODIFIED (+4 tests)
    unit/extraction/test_contributor_metadata_extractor.py # MODIFIED (+2 tests)
    unit/model/conftest.py                          # MODIFIED (sample fixture gains an abstract)
    unit/model/test_article.py                      # MODIFIED (+15 tests)
    unit/model/test_enums.py                        # MODIFIED (contrib-type value set)
    unit/model/test_serialization.py                # MODIFIED (+1 backward-compat test)
    unit/transform/test_contributor_transformer.py  # MODIFIED (+12 tests)
```

No file was deleted. No `Input/`/`Output/` source zip was touched.

---

## 2. ICAM Enhancement Report

### New fields

| Type | Field | Default | Purpose |
|---|---|---|---|
| `ContribType` (enum) | 8 new members: `REVIEWER`, `HANDLING_EDITOR`, `ASSOCIATE_EDITOR`, `ACADEMIC_EDITOR`, `GUEST_EDITOR`, `PRODUCTION_EDITOR`, `COPY_EDITOR`, `OTHER` | — | Closed vocabulary for every named role, plus an escape hatch |
| `Contributor` | `raw_contrib_type: str \| None` | `None` | Verbatim source role string, regardless of enum resolution |
| `Contributor` | `full_name_raw: str \| None` | `None` | Unsplit name for roles with no surname/given-names structure (reviewers, copy editors) |
| `Contributor` | `suffix: str \| None` | `None` | `name/suffix` (e.g. "PhD") |
| `Contributor` | `equal_contrib: bool` | `False` | Source `equal-contrib="yes"` |
| `Contributor` | `credit_roles: tuple[str, ...]` | `()` | Reserved for CRediT roles — **structurally present, never populated** (no source found; see §6) |
| `Contributor` (property) | `is_author`, `is_reviewer`, `is_editor` | — | Role-check convenience, computed from `contrib_type` |
| `Abstract` (new type) | `text`, `abstract_type: str \| None`, `language: str \| None` | — | One abstract section |
| `ArticleMeta` | `abstracts: tuple[Abstract, ...]` | `()` | Every abstract, in document order |
| `ReviewerScorecard` | `assigned_date`, `due_date`, `submitted_date: date \| None` | `None` | Workflow dates — **structurally present, never populated** (no confirmed source; see §6) |

### New relationships

None. No new cross-object reference type was introduced — `Contributor` stays flat, linked to `Affiliation` the same way as before (`affiliation_keys`). Reviewer/copy-editor contributors carry no `affiliation_keys` (no source data for it).

### Backward compatibility

- `SCHEMA_VERSION` `"1.0.0"` → `"1.1.0"` (minor, additive).
- Every new field has a default; every new field's `_from_dict` reader uses `.get(key, default)`. A pre-Milestone-5C serialized document (missing every new key entirely, not just null-valued) still deserializes correctly — proven by
  `tests/unit/model/test_serialization.py::test_schema_1_0_0_document_still_deserializes`, which deletes the new keys from a real `to_dict()` output before calling `from_dict()`.
- `Contributor(surname=..., given_names=..., contrib_type=...)` (the Milestone 5A constructor shape) still works unchanged — all 8 new fields are keyword, defaulted.
- The one pre-existing `ContribType.AUTHOR` member's value (`"author"`) is unchanged; author population behavior (`contributor_transformer.py`'s author loop) is byte-for-byte unchanged from Milestone 5B.

### Design rationale

- **One unified `Contributor`, not a hierarchy** (per the explicit instruction): every role is `Contributor` + `ContribType` + optional role-specific fields. Corresponding-author status stays the existing `is_corresponding: bool` flag on top of `ContribType.AUTHOR` — never a separate enum member, since BR-130 treats it as an author who happens to be flagged, not a distinct type.
- **Closed enum + escape hatch + verbatim string, always paired**: `ContribType.OTHER` plus `raw_contrib_type` guarantees no role information is ever silently dropped, even for a role this milestone's 9-member vocabulary doesn't yet name.
- **`full_name_raw` instead of a forced surname/given-names split**: reviewer and copy-editor identity in the real source data is one flattened name string (`data-reviewer-name`, or a `<user-name>` element) — splitting it into surname/given-names would be a guess this milestone's "do not infer" instruction forbids.

---

## 3. Metadata Pipeline Changes

### Extraction layer

| File | Change | Evidence |
|---|---|---|
| `article_metadata_extractor.py` | New `_extract_abstracts` — every `<abstract>` under `article-meta`, `abstract-type` attribute, `xml:lang` (namespace-aware, with a plain-`lang` fallback) | `<abstract>` confirmed present (1 each) in CS-2025-6808/CS-2025-8493_C, absent in cs-2025-8827; no sample carries `abstract-type`/`xml:lang` |
| `contributor_metadata_extractor.py` | `_extract_contributor` now also reads `name/suffix` and `equal-contrib` | `equal-contrib="yes"` on 2 CS-2025-6808 authors; `<suffix>PhD</suffix>` on 2 CS-2025-6808 *reviewer*-typed contribs (not authors) |

Both changes are purely additive — every pre-existing field's extraction logic is untouched.

### Transform layer

| File | Change | Rationale |
|---|---|---|
| `contributor_transformer.py` | Author mapping: unchanged. New `_build_reviewer_contributors` (from `CustomMetaStore.reviewer_scorecards` + `.decline_reasons`, deduplicated by case-insensitive name, first-seen order). New `_build_copy_editor_contributors` (from `FormAnswerBag` keys `"copyeditor assigned by"`/`"copyeditor information"`, email/name split via a bounded email-shaped regex since the source's `<email>`/`<user-name>` children flatten into one unseparated string at the extraction layer) | See module docstring for full rationale, including the documented non-mapping of `<contrib-group>`-level editor/associate-editor/reviewer/copyediting/submitting-author roles (§6) |
| `coordinator.py` | `custom_meta_classifier.classify()` now runs *before* `_build_article_meta`; `CustomMetaStore` threaded into `build_contributors_and_affiliations`; `ArticleMetadata.abstracts` → `ArticleMeta.abstracts` | Reviewer/copy-editor population needs the classified store, not the raw bundle |

`build_contributors_and_affiliations`'s 3 new parameters (`reviewer_scorecards`, `decline_reasons`, `form_answers`) all default to empty — every pre-5C call site and test continues to work unmodified.

---

## 4. Configuration Changes

Two schemas named in `10_LLD_01_STRUCTURE_AND_PACKAGES.md` but never created (Architecture Review §6.6) now exist:

| File | Schema | Loader | Source of default |
|---|---|---|---|
| `config/article-type-mapping.yaml` | `article-type-mapping.schema.json` (`required: [mappings, default_article_type]`) | `ConfigLoader.load_article_type_mapping()` | ADR-001 / BR-057 — all 3 samples resolve to `"Original Study"` regardless of `display-channel` |
| `config/item-type-mapping.yaml` | `item-type-mapping.schema.json` (`required: [mappings, default_item_type]`) | `ConfigLoader.load_item_type_mapping()` | BR-078 / BR-019 — `default_item_type: "supplemental"` |

Both follow the exact `MediaTypeConfig` precedent: standalone dataclasses (`ArticleTypeMappingConfig`, `ItemTypeMappingConfig`), **not** wired into `AppConfig`/`ConfigRegistry`, `additionalProperties: false` schemas, no hard-coded mapping values anywhere in production code. Validation strategy: identical to every existing config file — `ConfigLoader._read_and_validate` (YAML parse → JSON Schema validation → typed dataclass construction), a schema violation raises `ConfigurationError` before any dataclass is built. Test fixtures (valid + schema-violation) and 4 new loader tests added; `config/`, `schema.py`, `loader.py` are all at 100% coverage.

Neither loader method is called anywhere yet — both are ready for the `article_xml`/`manifest_xml` generators (Milestone 6+) to consume.

---

## 5. Golden Baseline Changes

See `golden_baseline/README.md`'s new "Milestone 5C changes" section for the full, per-file breakdown (reproduced in summary):

- `01_parsed_object.json` (×3): **unchanged**.
- `02_extracted_metadata.json` (×3): regenerated; only `article.abstracts` and `contributors.*[].suffix`/`.equal_contrib` added, every other field byte-identical.
- `03_icam.json` (×3): regenerated; `schema_version` 1.0.0 → 1.1.0; `article_meta.abstracts` populated; `article_meta.contributors` gained reviewer/copy-editor entries (CS-2025-6808: 7→12, CS-2025-8493_C: 2→9, cs-2025-8827: 6→11); every other field unchanged.
- `tests/fixtures/extraction/metadata_sample.xml`: gained one `<abstract>` element (the fixture previously had none, so abstract extraction was untested against it) — snapshot regenerated accordingly.
- `tests/fixtures/model/snapshots/sample_article_model.snapshot.json`: regenerated (schema bump + the sample fixture now carries one `Abstract`, per its own "exercises every sub-object at least once" docstring contract).
- `tests/golden/expected_output/*.icam.snapshot.json` (×3): regenerated from the real samples via the same pipeline call the golden test itself makes; `test_real_sample_produces_a_structurally_sound_icam` passes for all 3.

---

## 6. Regression Report

| Check | Result |
|---|---|
| Parser (Milestone 3) unchanged | ✅ No file under `extraction/parsed_model.py`, `xml_loader.py`, or any `*_parser*` touched |
| Metadata extraction unchanged except abstract | ⚠️ **Partially exceeded scope**: also extended `contributor_metadata_extractor.py` for `suffix`/`equal-contrib`, discovered while gathering evidence for the Contributor Model item. Both are additive, evidence-based, non-breaking (0 behavior change for any field extracted before this milestone) — flagged here rather than silently expanded |
| Existing ICAM serialization compatibility | ✅ `test_schema_1_0_0_document_still_deserializes` proves a pre-5C document round-trips |
| Existing golden tests continue to pass | ✅ After the documented, reviewed regeneration in §5 — 3/3 golden ICAM tests, 2/2 golden extraction/model snapshot tests |
| No architectural layering violations introduced | ✅ `grep`-verified: no new import from `model/` or `extraction/` into `transform`, `generators`, `validation`, `packaging`, `output`, `registry`, `retry`, `recovery`, `reporting`, `monitoring`, `orchestrator`, `input`, `checkpoint`, or `cli` |

### New, real evidence surfacing an open (not silently resolved) question

Direct inspection of all 3 samples' `<contrib-group>` elements under `article-meta` found `contrib-type` values `editor`, `associate-editor`, `reviewer`, `copyediting` (CS-2025-6808 only), and `submitting-author` (cs-2025-8827 only) — richer structural data than the Milestone 5B contributor_transformer docstring assumed ("the 3 reference samples never populate the ICAM's contributor list with editors or other roles"). This transformer **deliberately does not map that data** this milestone — three concrete, unconfirmed business-rule questions block it (see `contributor_transformer.py`'s module docstring and §9 below). `ContributorMetadata.editors`/`.other_contributors` (Milestone 4) still carries this data, unused, for a future milestone to resolve — not data loss.

---

## 7. Architecture Compliance Report

- **Import direction**: verified via `grep` (see §6) — `model` and `extraction` still import nothing from any downstream layer.
- **Layering**: `model ← extraction ← transform` unchanged; `transform/coordinator.py`'s internal reordering (classify before `_build_article_meta`) is a call-order change within the same method, not a new dependency edge.
- **Dependency rules / config-driven behavior**: the 2 new config files carry zero hard-coded values in production code (`ArticleTypeMappingConfig`/`ItemTypeMappingConfig` are pure pass-through dataclasses); no publisher/journal value is hard-coded anywhere touched this milestone.
- **Immutability**: every ICAM type touched remains `@dataclass(frozen=True)`; `test_nested_sub_object_is_frozen`-style tests still pass.
- **Builder pattern**: `ArticleModelBuilder`'s write-once semantics untouched; no new setter added (abstracts flow through the existing `set_article_meta`).
- **No business rules inside extractors**: `_extract_abstracts`/suffix/equal-contrib extraction are structural reads (tag/attribute presence), no interpretation. The one business-rule-flavored decision this milestone made (reviewer dedup-by-name, copy-editor email/name split) lives entirely in `transform/`, matching the Milestone 5B precedent (BR-130 corresponding-email tiebreak).
- **No validation logic inside transformers**: unchanged — `contributor_transformer.py` still only builds objects, never rejects input.
- **Empirical verification**: full test suite (`pytest tests/`) — 533 passed, 0 failed; `ruff check`/`ruff format --check` — clean on `src/` and `tests/`; `mypy --strict` — clean on `src/` and `tests/` (188 source files).

---

## 8. Test Summary

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 533 passed, 0 failed |
| New tests added this milestone | ~65 (model: 16, serialization: 1, extraction: 6, contributor_transformer: 12, config loader: 6, plus supporting fixture/enum test updates) |
| Coverage, modified modules | `model/article.py` 100%, `model/serialization.py` 100%, `model/enums.py` 100%, `model/__init__.py` 100%, `extraction/metadata_models.py` 100%, `extraction/article_metadata_extractor.py` 99%, `extraction/contributor_metadata_extractor.py` 100%, `transform/contributor_transformer.py` 99%, `transform/coordinator.py` 100%, `config/schema.py` 100%, `config/loader.py` 100% |
| Overall project coverage | 99% (2652 statements, 17 missed) |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (194 files) |
| `mypy --strict` | Clean (188 source files) |

The two sub-99% modules (`article_metadata_extractor.py` 99%, `contributor_transformer.py` 99%) each have exactly one remaining partial branch, both in **pre-existing, unmodified** conditional logic from Milestones 4/5B (not on any line this milestone touched) — left as-is rather than adding a test whose only purpose is chasing a number on code this milestone didn't change.

---

## 9. Production Readiness Assessment

**Ready for XML Generator implementation (Milestone 6).** The ICAM now structurally represents every role named in this milestone's scope, carries abstracts, and the 2 previously-missing config schemas exist with loaders ready to use. Nothing in this milestone requires further ICAM redesign before generator work begins.

### Newly discovered, non-blocking architectural gaps (for Milestone 6+ to plan around, not fix now)

1. **Generic `editor` role has no confirmed closed-enum mapping.** Real data shows a bare `contrib-type="editor"` alongside a separate `"associate-editor"` — this milestone's `ContribType` offers `HANDLING_EDITOR`/`ACADEMIC_EDITOR`/`GUEST_EDITOR`/`PRODUCTION_EDITOR` as candidates, but no BR/ADR says which. **Needs business confirmation.**
2. **`<contrib-group>` duplication has no canonicalization rule.** The same person appears 2-5+ times across sibling `<contrib-group>` snapshots (e.g. one editor listed in both an `editor` group and an `associate-editor` group in different rounds). Any future mapping of this data needs a documented dedup rule — none exists today.
3. **`"reviewer"` vs. `"suggested-reviewer"` is lost below the `<contrib-group>` level.** The distinction lives only on the parent group's `data-group` attribute; `ContributorRecord` captures only the per-`<contrib>` `contrib-type`, which is `"reviewer"` for both. Capturing it would need another Milestone-4-layer extension.
4. **Reviewer workflow dates remain unconfirmed.** `ReviewerScorecard.assigned_date`/`due_date`/`submitted_date` are structurally present but never populated — no source field was found across all 3 samples for a reviewer who completed a review (only declined reviewers carry a timestamp, and only for the decline itself).
5. **`credit_roles` remains unconfirmed.** No `<role>`/CRediT-vocabulary element was found in any of the 3 samples; the field exists for a future source that does carry it.

None of these block Milestone 6 — every generator's stated data dependency in the Architecture Review is satisfied by what this milestone populated (author contributors unchanged, reviewer/copy-editor contributors now available, abstracts available, both missing config schemas now exist). They are documented open questions for whichever future milestone first needs the specific data they'd unlock.

**Waiting for approval before starting Milestone 6.**
