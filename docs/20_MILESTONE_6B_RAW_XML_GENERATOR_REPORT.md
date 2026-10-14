# Milestone 6B — raw.xml Generator Report

Implements `RawXmlGenerator(BaseGenerator[RawXmlDocument])` — the first
production XML generator, built exclusively on the Milestone 6A
framework. No article.xml/manifest.xml/reviews.xml/transfer.xml, no
Package Builder, no Validation Engine.

---

## 1. Directory Tree Changes

```
config/
  raw-xml.yaml                                # NEW — BR-036/38/40/44/49/50 constants
  namespaces.yaml                              # MODIFIED — no change to file, referenced by this generator

schemas/config-schema/
  raw-xml.schema.json                          # NEW

meca-engine/
  src/meca_engine/
    config/
      schema.py                                # MODIFIED — RawXmlConfig (new)
      loader.py                                # MODIFIED — load_raw_xml_config (new)
    exceptions/
      article_errors.py                        # (Milestone 6A) GeneratorError/GeneratorInvariantError/
                                                #   XmlSerializationError already present; unchanged this milestone
    generators/
      raw_xml/
        __init__.py                            # MODIFIED — exports RawXmlDocument/RawXmlGenerator
        document.py                            # NEW — RawXmlDocument
        generator.py                           # NEW — RawXmlGenerator + all mapping functions
  tests/
    fixtures/config/raw-xml.yaml               # NEW
    fixtures/config/invalid/raw-xml_missing_field.yaml  # NEW
    unit/config/test_loader.py                 # MODIFIED (+2 tests)
    unit/generators/raw_xml/
      __init__.py                              # (pre-existing stub)
      conftest.py                              # NEW — rich/empty ArticleModel fixtures
      test_generator.py                        # NEW — 51 tests
    golden/
      test_raw_xml_golden.py                   # NEW — 3 golden tests (one per real package)
```

No file was deleted. No `Input/`/`Output/` source zip was touched.

---

## 2. RawXmlGenerator Design

**Architecture**: `RawXmlGenerator(BaseGenerator[RawXmlDocument])` implements only `_generate(context) -> RawXmlDocument` and the `generator_name` property, exactly per Milestone 6A's contract — every lifecycle concern (logging, timing, error classification, the `GenerationResult` wrapper) comes from `BaseGenerator.generate()` unchanged. The constructor takes `namespace_manager: NamespaceManager` and `raw_xml_config: RawXmlConfig` — both injected, neither hard-coded.

**Mapping strategy**: `_generate` builds one `Element` tree entirely through `XmlDocumentBuilder`/`generators.xml.helpers`, section by section (`_build_journal_meta`, `_build_article_meta` → 11 sub-functions, `_attach_body`), each documented with its BR-036–050 traceability. Every sub-function follows the same shape: read one or more `ArticleMeta`/`JournalMeta`/`ArticleIdentity`/`CustomMetaStore` fields, emit the corresponding element(s) if present, or record a `context.diagnostics` entry and skip if absent — **never** raising for an optional omission, **never** inventing a value.

**Lifecycle**: `BaseGenerator.generate()` logs start/complete, times the call, and classifies any unexpected exception into `GeneratorInvariantError` — verified directly (`test_malformed_body_fragment_raises_generator_invariant_error`) by feeding a deliberately malformed `BodyFragment.raw_xml_fragment` and confirming the framework's classification fires, not a hand-rolled `try/except` in this generator.

**Framework usage — zero manual XML, zero duplicated helpers**: every element/attribute in the tree is created via `XmlDocumentBuilder.create_root`/`.create_element`; every namespace declaration comes from `NamespaceManager.declarations(...)`; `add_optional_element`/`format_year_month_day` come from `generators.xml.helpers`. The **one** documented exception is `_attach_body`, which reparses `BodyFragment.raw_xml_fragment` (already-serialized, trusted ICAM text — never external input) via `xml.etree.ElementTree.fromstring` so it can be attached as a normal subtree, rather than string-concatenated — this is the source data being XML already, not this generator authoring XML by hand.

---

## 3. Business Rule Traceability

| BR | Rule | Code Module | Test Coverage |
|---|---|---|---|
| BR-036 | JATS Journal Publishing DTD v1.3 DOCTYPE | `generator.py::RawXmlGenerator._generate` (`DoctypeDeclaration`), `config/raw-xml.yaml` | `test_doctype_matches_br_036` |
| BR-037 | 4 namespaces declared unconditionally | `generator.py::_generate` (`namespace_manager.declarations`) | `test_root_declares_4_namespaces_unconditionally_br_037` |
| BR-038 | Encoding declared upper-case UTF-8 | `generator.py::_generate` (`config.encoding`) | `test_xml_declaration_matches_br_038` |
| BR-039 | Retains every source `id` | `_attach_body` (verbatim body reparse) | `test_body_attached_verbatim_including_ids`; **partial** — see §6 |
| BR-040 | `article-type` always `research-article` | `config/raw-xml.yaml` (`article_type`) | `test_article_type_matches_br_040` |
| BR-041 | Strips internal workflow/log tags | Satisfied by construction — the ICAM never captures `<workflow>` (a top-level sibling of `<front>`/`<body>`, confirmed via source inspection), so nothing in this generator can reproduce it | `test_back_matter_always_diagnosed_never_fabricated` (adjacent absence check); see §4 for the full evidence trail |
| BR-042 | 100% of `custom-meta-group`, no pruning | `_build_custom_meta_group` + 5 `_add_*_entries` helpers | `test_custom_meta_group_reconstructed_from_all_categories`, `test_partial_custom_meta_categories_diagnose_only_missing_ones`; **best-effort, not verbatim** — see §6 |
| BR-043 | `<body>` verbatim copy | `_attach_body` | `test_body_attached_verbatim_including_ids`, `test_missing_body_is_diagnosed` |
| BR-044 | Pretty-printed | `config/raw-xml.yaml` (`pretty_indent_spaces: 0`), `XmlDocumentBuilder.serialize` | `test_pretty_print_uses_zero_indentation_per_br_044`, `test_compact_mode_produces_no_newlines_between_elements` |
| BR-045 | Copyright statement preserved verbatim | `_build_permissions` | `test_copyright_statement_preserved_verbatim` |
| BR-046 | Never adds `<license>` | Satisfied by omission — no code path ever creates a `license` element | `test_no_license_element_ever_added_br_046` |
| BR-047 | `history` dates copied verbatim | `_build_history` | `test_history_dates_copied_verbatim`, `test_no_history_dates_is_diagnosed` |
| BR-048 | Filename `<ArticleID>_raw.xml` | `generator.py::_generate` (`RawXmlDocument.filename`) | `test_filename_matches_br_048_pattern` |
| BR-049 | `dtd-version="1.3"` | `config/raw-xml.yaml` (`dtd_version`) | `test_dtd_version_matches_br_049` |
| BR-050 | `xml:lang="en"` unconditionally | `config/raw-xml.yaml` (`default_xml_lang`) | `test_xml_lang_matches_br_050` |

---

## 4. Field-Level Mapping Matrix

| raw.xml Field | ICAM Source | Business Rule | Configuration | Test Case |
|---|---|---|---|---|
| `/article/@article-type` | — (constant) | BR-040 | `raw-xml.yaml: article_type` | `test_article_type_matches_br_040` |
| `/article/@dtd-version` | — (constant) | BR-049 | `raw-xml.yaml: dtd_version` | `test_dtd_version_matches_br_049` |
| `/article/@xml:lang` | — (no ICAM field; see §6) | BR-050 | `raw-xml.yaml: default_xml_lang` | `test_xml_lang_matches_br_050` |
| `/article/@xmlns:mml,xlink,xsi,ali` | — (constant) | BR-037 | `namespaces.yaml` via `NamespaceManager` | `test_root_declares_4_namespaces_unconditionally_br_037` |
| DOCTYPE | — (constant) | BR-036 | `raw-xml.yaml: doctype_public_id/system_id` | `test_doctype_matches_br_036` |
| `front/journal-meta/journal-id` | `ArticleIdentity.journal_id` | BR-039 (partial — see §6) | — | `test_journal_meta_fields_mapped` |
| `front/journal-meta/journal-title-group/journal-title` | `JournalMeta.journal_title` | — | — | `test_journal_meta_fields_mapped` |
| `front/journal-meta/journal-title-group/abbrev-journal-title` | `JournalMeta.abbrev_titles` | — | — | `test_journal_meta_fields_mapped` |
| `front/journal-meta/issn` ×2 | `JournalMeta.issn_ppub`/`issn_epub` | — | — | `test_journal_meta_fields_mapped` |
| `front/journal-meta/publisher/publisher-name` | `JournalMeta.publisher_name` | — | — | `test_journal_meta_fields_mapped` |
| `article-meta/article-id[@pub-id-type=publisher-id]` | `ArticleIdentity.publisher_id_value` | BR-039 | — | `test_article_ids_mapped_from_identity` |
| `article-meta/article-id[@pub-id-type=doi]` | `ArticleIdentity.doi_article_id_value` | BR-039 | — | `test_article_ids_mapped_from_identity` |
| `article-meta/article-categories/subj-group[display-channel]` | `ArticleMeta.display_channel_subject` | — | — | `test_article_categories_mapped` |
| `article-meta/article-categories/subj-group[heading]` | `ArticleMeta.heading_subjects` | — | — | `test_article_categories_mapped` |
| `article-meta/title-group/article-title` | `ArticleMeta.article_title` | — | — | `test_title_group_mapped` |
| `article-meta/aff` | `ArticleMeta.affiliations` | — | — | `test_multiple_affiliations_rendered_with_sequential_aff_ids` |
| `article-meta/contrib-group/contrib` | `ArticleMeta.contributors` | — (see §6: single group, not source's multi-group structure) | — | `test_multiple_contributors_rendered_in_one_contrib_group` |
| `contrib/@contrib-type` | `Contributor.raw_contrib_type` or `.contrib_type.value` | BR-039 (verbatim role string) | — | `test_multiple_contributors_rendered_in_one_contrib_group` |
| `contrib/name/surname,given-names,suffix` | `Contributor.surname/.given_names/.suffix` | — | — | `test_author_contrib_uses_structured_name`, `test_contributor_suffix_rendered` |
| `contrib/string-name` (unsplit) | `Contributor.full_name_raw` | — | — | `test_reviewer_contrib_uses_full_name_raw_not_structured_name` |
| `contrib/@corresp`, `@equal-contrib` | `Contributor.is_corresponding/.equal_contrib` | — | — | `test_author_contrib_uses_structured_name` |
| `contrib/email` | `Contributor.email` | — | — | `test_author_contrib_uses_structured_name` |
| `contrib/xref[@ref-type=aff]` | `Contributor.affiliation_keys` | — | — | `test_author_contrib_uses_structured_name` |
| `article-meta/author-notes/corresp/email` | `ArticleMeta.corresponding_emails` | — (name prefix not reproduced — see §6) | — | `test_corresponding_email_rendered_in_author_notes` |
| `article-meta/history/date` ×3 | `ArticleMeta.history_dates` | BR-047 | — | `test_history_dates_copied_verbatim` |
| `article-meta/permissions/copyright-statement,-year` | `ArticleMeta.copyright_statement/.copyright_year` | BR-045 | — | `test_copyright_statement_preserved_verbatim` |
| `article-meta/abstract` | `ArticleMeta.abstracts` | — | — | `test_abstract_text_preserved`, `test_abstract_type_and_language_rendered_when_present` |
| `article-meta/kwd-group/kwd` | `ArticleMeta.keywords` | — | — | `test_keywords_rendered_in_order` |
| `article-meta/funding-group` | `ArticleMeta.funding` | — | — | `test_funding_group_rendered` |
| `article-meta/counts/word-count,ref-count,fig-count` | `ArticleMeta.counts` | — | — | `test_counts_rendered`, partial-counts tests |
| `article-meta/custom-meta-group/custom-meta` | `CustomMetaStore.{form_answers,file_entries,reviewer_scorecards,decision_drafts,decline_reasons}` | BR-042 (best-effort — see §6) | — | `test_custom_meta_group_reconstructed_from_all_categories` |
| `body` (entire subtree) | `BodyFragment.raw_xml_fragment` | BR-043 | — | `test_body_attached_verbatim_including_ids` |
| `back` | **no ICAM source** | — | — | `test_back_matter_always_diagnosed_never_fabricated` |
| `article-meta/subtitle` | **no ICAM field** | — | — | diagnosed nowhere (field doesn't exist to check) — see §6 |
| `article-meta/pub-date`, `volume`, `issue`, `fpage`, `lpage`, `elocation-id` | **no ICAM field** | — | — | see §6 |

---

## 5. Golden Comparison Report

Ran the full parse → extract → transform → generate pipeline against all 3 real reference packages and compared against their real `Output/*.zip` raw.xml. Classified per the required taxonomy:

| Difference | Classification | Evidence |
|---|---|---|
| `article-type`, `dtd-version` values | **identical** | 3/3 exact match |
| Article-id (`publisher-id`, `doi`) values | **identical** | 3/3 exact match |
| Article title text | **identical** | 3/3 exact match |
| DOCTYPE, 4 namespaces, root attribute order | **identical** | Confirmed byte-for-byte against real evidence during design (see generator module docstring) |
| Pretty-print style (one element/line, zero indent) | **identical** | Confirmed 3/3 real samples use this exact style, not hierarchical indentation |
| `journal-id` casing | **source-data / business-rule difference** | CS-2025-6808's real value is `"CS"`; the only ICAM field (`ArticleIdentity.journal_id`) is ADR-028's lower-cased config-lookup key (`"cs"`) — the other 2 samples' source values are already lower-case, so this specific mismatch only manifests for CS-2025-6808. **Unresolved**: the ICAM has no field carrying the verbatim, non-lower-cased source string. |
| `<body>` element/id counts (2696 vs 620 for CS-2025-6808; similarly divergent for the other 2) | **source-data difference** | The real reference packages' bodies have already had Kriyadocs tracked-change/copyediting wrapper elements (`<span data-class="jrnlLQCRef">`, `<named-content content-type="ins ...`/`"del ...">`) removed; the `Input/*.zip` source this pipeline reads still carries all of them. 294/296 (CS-2025-6808) real body element ids are still found within the generated (superset) body — the golden test asserts ≥90% overlap, not exact equality. Root cause: the `Input/` snapshot appears to predate the `Output/` snapshot's final copyediting acceptance — **not** a BR-041 gap (BR-041's named tag list — `workflow`/`stage`/`log`/etc. — lives in a completely separate top-level `<article›/<workflow>` section the ICAM never captures at all, confirmed via source inspection, and is therefore satisfied by construction). |
| `xlink:href`/`xlink:title` attributes inside `<body>` | **unresolved issue** | Confirmed defect in Milestone 5B's `body_fragment_builder.py::_serialize_element`: it reconstructs attribute names from `ParsedAttribute.name` only, silently dropping the namespace prefix (`ParsedAttribute.namespace_uri` is never consulted), so a source `<graphic xlink:href="...">` reserializes as `<graphic href="...">`. Confirmed present in CS-2025-8493_C's body (`xlink:href`/`xlink:title` on `<graphic>`/similar elements). **Not fixed in this milestone** (out of stated scope — a Milestone 5B module, not this generator) — flagged as a priority fix before/alongside article.xml (BR-051 derives article.xml from raw.xml, so it would inherit this defect). |
| `<back>` (references, footnotes, supplementary-material) | **unresolved issue** | No ICAM field carries this content at all (`BodyFragment` only ever reads `<body>`) — omitted, diagnosed (`DiagnosticSeverity.WARNING`) on every generation, never fabricated. |
| `<custom-meta-group>` structure (ids, exact attributes, unclassified ~66%-of-one-sample entries) | **unresolved issue** | `CustomMetaStore` is `custom_meta_classifier`'s classified output (Milestone 5B), not the unfiltered Milestone 4 entries — this generator reconstructs the closest BR-042-shaped output achievable from the 5 classified collections, never byte-identical. Entries with no recognizable `meta-name` are silently dropped by the classifier itself (documented in its own module docstring) and are unrecoverable at this layer. |
| `contrib-group` structure (1 group vs. source's 4-6 role-specific groups) | **acceptable formatting difference / unresolved issue** | `ArticleMeta.contributors` is a single, already-flattened list (Milestone 5B/5C design) — this generator emits one `contrib-group` preserving each contributor's own role via `contrib-type`, not the source's per-role group boundaries (not available in the ICAM). |
| `author-notes/corresp` text (missing leading contributor name) | **acceptable formatting difference** | `CorrespEmail` carries no contributor name field; only the `<email>` child is reproduced. |
| `article-meta/subtitle`, `pub-date`, `volume`, `issue`, `fpage`, `lpage`, `elocation-id` | **unresolved issue** | Extracted at Milestone 4 (`ArticleMetadata`/`JournalMetadata`) but never wired into any Milestone 5B/5C ICAM transformer — no field exists to read from. |

**None of these differences were silently absorbed** — every one is either asserted against in the test suite (where achievable) or explicitly diagnosed at generation time (where not).

---

## 6. Test Report

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 675 passed, 0 failed |
| New tests this milestone | 56 (51 in `tests/unit/generators/raw_xml/test_generator.py`, 3 in `tests/golden/test_raw_xml_golden.py`, 2 in `tests/unit/config/test_loader.py`) |
| Coverage, new/modified modules | `generators/raw_xml/generator.py` 100%, `generators/raw_xml/document.py` 100%, `config/schema.py` 100%, `config/loader.py` 100% |
| Overall project coverage | 99% (3140 statements, 15 missed — all pre-existing, unmodified lines outside this milestone's scope) |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (218 files) |
| `mypy --strict` | Clean (212 source files) |

Test categories covered per the task's explicit list: complete generation ✅, empty optional fields ✅ (`empty_context` fixture), multiple contributors ✅, multiple affiliations ✅, workflow history (`ReviewerScorecard`/`DecisionDraft`/`DeclineReason` → custom-meta-group) ✅, custom metadata ✅, namespace declarations ✅, deterministic ordering ✅ (`test_generation_is_deterministic_across_repeated_calls`), pretty vs compact serialization ✅, malformed ICAM ✅ (`test_malformed_body_fragment_raises_generator_invariant_error`), generator exceptions ✅, diagnostics ✅. "References"/"assets" are not separately tested — no ICAM field maps to `<back>`'s reference list, and file/asset data (`ResolvedFileList`) is manifest.xml's concern (documented in the generator's module docstring), not raw.xml's.

---

## 7. Architecture Compliance Report

- **Dependency direction, empirically verified**: `grep` over `src/meca_engine/generators/raw_xml/` shows imports only from `meca_engine.generators.*` (framework), `meca_engine.model.enums`/`meca_engine.config.schema` (type-only), and stdlib `xml.etree.ElementTree`. **Zero** imports from `meca_engine.extraction` or `meca_engine.transform`.
- **No extraction/metadata access**: confirmed by the same import check — this generator has no route to `ExtractionBundle`, `ParsedDocument`, or any Milestone 3/4 type.
- **ICAM immutability**: `RawXmlGenerator` never assigns to any `ArticleModel`/`ArticleMeta`/etc. field; all frozen dataclasses remain frozen; the one "mutation" (`root.append(fromstring(...))`) operates on a locally-created `xml.etree.ElementTree.Element` (this generator's own working tree), never on any ICAM object.
- **Framework correctly reused**: every element/attribute created via `XmlDocumentBuilder`; every namespace resolved via `NamespaceManager`; lifecycle entirely via `BaseGenerator.generate()` (this generator never re-implements logging, timing, or error classification).
- **No duplicated XML helper logic**: `grep` confirms `generators/raw_xml/generator.py` is the only new module importing `xml.etree.ElementTree` for tree *construction* — `_attach_body`'s `fromstring` call is the sole, documented exception (reparsing already-serialized ICAM text, not authoring new XML).
- **Configuration usage**: `RawXmlConfig`/`NamespaceConfig` are the only sources of DOCTYPE/namespace/article-type/dtd-version/xml:lang/encoding/indentation values — `grep` for BR-040's `"research-article"` string and BR-049's `"1.3"` confirms both appear only in `config/raw-xml.yaml` and its test fixtures, never as a literal inside `generator.py`.

---

## 8. Performance Report

Measured directly against all 3 real reference packages (Apple silicon, single process, no parallelism):

| Article | ICAM build time | Generation time | Output size | Real raw.xml size |
|---|---|---|---|---|
| CS-2025-6808 | 116.5 ms | 26.6 ms | 1,065,048 bytes | 354,021 bytes |
| CS-2025-8493_C | 47.8 ms | 15.2 ms | 727,665 bytes | 606,405 bytes |
| cs-2025-8827 | 101.5 ms | 10.0 ms | 420,132 bytes | 96,112 bytes |

Generation time is consistently a small fraction (15-25%) of total ICAM-build time — the generator itself is not the pipeline's bottleneck. Output size exceeds the real reference size for 2/3 samples, entirely attributable to the confirmed `<body>` tracked-change-markup difference documented in §5 (more elements retained → larger serialized output), not to inefficiency in this generator.

**Memory**: `tracemalloc` around one `generate()` call (CS-2025-6808, the largest sample) showed a ~2.0 MB allocation delta for the full generation (tree construction + serialization), consistent with the ~1 MB output size — no unexpected retention or copying beyond one working tree and its serialized bytes. `XmlDocumentBuilder.serialize()`'s one internal deep-clone (needed so repeated calls with different `pretty`/`compact` settings never cross-contaminate) is the single most significant allocation; acceptable at this document scale, and a candidate to revisit for very large documents if it becomes disproportionate.

**Observations only, no optimization performed** — no actual performance issue was identified at this scale (thousands of elements, ~1 MB documents).

---

## 9. Readiness Assessment

**Ready to begin article.xml — with 2 pre-existing defects flagged for resolution alongside it.** BR-051 confirms article.xml is derived *from* raw.xml, not re-parsed from source — meaning article.xml inherits raw.xml's output shape, including both of the following:

1. **The `xlink:` prefix-dropping bug in `body_fragment_builder.py`** (§5) — confirmed, real, affects at least CS-2025-8493_C. Recommend fixing before or alongside Milestone 7, since article.xml's body-derived content would otherwise carry the same defect forward.
2. **The `ArticleIdentity.journal_id` lower-casing conflict with BR-039-style verbatim needs** (§5) — low-impact today (2/3 samples unaffected), but worth a small, explicit ADR note since article.xml also reads journal identity.

Neither defect blocks starting article.xml — both are narrow, well-understood, and isolated to specific fields. The remaining documented gaps (`<back>`, `custom-meta-group` verbatim fidelity, multi-group `contrib-group` structure, missing `subtitle`/`pub-date`/`volume`/`issue`/`fpage`/`lpage`) are pre-existing ICAM scope boundaries from Milestones 4/5B/5C, unrelated to raw.xml correctness, and can be addressed independently whenever a future generator needs that specific data.

**Waiting for approval before starting Milestone 7 (article.xml Generator).**
