# Milestone 6G — transfer.xml Generator Report

Implements `TransferXmlGenerator(BaseGenerator[TransferXmlDocument])` —
the fifth and final XML generator, completing the entire XML generation
layer. Built exclusively on the Milestone 6A framework, per
11_LLD_02_CANONICAL_MODEL_AND_CLASSES.md §4.7's minimal description:
"Emit BR-126–140 exactly, using config for provider names/acronym and
the ICAM's primary corresponding email." No Package Builder, ZIP
packaging, checksum generation, or S3 publishing.

This is, by a wide margin, **the most mechanically-derivable of the 5
generators** — the Business Rule Book classifies 13 of BR-126–140's 15
rules as "Confirmed" (vs. reviews.xml's ~10 of 30, most of which turned
out unsatisfiable against the current ICAM). Only one rule (BR-133/135,
the journal acronym) is a genuine, already-flagged ambiguity (ADR-007).

---

## 1. Directory Tree Changes

```
config/
  transfer-xml.yaml                             # NEW — BR-126/127/136/137/138/139 constants

schemas/config-schema/
  transfer-xml.schema.json                      # NEW

meca-engine/
  src/meca_engine/
    config/
      schema.py                                 # MODIFIED — TransferXmlConfig (new)
      loader.py                                  # MODIFIED — load_transfer_xml_config (new)
    generators/
      transfer_xml/
        __init__.py                              # MODIFIED — pre-existing Milestone-1 stub now exports real types
        document.py                              # NEW — TransferXmlDocument
        generator.py                              # NEW — TransferXmlGenerator
  tests/
    fixtures/config/transfer-xml.yaml            # NEW
    fixtures/config/invalid/transfer-xml_missing_field.yaml  # NEW
    unit/config/test_loader.py                   # MODIFIED (+2 tests)
    unit/generators/transfer_xml/
      __init__.py                                # NEW (empty)
      conftest.py                                # NEW — rich/empty ArticleModel fixtures
      test_generator.py                          # NEW — 32 tests
    golden/
      test_transfer_xml_golden.py                # NEW — 1 parametrized test, 3 real-package instances

30_MILESTONE_6G_TRANSFER_XML_GENERATOR_REPORT.md  # NEW — this report
29_TRANSFER_DECISION_LOG.md                       # NEW — separately-requested artifact
```

No file was deleted. No `Input/`/`Output/`/`golden_baseline` source zip
was touched. No prior generator (`raw_xml`/`article_xml`/`manifest_xml`/
`reviews_xml`) was modified — confirmed via `grep`.

---

## 2. TransferXmlGenerator Design

**Architecture**: implements only `_generate(context) -> TransferXmlDocument` and `generator_name`. Per this milestone's explicit "no other generator" boundary, the constructor takes only `namespace_manager: NamespaceManager` and `transfer_xml_config: TransferXmlConfig` — no composition with any other generator, matching manifest.xml's/reviews.xml's own precedent. Per 10_LLD_01's package tree, `transfer_xml/` needs no separate builder module (unlike `reviews_xml/`'s `review_builder.py`/`decision_builder.py`) — the whole document is small and flat enough that `generator.py`'s own small, BR-labeled private methods (`_build_transfer_source`, `_build_destination`, `_build_processing_instructions`) are sufficient without a second file.

**BR-127's no-encoding XML declaration** reuses an already-existing `XmlDocumentBuilder.serialize(encoding=None)` capability (added in Milestone 6A specifically for "a document with no declared encoding" per its own docstring) — transfer.xml is the first generator to actually need it.

**BR-129/131's always-empty elements** (`<surname/>`, `<given-names/>`, `<phone/>`) are created via `builder.create_element(parent, tag)` with no `text` argument — the element is always *present* (never omitted, unlike `add_optional_element`'s "skip if absent" semantics used elsewhere), just always empty. This is a deliberate, evidence-matched distinction: BR-129/131 describe elements that exist in every real sample with empty content, not elements that are sometimes absent.

**ADR-007 (journal acronym)**: rather than hard-coding either observed value (`"CLINSCI"` or `"CS"`) or guessing a derivation rule, this generator reads `context.journal_config.acronym` — an already-existing field, already citing ADR-007 in its own docstring, populated (in a real deployment) via ADR-007's own recommended fallback: an external per-journal configuration table. No new config surface was needed.

**BR-130's "primary corresponding email"** is read directly as `article_meta.corresponding_emails[0].email` — the ICAM's own already-documented contract (`ArticleMeta.corresponding_emails`'s docstring: "index 0 is the primary corresponding email... this model only holds the already-ordered result"). This generator does **not** re-implement or second-guess that ordering (Milestone 5B's job, per the docstring) — see §4 for a newly-discovered discrepancy this reliance surfaced, and the Transfer Decision Log for why it was not "fixed" here.

**Section-header comments** (`<!-- ======== SOURCE ======== -->` etc.) are emitted via the already-existing `XmlDocumentBuilder.add_comment`, matching all 3 real samples' own cosmetic section headers exactly — a zero-risk, evidence-matched fidelity improvement using an already-approved framework method.

---

## 3. Field Mapping Matrix

| ICAM / Config Field | transfer.xml Element | Business Rule | Test Case |
|---|---|---|---|
| — (constant) | DOCTYPE | BR-126 | `test_doctype_matches_br_126` |
| — (constant, `encoding=None`) | XML declaration | BR-127 | `test_xml_declaration_has_no_encoding_attribute_br_127` |
| `PublisherConfig.provider_name` | `transfer-source/service-provider/provider-name` | BR-128 | `test_source_provider_name_matches_br_128` |
| — (always empty) | `transfer-source/.../contact-name/surname`, `/given-names` | BR-129 | `test_source_contact_name_is_always_empty_br_129` |
| `ArticleMeta.corresponding_emails[0].email` | `transfer-source/service-provider/contact/email` **and** `transfer-source/publication/contact/email` | BR-130 | `test_source_and_publication_contact_email_matches_corresponding_author_br_130` |
| — (always empty) | `transfer-source/service-provider/contact/phone` | BR-131 | `test_source_contact_phone_is_always_empty_br_131` |
| `JournalMeta.journal_title` | `transfer-source/publication/publication-title` (and mirrored under `destination`) | BR-132 | `test_publication_title_matches_journal_title_br_132` |
| `JournalConfig.acronym` | `transfer-source/publication/acronym` (and mirrored under `destination`) | BR-133/135 | `test_publication_acronym_comes_from_journal_config_br_133` |
| `PublisherConfig.destination_provider_name` | `destination/service-provider/provider-name` | BR-134 | `test_destination_provider_name_matches_br_134` |
| `ArticleIdentity.publisher_id_value` (×2, joined) | `destination/security/authentication-code` | BR-136 | `test_authentication_code_matches_br_136` |
| `TransferXmlConfig.processing_instructions` | `processing-instructions/processing-instruction` ×2 | BR-137 | `test_processing_instructions_matches_br_137` |
| `TransferXmlConfig.processing_comments_template` + `ArticleIdentity.article_id` | `processing-instructions/processing-comments` | BR-138 | `test_processing_comments_matches_br_138` |
| `ArticleIdentity.article_id` | output filename | BR-139 | `test_filename_matches_br_139_pattern` |
| — (satisfied by construction: no round-scoped field read) | (content invariance) | BR-140 | `test_output_never_references_rounds_or_custom_meta` |

---

## 4. Business Rule Traceability

| BR | Rule | Status | Evidence |
|---|---|---|---|
| BR-126 | NISO MECA Transfer DTD v1.0 | **Implemented, evidence-backed** | 3/3 exact DOCTYPE match |
| BR-127 | No `encoding=` in XML declaration | **Implemented, evidence-backed** | 3/3; the one output type that omits it, confirmed via direct byte inspection |
| BR-128 | `transfer-source/service-provider/provider-name` = `"Portland Press Limited"` | **Implemented, config-driven** | 3/3; sourced from `PublisherConfig.provider_name`, never hard-coded |
| BR-129 | Source contact name fields always empty | **Implemented, evidence-backed** | 3/3 |
| BR-130 | Source/publication contact email = corresponding-author email | **Implemented, evidence-backed** | 3/3 (with one newly-discovered ordering caveat — see §5) |
| BR-131 | Source contact phone always empty | **Implemented, evidence-backed** | 3/3 |
| BR-132 | `publication-title` = `journal-meta/journal-title` | **Implemented, evidence-backed** | 3/3 |
| BR-133 | `publication/acronym` — ADR-007 ambiguity | **Implemented via config, ambiguity not resolved (by design)** | 2/3 samples use `"CLINSCI"` (unrepresented in source data anywhere); 1/3 uses `"CS"` — `JournalConfig.acronym` is read verbatim, per-journal, never guessed |
| BR-134 | `destination/service-provider/provider-name` = `"Silverchair"` | **Implemented, config-driven** | 3/3; sourced from `PublisherConfig.destination_provider_name` |
| BR-135 | Destination publication mirrors source | **Implemented, evidence-backed** | 3/3; same acronym-ambiguity caveat as BR-133 |
| BR-136 | `authentication-code` = `"<publisher-id>\|<publisher-id>"` | **Implemented, evidence-backed** | 3/3 exact match, incl. `cs-2025-8827`'s unusual lower-case-with-dashes literal value |
| BR-137 | Exactly 2 fixed processing steps | **Implemented, config-driven** | 3/3 exact match |
| BR-138 | `processing-comments` template referencing raw.xml filename | **Implemented, config-driven** | 3/3 match (case-insensitive — see §5's `article_id` casing note) |
| BR-139 | Filename `<ArticleID>_transfer.xml` | **Implemented, evidence-backed** | 3/3 pattern match |
| BR-140 | Content never varies by round | **Implemented, satisfied by construction** | This module never reads `model.rounds`/`model.custom_meta` at all |

---

## 5. Golden Comparison Report

Ran the full parse → extract → transform → generate pipeline against all 3 real reference packages and compared against their real `Output/*.zip` transfer.xml.

| Difference | Classification | Evidence |
|---|---|---|
| Root tag, `transfer-version`, DOCTYPE, provider names, publication title, authentication-code, processing instructions | **identical** | 3/3 exact match on every field, verified programmatically in the golden test (not sampled) |
| Journal acronym value | **configuration difference (ADR-007, unresolved by design)** | This generator's output matches real evidence when the real per-sample value is supplied as `JournalConfig.acronym` (the golden test does this deliberately, as any real deployment would); the generator itself never derives or guesses the value — see §4 |
| Corresponding-author email (CS-2025-8493_C only) | **confirmed, newly-discovered ICAM-ordering discrepancy — not a transfer.xml defect** | CS-2025-8493_C's ICAM has 2 corresponding emails (`ld454@cam.ac.uk`, `seo10@cam.ac.uk`); this generator correctly and deterministically uses index 0 per `ArticleMeta.corresponding_emails`'s own documented "primary" contract, but the real reference package's transfer.xml uses the *second* one instead. `CS-2025-6808` and `cs-2025-8827` (each with exactly 1 corresponding email) match exactly. This is a Milestone 5B (`contributor_transformer.py`) ordering question, out of this milestone's "no transformation-layer access" scope to investigate further or fix — flagged in the Transfer Decision Log |
| `processing-comments`'s `article_id` casing (CS-2025-6808 only) | **source-data limitation, already documented** | Same already-known casing quirk first documented in the Milestone 6D report (`CS-2025-6808`'s real Output package lower-cases `article_id` in every generated filename despite its own mixed-case Input folder name) — not new to this generator; golden test compares case-insensitively for this one field on this one sample, consistent with how the Milestone 6D/6E reports already handle it |
| Line endings (CRLF in the real file vs. LF from `XmlDocumentBuilder`) | **formatting-only, framework limitation** | Same already-documented `XmlDocumentBuilder` limitation noted in every prior generator's report — not re-verified byte-for-byte, consistent with that same, already-accepted framework constraint |
| Section-header comments (`<!-- ======== SOURCE ======== -->` etc.) | **identical** | This generator replicates them exactly via `XmlDocumentBuilder.add_comment`, matching all 3 real samples |

**None of these differences were silently absorbed.** This is the cleanest golden comparison of the 5 generators — only one truly new finding (the corresponding-email ordering discrepancy), and it is squarely a Milestone 5B question, not a transfer.xml one.

---

## 6. Test Report

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 895 passed, 0 failed |
| New tests this milestone | 32 in `tests/unit/generators/transfer_xml/test_generator.py`; 1 parametrized golden test (3 real-package instances) in `tests/golden/test_transfer_xml_golden.py`; 2 new config-loader tests |
| Coverage, new modules | `generators/transfer_xml/generator.py` 100%, `document.py` 100%, `__init__.py` 100%, `config/schema.py`/`config/loader.py` 100% |
| Overall project coverage | 99% (3,807 statements, 11 missed — all in unimplemented future-milestone stub modules: `orchestrator/run_controller`, `validation`, `packaging`, etc.) |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (246 files) |
| `mypy --strict` | Clean (111 source files) |

Test categories covered per the task's explicit list: transfer generation ✅ (every field, both source and destination), configuration loading ✅ (loader round-trip + schema-violation tests), namespace handling ✅ (default namespace resolution + unregistered-namespace defensive branch), diagnostics ✅ (every "missing X" / "unsupported transfer value" path directly unit-tested), serialization ✅ (via `XmlDocumentBuilder`, reused unchanged; no-encoding declaration and 2-space indentation confirmed), malformed ICAM ✅ (`empty_context` — no email, no publisher-id, no journal title, no acronym, all diagnosed simultaneously), missing configuration ✅ (empty `provider_name`/`destination_provider_name`/`acronym`, each independently tested), defensive branches ✅ (unregistered namespace → `GeneratorInvariantError`; misconfigured `processing_instructions` count → diagnosed). Golden comparison tests use all 3 approved reference packages (§5).

---

## 7. Architecture Compliance Report

- **No reverse-layer imports**: `grep` over `src/meca_engine/generators/transfer_xml/` shows imports only from `meca_engine.generators.*` (framework), `meca_engine.config.schema`/`meca_engine.model.*` (type-only), `meca_engine.exceptions`, and stdlib. **Zero** imports from `meca_engine.extraction` or `meca_engine.transform`.
- **No other-generator dependency**: confirmed — the constructor takes only config + `NamespaceManager`, matching manifest.xml's/reviews.xml's precedent exactly; the sibling raw.xml filename it references (BR-138) is built from `TransferXmlConfig.raw_xml_filename_pattern`, never by calling `RawXmlGenerator`.
- **Generator Framework fully reused**: every element/attribute via `XmlDocumentBuilder.create_root`/`.create_element`/`.add_comment`; the namespace resolved via `NamespaceManager.uri_for`; the shared `xml.helpers.add_optional_element` is reused (not re-implemented) for the one genuinely-optional element (`processing-comments`); lifecycle entirely via `BaseGenerator.generate()`.
- **No duplicated XML helper logic**: confirmed via `grep` — no second copy of any structural pattern already defined in `generators.xml.builder`/`generators.xml.helpers` exists in this package.
- **Configuration-driven implementation**: `TransferXmlConfig`/`JournalConfig`/`PublisherConfig`/`NamespaceConfig` are the only sources of every varying value named in this milestone's explicit "do not hard-code" list (publisher names, journal names, Silverchair/Portland Press values, transfer identifiers, organization names, namespaces, version numbers) — `grep` for `"Portland Press Limited"`, `"Silverchair"`, `"CLINSCI"`, and `"1.0"` confirms none appear as a literal anywhere in `generator.py`; every one comes from an injected config object.
- **ICAM immutability preserved**: `TransferXmlGenerator` never assigns to any `ArticleModel`/`ArticleMeta`/etc. field; every ICAM read is a plain attribute access.
- **Validation hook interfaces**: no `DtdValidationHook`/`SchemaValidationHook`/`BusinessRuleValidationHook` implementation was added — confirmed via `grep`, this generator uses `DiagnosticsCollector` exclusively (the same pattern all 4 prior generators use), consistent with this milestone's explicit "use the existing validation hook interfaces only; do not implement validation rules" instruction (there is nothing new to wire in — those interfaces remain unwired stubs for the future `ValidationEngine` milestone).

---

## 8. Performance Report

Measured directly against all 3 real reference packages (Apple silicon, single process, no parallelism):

| Article | ICAM build time | transfer.xml generation time | Output size | Peak memory (generate only) | Diagnostics |
|---|---|---|---|---|---|
| CS-2025-6808 | 405.2 ms | 0.27 ms | 1,653 bytes | 37.0 KB | 0 |
| CS-2025-8493_C | 326.1 ms | 0.27 ms | 1,637 bytes | 22.9 KB | 0 |
| cs-2025-8827 | 194.3 ms | 0.27 ms | 1,629 bytes | 21.0 KB | 0 |

**The fastest and smallest-footprint generator of the 5** — no composed-generator overhead, no round/file iteration, no per-reviewer content, just a fixed, small tree with a handful of substituted values. 0 diagnostics on every real sample confirms all required fields are populated for all 3 reference packages today.

**Scalability observation**: `_generate` is `O(1)` in every dimension relevant to a MECA package (it never iterates rounds, files, reviewers, or contributors) — its only loop is over `TransferXmlConfig.processing_instructions` (a fixed, small, config-defined list). No algorithmic concern exists at any scale.

**Observations only, no optimization performed** — no actual performance issue identified.

---

## 9. Generator Suite Readiness

All 5 XML generators (raw.xml, article.xml, manifest.xml, reviews.xml, transfer.xml) are now implemented, individually golden-tested against all 3 real reference packages, and hold ≥99% overall / 100% new-module coverage with clean ruff/mypy. Cross-generator findings accumulated across Milestones 6B–6G, relevant to a consolidated review:

1. **`RoundInfo.label`/physical-round-folder semantic mismatch** (Milestone 6E §1.4/§8) — now confirmed to affect **3 of 5** generators (article.xml's BR-066, manifest.xml's file ordering, reviews.xml's BR-123 chronology). `raw.xml` and `transfer.xml` are unaffected (neither reads round data at all — `raw.xml` copies everything verbatim, `transfer.xml` is round-invariant by BR-140).
2. **The `article_id` casing inconsistency** (CS-2025-6808 only, first found in Milestone 6D) — now confirmed present in **manifest.xml's fixed-item hrefs and transfer.xml's `processing-comments`** (both reference sibling filenames built from `article_id`); very likely also latent in raw.xml's/article.xml's own `filename` properties (BR-048/BR-073), never directly asserted in either of those generators' golden tests.
3. **The corresponding-author-email ordering discrepancy** (CS-2025-8493_C only, newly found this milestone) — a Milestone 5B question, first surfaced by transfer.xml's BR-130 because no prior generator singles out "the primary" corresponding email the way transfer.xml does.
4. **ADR-007 (journal acronym)** remains the single highest-priority unresolved business ambiguity across the whole XML generation layer — explicitly flagged "Business Confirmation Required: Yes — highest priority" in the Business Rule Book itself, and now the one clearly-identified blocker to claiming full transfer.xml correctness at production scale.
5. **The `"CDATA"` `review-type` defect** (reviews.xml, Milestone 6F) confirmed in 2 of 3 real packages, refining BR-099's own "pkg1-only" text.

**The XML generation subsystem is structurally ready for Package Assembly** — every generator is deterministic, evidence-backed, and independently verified. However, per your own recommendation (stated at the end of Milestone 6F), a **Generator Suite Review** — validating all 5 generators together against the 3 reference packages as one consolidated pass — is strongly advisable before Package Assembly begins, specifically to:
- Decide whether findings #1–#3 above warrant a coordinated fix (likely requiring business input, per ADR-013/ADR-007's own stated need for confirmation) before packaging depends on their outputs being cross-consistent.
- Confirm no generator's diagnosed-but-not-fixed gap (e.g. reviews.xml's structurally-ready-but-never-exercised `WorkflowLog` paths) creates an unexpected inconsistency once all 5 documents sit side-by-side in one package.

**Waiting for approval before starting Package Assembly.**
