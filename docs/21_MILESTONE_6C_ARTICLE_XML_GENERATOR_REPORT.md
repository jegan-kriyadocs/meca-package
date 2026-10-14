# Milestone 6C — article.xml Generator Report

Prerequisite fix (xlink namespace preservation in `body_fragment_builder.py`)
completed and verified first, per explicit instruction. Then implements
`ArticleXmlGenerator(BaseGenerator[ArticleXmlDocument])` — the first
**business-transformation** generator, built exclusively on the
Milestone 6A framework and composed with (not duplicating)
`RawXmlGenerator`. No manifest.xml/reviews.xml/transfer.xml, no Package
Builder, no Validation Engine.

---

## 0. Prerequisite Fix — `body_fragment_builder.py` xlink Namespace Bug

**Bug** (confirmed in Milestone 6B's report, §5): `_serialize_element` rebuilt
every tag/attribute name from `ParsedElement.tag`/`ParsedAttribute.name`
only, never consulting `.namespace_uri` — so a source `xlink:href` silently
reserialized as bare `href`, corrupting any namespace-prefixed content
inside `<body>` (confirmed present in CS-2025-8493_C).

**Root cause**: the serializer had no way to turn a parsed element's
namespace URI back into a literal prefix — it only ever saw the local
name Milestone 4's parser had already split off.

**Fix**: `build_body_fragment` now builds a `{namespace_uri: prefix}`
lookup from `ParsedDocument.namespace_declarations` (plus a permanent
`xml` → `http://www.w3.org/XML/1998/namespace` entry, since `xml:` is
reserved and never appears in a document's own declarations), and
`_serialize_element` consults it via a new `_qualify` helper for every
tag and attribute name before emitting it — reconstructing `xlink:href`
correctly whenever `xlink` was declared in scope; a name with no
resolvable prefix degrades to its bare local form (unchanged from
before) rather than raising.

**Regression tests**: 7 new tests in
`tests/unit/transform/test_body_fragment_builder.py` covering: single
prefixed attribute, multiple prefixed attributes on one element,
prefixed element tags, the reserved `xml:` prefix, an unresolvable
namespace URI, a default (unprefixed) namespace declaration, and
duplicate-URI prefix precedence (first-declared wins).

**Golden re-verification**: `CS-2025-6808` and `CS-2025-8493_C`'s ICAM
snapshots regenerated — only `article.body_fragment.raw_xml_fragment`
changed (grew slightly from restored prefixes); every other field
byte-identical, confirmed via diff. `cs-2025-8827` unchanged (no
prefixed content in its body).

**Verification**: 100% coverage on `body_fragment_builder.py`, ruff
clean, mypy strict clean, all 13 tests (6 pre-existing + 7 new) pass.

---

## 1. Directory Tree Changes

```
config/
  article-xml.yaml                             # NEW — BR-052/53/74 constants
  license-templates.yaml                        # NEW — BR-063/064 boilerplate

schemas/config-schema/
  article-xml.schema.json                      # NEW
  license-templates.schema.json                # NEW

meca-engine/
  src/meca_engine/
    config/
      schema.py                                # MODIFIED — ArticleXmlConfig, LicenseTemplatesConfig (new)
      loader.py                                # MODIFIED — load_article_xml_config, load_license_templates (new)
    transform/
      body_fragment_builder.py                 # MODIFIED — xlink namespace fix (§0)
    generators/
      xml/
        builder.py                             # MODIFIED — import_subtree (new)
        helpers.py                             # MODIFIED — parse_document_with_namespaces, add_custom_meta_entry,
                                                #   strip_attribute, strip_attribute_matching, uses_prefix (new)
      raw_xml/
        generator.py                           # MODIFIED — reuses shared helpers; namespace_prefixes property (new)
      article_xml/
        __init__.py                            # NEW — exports ArticleXmlDocument/ArticleXmlGenerator
        document.py                            # NEW — ArticleXmlDocument
        generator.py                           # NEW — ArticleXmlGenerator + all transformation functions
  tests/
    fixtures/config/article-xml.yaml           # NEW
    fixtures/config/license-templates.yaml     # NEW
    fixtures/config/invalid/article-xml_missing_field.yaml       # NEW
    fixtures/config/invalid/license-templates_missing_field.yaml # NEW
    unit/config/test_loader.py                 # MODIFIED (+4 tests)
    unit/transform/test_body_fragment_builder.py  # MODIFIED (+7 regression tests, §0)
    unit/generators/xml/test_builder.py         # MODIFIED (+ import_subtree tests)
    unit/generators/xml/test_helpers.py         # MODIFIED (+ shared-helper tests)
    unit/generators/article_xml/
      __init__.py                              # NEW
      conftest.py                              # NEW — rich/empty ArticleModel fixtures
      test_generator.py                        # NEW — 49 tests
    golden/
      test_article_xml_golden.py               # NEW — 3 golden tests (one per real package)

golden_baseline/
  README.md                                    # MODIFIED — §0 fix documented
  CS-2025-6808/03_icam.json                    # MODIFIED (regenerated, §0)
  CS-2025-8493_C/03_icam.json                  # MODIFIED (regenerated, §0)

tests/golden/expected_output/
  CS-2025-6808.icam.snapshot.json              # MODIFIED (regenerated, §0)
  CS-2025-8493_C.icam.snapshot.json            # MODIFIED (regenerated, §0)

21_MILESTONE_6C_ARTICLE_XML_GENERATOR_REPORT.md  # NEW — this report
22_BUSINESS_TRANSFORMATION_DECISION_LOG.md       # NEW — separately-requested artifact
```

No file was deleted. No `Input/`/`Output/`/`golden_baseline` source zip was touched.

---

## 2. ArticleXmlGenerator Design

**Architecture**: `ArticleXmlGenerator(BaseGenerator[ArticleXmlDocument])` implements only `_generate(context) -> ArticleXmlDocument` and the `generator_name` property. The constructor takes `raw_xml_generator: RawXmlGenerator`, `namespace_manager: NamespaceManager`, `article_xml_config: ArticleXmlConfig`, `article_type_mapping: ArticleTypeMappingConfig`, and `license_templates: LicenseTemplatesConfig` — every one injected, none hard-coded.

**BR-051 composition, not duplication**: `_generate` calls `self._raw_xml_generator.generate(context)` first and re-parses its serialized output (`parse_document_with_namespaces`, §3 below) into a working `Element` tree, then transforms that tree — never re-implementing raw.xml's own JATS content mapping (contrib-group, aff, title-group, history, etc.) a second time. `BaseGenerator`'s lifecycle logging nests naturally (raw_xml's own start/complete events appear inside article_xml's), and both generators' diagnostics accumulate into the one shared `context.diagnostics`.

**Transformation strategy**: each BR-054–075 rule is one small function (`_copy_journal_meta`, `_build_article_ids`, `_build_doi`, `_copy_author_notes`, `_copy_permissions`, `_add_license`, `_resolve_license_type`, `_build_custom_meta_group`, `_add_latest_round_file_entries`), documented with its own BR reference, following raw.xml's established shape: copy/synthesize if the input is present, diagnose and skip if not — never raising for an optional gap, never inventing a value for a required one (`MissingDoiError`/`LicenseMappingError` for the two inputs this milestone treats as required).

**Framework usage — zero manual XML, zero duplicated helpers**: every element is created via `XmlDocumentBuilder.create_element`/`.import_subtree` (new method, added this milestone for BR-060's verbatim-with-ids-stripped copy); every namespace resolved via `NamespaceManager`; `strip_attribute_matching`/`uses_prefix`/`add_custom_meta_entry`/`parse_document_with_namespaces` (all new, added to the shared `generators.xml.helpers` module this milestone) are used by **both** raw_xml and article_xml — no duplicated tree-walking or Clark-notation logic exists in either generator.

**Two shared-framework additions made before writing this generator** (proactively, to avoid duplication):
1. `XmlDocumentBuilder.import_subtree` — deep-copies a raw.xml subtree for attachment into article.xml's own tree.
2. `xml.helpers.parse_document_with_namespaces` — reparses a **complete, self-declaring** document (raw.xml's own serialized output) back into literal `prefix:local` tags, distinct from the pre-existing `parse_fragment_with_namespaces` (which wraps a bare, non-self-declaring fragment). Both share the same de-Clarkification machinery; using the wrong one on a self-declaring document double-wraps it, and using the fragment one on raw.xml's full output was an early mistake caught via smoke-testing (see §6, item 5).

---

## 3. Business Rule Traceability

| BR | Rule | Code Module | Test Coverage |
|---|---|---|---|
| BR-051 | Derived from raw.xml, never re-parsed from source | `generator.py::_generate` (`self._raw_xml_generator.generate(context)`) | `test_raw_xml_generator_diagnostics_are_shared` |
| BR-052 | JATS Archiving DTD v1.2 DOCTYPE | `generator.py::_generate` (`DoctypeDeclaration`), `config/article-xml.yaml` | `test_doctype_matches_br_052` |
| BR-053 | Encoding declared lower-case `utf-8` | `config/article-xml.yaml: encoding` | `test_xml_declaration_matches_br_053` |
| BR-054 | Strips every `id="uuid"` attribute (semantic ids like `aff1`/`cor1` survive) | `xml/helpers.py::strip_attribute_matching` + `_UUID_ID_PATTERN` | `test_uuid_ids_stripped_...`, golden: 0 pure-UUID ids in any of 3 real outputs, confirmed |
| BR-055 | Removes `xmlns:mml`/`xsi`/`ali`/`xml:lang` | Satisfied by construction — this generator's root is built fresh; only `xlink` is ever conditionally declared | `test_root_never_declares_mml_xsi_ali_or_xml_lang_br_055` |
| BR-056 | Declares `xmlns:xlink` iff an `xlink:*` attribute is used | `generator.py::_generate` (`uses_prefix`/`uri_for`) | `test_xlink_declared_when_used_br_056`, `test_xlink_not_declared_when_unused_br_056`, `test_xlink_uri_unregistered_omits_the_namespace_declaration` |
| BR-057 | `article-type` always `"Original Study"` (config-mapped) | `generator.py::_generate` (`article_type_mapping`), `config/article-type-mapping.yaml` | `test_article_type_is_always_original_study_br_057`, `test_article_type_falls_back_to_default_for_unmapped_display_channel` |
| BR-058 | DOI generated, never copied: `prefix + doi_article_id` with `-`/`_` stripped, casing preserved | `generator.py::_build_doi` | `test_doi_generated_from_doi_article_id_br_058`; golden: exact match 3/3 |
| BR-059 | DOI prefix from journal config, not hard-coded | `generator.py::_build_article_ids` (`context.journal_config.doi_prefix`) | `test_doi_prefix_comes_from_journal_config_br_059` |
| BR-060 | Copies `article-categories`/`title-group`/`contrib-group`/`aff`/`kwd-group`/`funding-group`/`history`/`counts`/`abstract` with ids stripped | `generator.py::_build_article_meta` (`_COPIED_VERBATIM_TAGS`) | `test_title_copied_verbatim`, `test_history_copied_verbatim`, etc. |
| BR-061 | Strips `xlink:href`/`xlink:type` from `author-notes/corresp/email` | `generator.py::_copy_author_notes` | `test_corresp_email_xlink_attributes_stripped_br_061`, `test_corresp_without_email_child_is_left_untouched` |
| BR-062 | `permissions/copyright-statement`/`-year` copied verbatim | `generator.py::_copy_permissions` | `test_copyright_statement_and_year_copied_verbatim` |
| BR-063 | Synthesizes `<license>` when License Type resolves to CC-BY | `generator.py::_add_license` (`license_templates` config) | `test_cc_by_license_synthesized_...`; golden: identical `license-p` text 3/3 |
| BR-064 | `<license>` carries `license-type="open-access"` + `xlink:href` | `generator.py::_add_license` | `test_license_carries_license_type_and_xlink_href_br_064`; golden: matches 2/3 exactly, 3rd sample's own reference package omits both attributes on its outer `<license>` — a confirmed inconsistency in that one reference package itself (§4) |
| BR-065 | No sample demonstrates non-CC-BY handling — evidence-based default | `generator.py::_resolve_license_type` | `test_cc_by_license_synthesized_when_no_license_type_key_br_065_evidence`; documented as pending business confirmation, per BR-065's own flag |
| BR-066 | custom-meta retains only latest round's file-manifest entries | `generator.py::_add_latest_round_file_entries` (`RoundInfo.is_latest`) | `test_only_latest_round_file_entries_survive_br_066`, `test_no_file_entries_match_the_latest_round_is_diagnosed`; golden: **starved to 0 entries on all 3 real samples** by a separate, already-documented upstream defect (§4) — filter logic itself verified correct via unit tests |
| BR-067 | Drops all `QN_*` reviewer-scorecard keys | Satisfied by construction — `_build_custom_meta_group` never reads `custom_meta.reviewer_scorecards` | `test_reviewer_scorecards_never_reach_article_xml_br_067` |
| BR-068 | Drops `reviewer-decline-reasons` | Satisfied by construction — never reads `custom_meta.decline_reasons` | `test_decline_reasons_never_reach_article_xml_br_068` |
| BR-069 | Drops `Decision Draft` full-text entries | Satisfied by construction — never reads `custom_meta.decision_drafts` | `test_decision_drafts_never_reach_article_xml_br_069` |
| BR-070 | (Documented) keeps only final `submission-decision` value | **Not implemented as written** — see §4: real evidence (3/3 samples) shows all round values pass through unfiltered; documented as a Business Rule Book inaccuracy, evidence trusted over text | `test_submission_decision_values_pass_through_unfiltered_br_070_evidence` |
| BR-071 | Pruning is a deny-list, not an allow-list | `generator.py::_build_custom_meta_group` (form-answer entries copied unconditionally) | `test_unrecognized_form_answer_keys_pass_through_br_071` |
| BR-072 | Never includes `<body>` | Satisfied by construction — `_generate` never reads `raw_root.find("body")` | `test_output_never_contains_body_br_072`; golden: confirmed absent in 3/3 real samples |
| BR-073 | Filename `<ArticleID>_article.xml` | `generator.py::_generate` (`ArticleXmlDocument.filename`) | `test_filename_matches_br_073_pattern` |
| BR-074 | `dtd-version="1.2"` | `config/article-xml.yaml: dtd_version` | `test_dtd_version_matches_br_074` |
| BR-075 | `QN_` prefix match, not enumerated keys | Satisfied by construction — same as BR-067 (whole category never read) | `test_reviewer_scorecards_never_reach_article_xml_br_067` |

---

## 4. Golden Comparison Report

Ran the full parse → extract → transform → raw.xml → article.xml pipeline against all 3 real reference packages and compared against their real `Output/*.zip` article.xml.

| Difference | Classification | Evidence |
|---|---|---|
| `article-type="Original Study"`, `dtd-version="1.2"` | **identical** | 3/3 exact match |
| No `<body>`, no `<back>` | **identical** | Confirmed absent in all 3 real samples — BR-072 satisfied, not a gap |
| `article-id[@pub-id-type=publisher-id]` | **identical** | 3/3 exact match, including `cs-2025-8827`'s unusual lower-case-with-dashes literal value (verbatim copy, source data as-is) |
| `article-id[@pub-id-type=doi]` | **identical** | 3/3 exact match, incl. `CS-2025-8493_C`'s DOI retaining its `_C`→`C` suffix casing |
| `article-title` | **identical** | 3/3 exact match (copied verbatim via BR-060) |
| DOCTYPE, root attributes, `xmlns:xlink` declaration | **identical** | 3/3 exact match |
| `license-p` boilerplate text + `ext-link/@xlink:href` | **identical** | 3/3 exact match |
| Outer `<license>`'s `license-type`/`xlink:href` attributes | **formatting-only / reference-package inconsistency** | 2/3 real samples carry both attributes on the outer `<license>` element; CS-2025-6808's own reference package carries neither (its `<ext-link>` still has `xlink:href`). This generator applies both unconditionally (BR-064's stated target shape, config-driven) — matching 2/3 exactly and classified as the correct behavior; CS-2025-6808's omission is the inconsistency, not this generator's output. The Business Rule Book's own BR-056/BR-064 entries independently flag pkg-specific inconsistencies in this same area (cross-referencing BR-090/091, which are themselves misnumbered in the current Business Rule Book text — pointing at manifest.xml rules, not article.xml ones — a pre-existing documentation defect, noted here for the next author of that document). |
| `history/date` middle entry (`rev-recd`/`revision`) | **unresolved issue (confirmed upstream defect, out of this milestone's scope)** | All 3 real article.xml packages carry 3 history dates (`received`, a middle revision-type date, `accepted`); this generator's output has only 2 in all 3 cases. Root cause: `transform/coordinator.py`'s `_find_date(article.history_dates, "revised")` looks for a literal `"revised"` date-type that **no real sample uses** — confirmed values are `"rev-recd"` (CS-2025-6808, CS-2025-8493_C) and `"revision"` (cs-2025-8827), reproducing across all 3 samples. This is a Milestone 5B/6A-layer defect (`coordinator.py`), not an article.xml-generation defect — article.xml simply copies whatever `history` raw.xml already produced (BR-060). **Not fixed this milestone**: the user's prerequisite-fix authorization named only the `body_fragment_builder.py` xlink bug; this is flagged here as a priority fix recommendation, not silently patched. |
| custom-meta-group's file-manifest (`figure`/`supplement`/`manuscript`/`tables`/`coverletter`/`responsetoreviewer`/`licencetopublishform`) entries | **unresolved issue (confirmed upstream defect, out of this milestone's scope)** | BR-066's filter logic is verified correct in isolation (unit tests construct a `RoundIndex` with a real `is_latest` round and confirm only that round's entries survive) but is **starved to zero entries on all 3 real samples** — e.g. CS-2025-6808's real article.xml carries ~19 latest-round file entries; this generator's output carries none, only diagnosing "No file-manifest entries found for the latest round." Root cause (already documented against raw.xml in Milestone 6B's own findings, now reconfirmed here against article.xml's real output): `round_resolver.py` produces multiple `RoundInfo` entries mislabeled with the same `"Original"` label instead of distinct round labels, and `custom_meta_classifier.py`'s file-entry round-label parsing produces non-matching labels for real data — so no `FileEntry.round_label` ever equals the resolved "latest" label. A Milestone 4/5B-layer defect; article.xml's own BR-066 implementation cannot compensate for it without silently inventing a different filtering heuristic, which was deliberately avoided. **Not fixed this milestone** — same scope boundary as above. |
| custom-meta-group entries reading `"<X> was changed"` (`PubData`, `Affiliation 1/2/3`, `Figure 1-8`, `Keyword`, `Funding`, `History`, `Author`, `CRediT Authors' Contributions`, `CRediT Author Contribution`, `Uncited online supplementary table/figure N`) | **newly-discovered unresolved issue (out of this milestone's scope)** | Present only in CS-2025-6808's generated output (21 entries), absent from **all 3** real reference packages' article.xml. These read as Kriyadocs editorial-workflow change-tracking flags, not article-level business metadata, yet `FormAnswerBag`'s current classification (Milestone 4/5B) has no category excluding them, so BR-071's deny-list (correctly implemented — every *other* unrecognized key does legitimately pass through in all 3 samples) lets them through too. Evidence base: 1/3 samples only (the other 2 samples' source data does not contain this key pattern at all) — flagged as a confirmed, reproducible defect on the evidence available, with a recommendation to extend the extraction-layer classification (not this generator) before manifest.xml/reviews.xml is built on the same `FormAnswerBag`. **Not fixed this milestone** — same scope boundary as above; discovered during golden verification, documented rather than silently patched. |
| `submission-decision` — all round values pass through, not just the final one | **Business Rule Book inaccuracy, evidence trusted (already-documented pattern, reconfirmed)** | BR-070's text claims only the final decision survives; all 3 real samples' article.xml carry every round's `submission-decision` value unfiltered (confirmed again here: CS-2025-6808's real output carries all 4 values, byte-identical to this generator's output). Implemented as pass-through (BR-071's deny-list, no BR-070-specific filter), matching evidence 3/3. |
| contrib-group/aff structural richness (multi-group source content, `author-comment`, duplicate `xref`s, UUID-prefixed `aff` ids like `aff72cc01a2-...` that survive unstripped because they are cross-reference-load-bearing) | **inherited limitation, already documented against raw.xml (Milestone 6B)** | Copied verbatim from raw.xml per BR-060; not a new article.xml gap. BR-054's `strip_attribute_matching` correctly leaves these ids alone (fullmatch against a bare UUID pattern only — a prefixed value like `aff72cc01a2-5b99-...` never matches), confirmed against real evidence: 0/2 such ids stripped in either real sample that has them, matching this generator's output exactly. |

**None of these differences were silently absorbed** — every one is either asserted against in the golden test suite (where achievable) or explicitly diagnosed at generation time (where not); the 3 confirmed upstream defects are each traced to a specific, named module outside this generator's own code.

---

## 5. Test Report

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 752 passed, 0 failed |
| New tests this milestone | 49 in `tests/unit/generators/article_xml/test_generator.py`; 1 parametrized golden test (3 real-package instances) in `tests/golden/test_article_xml_golden.py`; 7 regression tests in `tests/unit/transform/test_body_fragment_builder.py` (§0); additional tests for the 5 new/moved shared helpers in `tests/unit/generators/xml/test_helpers.py` and `test_builder.py`; 4 new config-loader tests |
| Coverage, new/modified modules | `generators/article_xml/generator.py` 100%, `generators/article_xml/document.py` 100%, `generators/article_xml/__init__.py` 100%, `transform/body_fragment_builder.py` 100%, `generators/xml/helpers.py` 100%, `generators/xml/builder.py` 100%, `generators/raw_xml/generator.py` 100%, `config/schema.py`/`config/loader.py` 100% |
| Overall project coverage | 99% (3,367 statements, 14 missed — all in unimplemented future-milestone stub modules: `manifest_xml`, `reviews_xml`, `transfer_xml`, `orchestrator/run_controller`, `validation`, `packaging`, etc.) |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (222 files) |
| `mypy --strict` | Clean (101 source files) |

Test categories covered per the task's explicit list: DOI generation ✅ (BR-058/059, incl. journal-config-driven prefix), license generation ✅ (BR-063/064/065, incl. the no-license-type-key evidence-based default and an unregistered-`xlink`-prefix degradation path), contributor mapping ✅ (inherited verbatim via BR-060, asserted through golden), metadata filtering ✅ (BR-067/068/069/071 deny-list), custom-meta pruning ✅ (BR-066, incl. the "no entries match latest round" diagnostic branch), DTD transformation ✅ (BR-052/074), article identifiers ✅ (BR-054/058/059), XML ordering ✅ (deterministic generation asserted), namespaces ✅ (BR-055/056, incl. defensive `xlink_uri is None` and missing-`<front>`/missing-`<article-meta>` branches), serialization ✅ (via `XmlDocumentBuilder`, reused unchanged), diagnostics ✅ (every warn/info path unit-tested directly), error handling ✅ (`MissingDoiError`, `LicenseMappingError`, `GeneratorInvariantError` classification). Golden comparison tests use all 3 approved reference packages (§4).

---

## 6. Architecture Compliance Report

- **Dependency direction, empirically verified**: `grep` over `src/meca_engine/generators/article_xml/` shows imports only from `meca_engine.generators.*` (framework, incl. `raw_xml` as a composed collaborator), `meca_engine.config.schema`/`meca_engine.model.*` (type-only), `meca_engine.exceptions`, and stdlib `xml.etree.ElementTree`/`re`. **Zero** imports from `meca_engine.extraction` or `meca_engine.transform`.
- **No extraction/metadata-layer access**: confirmed by the same import check.
- **ICAM immutability**: `ArticleXmlGenerator` never assigns to any `ArticleModel`/`ArticleMeta`/etc. field; every ICAM read is a plain attribute access. The only mutable tree ever modified is this generator's own freshly-built `Element` tree (via `XmlDocumentBuilder`) plus a deep-copied clone of raw.xml's re-parsed tree (`import_subtree`) — never the ICAM, never raw.xml's own in-memory tree.
- **Framework correctly reused**: every element/attribute created via `XmlDocumentBuilder`; every namespace resolved via `NamespaceManager`; lifecycle entirely via `BaseGenerator.generate()`.
- **No duplicated XML helper logic**: the two helper functions this milestone needed that didn't already exist (`parse_document_with_namespaces`, `strip_attribute_matching`, `uses_prefix`, `import_subtree`) were added to the **shared** `generators.xml.helpers`/`builder` modules, and raw.xml's own generator was refactored to consume the same shared `add_custom_meta_entry`/`parse_fragment_with_namespaces` rather than keep a second, private copy — confirmed via `grep`, `generators/article_xml/generator.py` and `generators/raw_xml/generator.py` now both import from the one shared source.
- **No business logic outside the generator**: `article_xml/generator.py` is the only module reading `LicenseTemplatesConfig`, `ArticleTypeMappingConfig`, `ArticleXmlConfig`, or the `_UUID_ID_PATTERN`/BR-054–075 rules; the shared XML helpers remain business-logic-free (confirmed by their own module docstring's stated contract, unchanged this milestone).
- **Configuration usage**: `ArticleXmlConfig`/`LicenseTemplatesConfig`/`ArticleTypeMappingConfig`/`NamespaceConfig` are the only sources of DOCTYPE/DTD-version/encoding/license-boilerplate/article-type-mapping/namespace values — `grep` for BR-052's DOCTYPE string and BR-074's `"1.2"` confirms both appear only in `config/article-xml.yaml` and its test fixtures, never as a literal inside `generator.py` (the one exception, `_UUID_ID_PATTERN`'s regex and `_XLINK_STRIPPED_ATTRIBUTES`'s two attribute names, are structural constants describing *which* attributes to strip, not a business value like a DOI prefix or license text).

---

## 7. Performance Report

Measured directly against all 3 real reference packages (Apple silicon, single process, no parallelism; `generate()` time includes the composed `RawXmlGenerator.generate()` call it wraps):

| Article | ICAM build time | article.xml generation time (incl. raw.xml) | Output size | Real article.xml size | Peak memory (generate only) |
|---|---|---|---|---|---|
| CS-2025-6808 | 402.6 ms | 90.8 ms | 20,286 bytes | 33,296 bytes | 12.7 MB |
| CS-2025-8493_C | 337.4 ms | 56.0 ms | 16,727 bytes | 27,978 bytes | 8.6 MB |
| cs-2025-8827 | 169.0 ms | 40.7 ms | 13,521 bytes | 28,080 bytes | 5.8 MB |

Generation time remains a small fraction of ICAM-build time, consistent with Milestone 6B's own finding — the generator (now two generators, composed) is still not the pipeline's bottleneck. Output size is smaller than the real reference size for all 3 samples, entirely attributable to the two confirmed upstream gaps in §4 (missing history middle-date, missing file-manifest entries) and the newly-found "was changed" entries being article-only to CS-2025-6808 in the *opposite* direction (adds ~21 entries there) — not to any inefficiency in this generator's own logic.

**Memory**: peak allocation during `generate()` (which includes the composed raw.xml build) scales with document size (12.7 MB for the largest sample down to 5.8 MB for the smallest) — consistent with Milestone 6B's own observation that `XmlDocumentBuilder.serialize()`'s internal deep-clone dominates. No new allocation pattern introduced by this generator itself beyond one additional `import_subtree` deep-copy per copied section and one `parse_document_with_namespaces` reparse of raw.xml's own output — acceptable at this document scale (tens of KB, thousands of elements).

**Observations only, no optimization performed** — no actual performance issue identified at this scale.

---

## 8. Readiness Assessment

**Ready to begin manifest.xml — with 3 pre-existing/newly-confirmed defects flagged for resolution before or alongside it, none of them blocking:**

1. **`coordinator.py`'s history middle-date mismatch** (§4) — confirmed across all 3 samples now (previously suspected from 1). Low structural risk to fix (one literal string comparison), but out of this milestone's authorized scope.
2. **`round_resolver.py`/`custom_meta_classifier.py`'s round-label defect** (§4) — directly relevant to manifest.xml, which will need the *same* `RoundInfo`/`FileEntry.round_label` data to build per-round file listings; recommend prioritizing this fix **before** manifest.xml work begins, since manifest.xml cannot correctly enumerate "latest round" files any better than article.xml could here.
3. **`FormAnswerBag`'s missing "workflow change-tracking" exclusion category** (§4, newly discovered this milestone) — lower priority (affects only entries not needed by manifest.xml/reviews.xml/transfer.xml as currently scoped), but worth tracking since it currently only manifests on 1/3 samples and may generalize.

None of the 3 block starting manifest.xml — all are narrow, already-diagnosed (never silently absorbed), and isolated to specific upstream fields. The Business Transformation Decision Log (`22_BUSINESS_TRANSFORMATION_DECISION_LOG.md`) captures every transformation this milestone made, intended to remove re-analysis work from manifest.xml/reviews.xml/transfer.xml wherever they touch the same ICAM fields (DOI, license, custom-meta pruning, round filtering).

**Waiting for approval before starting the manifest.xml Generator.**
