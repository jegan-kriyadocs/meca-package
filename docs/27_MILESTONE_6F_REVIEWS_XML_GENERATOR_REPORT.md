# Milestone 6F — reviews.xml Generator Report

Implements `ReviewsXmlGenerator(BaseGenerator[ReviewsXmlDocument])` —
the fourth production generator and, per 11_LLD_02_CANONICAL_MODEL_AND_CLASSES.md
§4.7's own description, "the most complex generator." Built exclusively
on the Milestone 6A framework, per the LLD's prescribed
`generators/reviews_xml/{generator.py, review_builder.py,
decision_builder.py}` package layout (10_LLD_01 §2, previously unbuilt).
No transfer.xml, Package Builder, or Validation Engine.

---

## 0. The Central Finding This Milestone Is Built Around

Before any design decision below makes sense, one fact must be stated
plainly: **direct inspection of all 3 real reference packages' own
`reviews.xml` shows their richest content was manually curated by a
human reading raw correspondence logs — not mechanically derived from
any ICAM field that exists today.** Per-reviewer recommendation text
("Send for minor revisions"), author/confidential comment splits,
editor identity, every date, and multi-point screening-checklist splits
all appear in the real files, but the corresponding ICAM fields
(`ReviewerScorecard.overall_recommendation`/`.assigned_date`/`.due_date`/
`.submitted_date`, `DecisionDraft.editor_name`/`.associate_editor_name`/
`.decision_date`, and `WorkflowLog.events` in its entirety) are
**confirmed always `None`/empty on all 3 real samples** — verified by
direct inspection of `golden_baseline/*/03_icam.json`, not assumed.

Per this milestone's explicit "never fabricate missing history" / "if
information is incomplete: emit diagnostics... never synthesize
workflow history" instructions, this generator renders only what the
ICAM actually carries, and diagnoses every gap rather than parsing
recommendation/editor/date facts out of free text (which would require
inventing unapproved extraction logic — exactly what the task
prohibits). The Reviews Decision Log (`28_REVIEWS_DECISION_LOG.md`)
records the full evidence trail behind every judgment call this finding
forces; this report's §3/§4 summarize the resulting, narrower-than-the-
full-Business-Rule-Book implementation scope.

---

## 1. Directory Tree Changes

```
config/
  reviews-xml.yaml                              # NEW — BR-096/097/100/101/120/122 constants

schemas/config-schema/
  reviews-xml.schema.json                       # NEW

meca-engine/
  src/meca_engine/
    config/
      schema.py                                 # MODIFIED — ReviewsXmlConfig (new)
      loader.py                                 # MODIFIED — load_reviews_xml_config (new)
    generators/
      reviews_xml/
        __init__.py                             # MODIFIED — pre-existing Milestone-1 stub now exports real types
        document.py                             # NEW — ReviewsXmlDocument
        generator.py                            # NEW — ReviewsXmlGenerator + block ordering
        review_builder.py                       # NEW — review-type="review" blocks (scorecards, declines, extended history)
        decision_builder.py                     # NEW — review-type="decision" blocks
  tests/
    fixtures/config/reviews-xml.yaml            # NEW
    fixtures/config/invalid/reviews-xml_missing_field.yaml  # NEW
    unit/config/test_loader.py                  # MODIFIED (+2 tests)
    unit/generators/reviews_xml/
      __init__.py                               # NEW (empty)
      conftest.py                               # NEW — rich/empty ArticleModel fixtures
      test_generator.py                         # NEW — 18 tests
      test_review_builder.py                    # NEW — 15 tests
      test_decision_builder.py                  # NEW — 8 tests
    golden/
      test_reviews_xml_golden.py                # NEW — 1 parametrized test, 3 real-package instances

27_MILESTONE_6F_REVIEWS_XML_GENERATOR_REPORT.md  # NEW — this report
28_REVIEWS_DECISION_LOG.md                       # NEW — separately-requested artifact
```

No file was deleted. No `Input/`/`Output/`/`golden_baseline` source zip
was touched. No generator built in a prior milestone
(`raw_xml`/`article_xml`/`manifest_xml`) was modified — confirmed via
`grep`.

---

## 2. ReviewsXmlGenerator Design

**Architecture**: `ReviewsXmlGenerator(BaseGenerator[ReviewsXmlDocument])` implements only `_generate(context) -> ReviewsXmlDocument` and `generator_name`. The constructor takes `namespace_manager: NamespaceManager` and `reviews_xml_config: ReviewsXmlConfig` only — per this milestone's explicit "no other generator" boundary (unlike article.xml's BR-051-mandated composition), matching manifest.xml's precedent exactly.

**Delegation to `review_builder`/`decision_builder`**, per the LLD's own prescribed structure (10_LLD_01 §2, 11_LLD_02 §4.7 — the first milestone to actually populate these 2 previously-empty-stub sibling files): `_generate` calls `review_builder.build_scorecard_reviews`/`.build_decline_reviews`/`.build_extended_history_reviews` and `decision_builder.build_decision_reviews`, then orders every produced `<review>` element by round (BR-123) before appending to the document root. No business logic lives in `generator.py` itself beyond namespace/DOCTYPE/root construction and ordering.

**Shared helpers, not duplicated**: `review_builder.add_review_item`/`.add_reviews_contrib` (the `<review-item-question>`/`<review-item-response>`/`<review-item-data>` shape, and the `<contrib-group>`/`<string-name>`/`<email>` shape) are used by **both** builder modules — `decision_builder.py` imports them directly rather than re-implementing the same structural pattern, confirmed via `grep` (no second copy of either shape exists anywhere in the tree).

**`<string-name>`, not a structured name split**: `ReviewerScorecard.reviewer_name`/`DeclineReason.reviewer_name`/`DecisionDraft.editor_name` are all single, raw, unsplit strings (e.g. `"Pu-Hong Zhang (Reviewer)"`) — never pre-split into surname/given-names components. Rather than inventing name-parsing logic, this generator reuses `raw_xml/generator.py`'s own established pattern for exactly this situation (`Contributor.full_name_raw` → `<string-name>`), confirmed via direct inspection of that generator's code before writing this one.

**Round resolution reuses Milestone 6E's `RoundIndex` unchanged**: per this milestone's explicit "use the corrected transformation output from Milestone 6E; do not introduce additional round inference" instruction, `_order_blocks` matches a block's `review-version` attribute against `RoundInfo.label` by exact string equality only — the same mechanism (and the same already-documented limitation: `RoundInfo.label` is confirmed always `"Original"` on all 3 real samples, per Milestone 6E §1.4/§8) already used by `manifest_xml`'s file-round matching. No new heuristic was written.

**Forward-compatible, feature-flag-gated extended scope**: `review_builder.build_extended_history_reviews` implements ADR-004 (duplicate correspondence, BR-116) and ADR-005 (extended scope: BR-108/111/117-119) by iterating `WorkflowLog.events`, gated by the already-existing `FeatureFlagsConfig.reviews_include_duplicate_correspondence`/`.reviews_extended_history_scope` flags. Since `WorkflowLog.events` is confirmed empty on all 3 real samples, this function never activates against real data today — it is exercised entirely by synthetic fixtures, following the exact precedent ADR-013 already established ("implement generically now, validate against a synthetic/manufactured fixture as an interim substitute for real evidence").

---

## 3. Business Rule Traceability

| BR | Rule | Code Module | Test Coverage | Status |
|---|---|---|---|---|
| BR-096 | NISO MECA Reviews DTD v1.0, default namespace | `generator.py::_generate` (`DoctypeDeclaration`, `_require_uri`) | `test_doctype_matches_br_096`, `test_root_declares_default_xlink_and_ali_namespaces_br_096`; golden: exact match 3/3 | **Implemented, evidence-backed** |
| BR-097 | `content-version="1.0"` | `generator.py::_generate` | `test_content_version_matches_br_097`; golden: exact match 3/3 | **Implemented, evidence-backed** |
| BR-098 | Canonical `review-version`/`blinding`/`permission-to-publish`/`permission-to-transfer` on every `review-type="review"` | `review_builder.py` (all 3 review-producing functions) | `test_completed_scorecard_produces_a_review_block` etc. | **Implemented** — canonical (2/3) target shape; CS-2025-6808's own reference package omits it, a confirmed, documented, non-replicated defect per BR-098's own text |
| BR-099 | `review-type` ∈ `{review, decision}` only, never `"CDATA"` | Satisfied by construction — no code path ever writes any other literal | `test_generated_types <= {"review", "decision"}` (golden) | **Implemented, evidence-backed** — see §4's refined evidence: the defect is confirmed in **2 of 3** samples, not just CS-2025-6808 as BR-099's text implies |
| BR-100 | `blinding="single"` | `config/reviews-xml.yaml: blinding` | `test_completed_scorecard_produces_a_review_block` | **Implemented, evidence-backed** |
| BR-101 | `permission-to-publish`/`permission-to-transfer="yes"` | `config/reviews-xml.yaml` | Same | **Implemented, evidence-backed** |
| BR-102 | One `review-type="review"` per (reviewer × round), regardless of outcome | `review_builder.build_scorecard_reviews` + `.build_decline_reviews` (union) | `test_completed_scorecard_produces_a_review_block`, `test_decline_reason_produces_a_status_only_review` | **Implemented, evidence-backed** |
| BR-103 | Completed review always has a `recommendation` item | `review_builder.build_scorecard_reviews` | `test_missing_overall_recommendation_is_diagnosed` / `test_populated_overall_recommendation_suppresses_the_missing_diagnostic` | **Structurally supported, never populated by real data** — `overall_recommendation` confirmed `None` 3/3; diagnosed, never fabricated |
| BR-104 | Author-facing vs. editor-confidential comment split | — | — | **Not implementable** — no ICAM field distinguishes channel; `ReviewerScorecard.answers` is a single undifferentiated Q&A list |
| BR-105 | "Same as author" confidential-comment placeholder | — | — | **Not applicable** — no confidential-comment field exists to ever equal this placeholder |
| BR-106 | Declined/terminated → single status-only item, no fabricated content | `review_builder.build_decline_reviews`, `._build_status_only_review` | `test_decline_reason_produces_a_status_only_review`, `test_non_completed_outcome_status_renders_as_status_only` | **Implemented, evidence-backed** |
| BR-107 | Status wording from source, not a fixed enum string | `review_builder._build_status_only_review` (uses `reason_text`/`outcome_status.value` verbatim) | Same | **Implemented, evidence-backed** — deliberately does not attempt to distinguish "declined" vs. "terminated" wording (BR-106/125's own "never guess" instruction; `DeclineReason` carries no such distinction) |
| BR-108 | File-attachment review → `review-item[type=file]` + `ext-link` | `review_builder.build_extended_history_reviews` (`event.attachment_url`) | `test_attachment_url_produces_an_ext_link_br_108` | **Structurally supported, never populated by real data** — `WorkflowLog.events` always empty |
| BR-109 | One `review-type="decision"` per round | `decision_builder.build_decision_reviews` | `test_decision_draft_produces_a_decision_review` | **Implemented, evidence-backed** |
| BR-110 | Decision item combines generated summary + decision-letter text | `decision_builder.build_decision_reviews` (`decision_text` verbatim only) | `test_missing_editor_identity_is_diagnosed` | **Partially implemented** — decision-letter text is included verbatim (real ICAM field); the generated summary sentence is never synthesized (would require parsing editor identity/outcome out of free text) |
| BR-111 | Multi-point screening checklist split into one item per point | `review_builder.build_extended_history_reviews` (`CorrespondenceKind.SCREENING_QUERY`) | `test_extended_scope_events_gated_by_extended_history_flag` | **Structurally supported, never populated by real data** |
| BR-112 | Reviewer/editor identity always name + email | `review_builder.add_reviews_contrib` | `test_completed_scorecard_produces_a_review_block` (email present); `test_decline_reason_produces_a_status_only_review` (email absent, diagnosed) | **Partially implemented** — `ReviewerScorecard` has both; `DeclineReason`/`DecisionDraft` have no email field at all |
| BR-113 | `contrib-type` ∈ `{reviewer, editor, associate-editor}` | `review_builder.add_reviews_contrib` (`"reviewer"`), `decision_builder.build_decision_reviews` (`"editor"`/`"associate-editor"`, only when a name exists) | `test_populated_editor_name_produces_editor_contrib_and_suppresses_diagnostic` | **Implemented** — editor/associate-editor contribs are only emitted when a real name is available (never fabricated); on all 3 real samples this is always absent, so no editor/associate-editor contrib is ever emitted today |
| BR-114 | `assigned`/`due`/`submitted` dates present where applicable | — | — | **Not implementable** — all 3 date fields confirmed always `None`; no `<date>` element is ever emitted (never fabricated) |
| BR-115 | Cross-file date consistency with article.xml/raw.xml history | — | — | **Not applicable** — no dates are ever emitted to be inconsistent |
| BR-116 | Duplicate correspondence-log entry alongside a formal review | `review_builder.build_extended_history_reviews` (`CorrespondenceKind.REVIEW_COMMENT`, gated by `reviews_include_duplicate_correspondence`, ADR-004) | `test_duplicate_correspondence_included_when_flag_enabled` / `..._excluded_when_flag_disabled` | **Structurally supported, never populated by real data** |
| BR-117 | Author-suggested reviewers | `review_builder.build_extended_history_reviews` (`CorrespondenceKind.AUTHOR_SUGGESTED_REVIEWER`, gated by `reviews_extended_history_scope`, ADR-005) | `test_extended_scope_events_gated_by_extended_history_flag` | **Structurally supported, never populated by real data** |
| BR-118 | Editor (re-)assignment history | `review_builder.build_extended_history_reviews` (`CorrespondenceKind.EDITOR_REASSIGNMENT`) | Same | **Structurally supported, never populated by real data** |
| BR-119 | Post-acceptance copyediting/production queries | `review_builder.build_extended_history_reviews` (`CorrespondenceKind.PRODUCTION_QUERY`) | Same | **Structurally supported, never populated by real data** |
| BR-120 | Encoding `UTF-8` (upper-case) | `config/reviews-xml.yaml: encoding` | `test_xml_declaration_matches_br_120` | **Implemented, evidence-backed** |
| BR-121 | Never a byte-order mark | Satisfied by construction — `XmlDocumentBuilder.serialize` never emits one | `test_no_byte_order_mark_br_121` | **Implemented, evidence-backed** |
| BR-122 | Filename `<ArticleID>_reviews.xml` | `generator.py::_generate` (`config.reviews_filename_pattern`) | `test_filename_matches_br_122_pattern` | **Implemented, evidence-backed** |
| BR-123 | Chronological, grouped by round | `generator.py::_order_blocks` | `test_rounds_ordered_ascending_by_sequence_number`, `test_reviews_ordered_before_decision_within_a_round`, `test_unresolved_round_label_sorted_last_and_diagnosed` | **Implemented, best-effort** — round resolution inherits Milestone 6E's already-documented `RoundInfo.label` limitation; unresolved labels are diagnosed, never dropped |
| BR-124 | Every review resolves to exactly one round except fixed/ungrouped entries | Satisfied by construction — every block this generator emits carries a `review-version` from its source collection's own `round_label` | — | **Implemented, evidence-backed** |
| BR-125 | Never fabricate reviewer content that wasn't submitted | The central design principle throughout — see §0 | Every "missing X is diagnosed, not fabricated" test in the suite | **Implemented, evidence-backed** |

---

## 4. Golden Comparison Report

Ran the full parse → extract → transform → generate pipeline against all 3 real reference packages and compared against their real `Output/*.zip` reviews.xml.

| Difference | Classification | Evidence |
|---|---|---|
| Root tag (`{...}review-group`), DOCTYPE, `content-version="1.0"` | **identical** | 3/3 exact match |
| `review-type` vocabulary | **business-rule improvement** | This generator never emits anything but `"review"`/`"decision"` (BR-099). Re-verification found the illegal `"CDATA"` literal in **CS-2025-6808 (32 occurrences)** and **CS-2025-8493_C (13 occurrences)** — refining BR-099's own text, which describes this as a "pkg1"-only defect; only `cs-2025-8827` (0 occurrences) is actually clean. This generator's behavior is correct per all available evidence and the Business Rule Book's own stated intent, regardless of which/how-many real packages exhibit the defect. |
| Reviewer/editor identity | **source-data limitation** | Every reviewer name this generator emits is confirmed present (verbatim or by surname) in the corresponding real reference package's own reviews.xml — never a fabricated identity (verified programmatically in the golden test, not sampled by hand). Full name-component splitting (surname/given-names) is not attempted — see the Reviews Decision Log. |
| Per-reviewer content (`review-item` count and text) | **confirmed ICAM population gap, not a code defect** | The real packages' individual review-items (recommendation text, comment/confidential splits, screening-checklist splits) are manually curated from raw correspondence logs; the corresponding ICAM fields are confirmed always empty. This generator's own review-item count is a deterministic, verified function of its ICAM input (`len(reviewer_scorecards) + len(decline_reasons)` review-type blocks, `len(decision_drafts)` decision-type blocks) — golden-tested directly, not approximated. |
| Editorial decision content | **confirmed ICAM population gap, not a code defect** | `DecisionDraft.decision_text` is included verbatim (real content, matches evidence); the real files' generated summary sentence and editor/associate-editor identity are never attempted — `editor_name`/`associate_editor_name`/`decision_date` confirmed always `None` on all 3 samples. |
| Dates (`assigned`/`due`/`submitted`/decision date) | **confirmed ICAM population gap, not a code defect** | Never emitted by this generator (BR-125: never fabricated); the real files' dates have no ICAM-field counterpart at all today. |
| Duplicate correspondence entries, extended-scope categories (author-suggested reviewers, editor reassignment, production queries) | **confirmed ICAM population gap, not a code defect** | This generator is structurally ready (`review_builder.build_extended_history_reviews`, feature-flag-gated per ADR-004/005) but `WorkflowLog.events` is confirmed empty on all 3 real samples — 0 real events to render, on every sample, today. |
| Item/block count (raw totals) | **source-data limitation, quantified** | CS-2025-6808: 5 review + 2 decision generated vs. 7 clean (`review`/`decision`, excluding CDATA) + 32 CDATA real; CS-2025-8493_C: 5+2 generated vs. 2+2 clean + 13 CDATA real; cs-2025-8827: 6+2 generated vs. 13+3 real (0 CDATA) — the generated counts are exactly and verifiably `len(reviewer_scorecards) + len(decline_reasons)` / `len(decision_drafts)` in every case (golden-tested); the real counts' excess reflects exactly the manually-curated, duplicate/extended content documented above, not a code defect. |
| Line endings / attribute-line wrapping | **formatting-only, framework limitation** | Same already-documented `XmlDocumentBuilder` limitation noted in the Milestone 6D report (LF vs. real CRLF; no multi-line attribute wrapping) — not re-verified byte-for-byte this milestone, consistent with the same framework constraint. |

**None of these differences were silently absorbed** — every one is either asserted against in the golden test suite (where achievable) or explicitly classified and evidenced above, with the underlying ICAM gap traced to a specific, named field.

---

## 5. Test Report

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 858 passed, 0 failed |
| New tests this milestone | 18 in `tests/unit/generators/reviews_xml/test_generator.py`; 15 in `test_review_builder.py`; 8 in `test_decision_builder.py`; 1 parametrized golden test (3 real-package instances) in `tests/golden/test_reviews_xml_golden.py`; 2 new config-loader tests |
| Coverage, new modules | `generators/reviews_xml/generator.py` 100%, `review_builder.py` 100%, `decision_builder.py` 100%, `document.py` 100%, `__init__.py` 100%, `config/schema.py`/`config/loader.py` 100% |
| Overall project coverage | 99% (3,687 statements, 12 missed — all in unimplemented future-milestone stub modules: `transfer_xml`, `orchestrator/run_controller`, `validation`, `packaging`, etc.) |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (241 files) |
| `mypy --strict` | Clean (109 source files) |

Test categories covered per the task's explicit list: review history generation ✅ (completed/declined/status-only paths), multiple rounds ✅ (`test_rounds_ordered_ascending_by_sequence_number`, `test_multiple_decision_drafts_produce_one_review_each`), reviewer assignments ✅ (scorecards + declines), editor actions ✅ (decision blocks, editor/associate-editor contribs), chronology ✅ (BR-123 ordering, incl. unresolved-round defensive path), contributor roles ✅ (reviewer/editor/associate-editor), missing data ✅ (every "diagnosed, not fabricated" path directly unit-tested), diagnostics ✅ (every warn/info path), serialization ✅ (via `XmlDocumentBuilder`, reused unchanged; 2-space indentation confirmed), malformed ICAM ✅ (`empty_context` — no rounds, no reviewers, no decisions; `ReviewDataIntegrityError` raised for a recommendation with no identity). Golden comparison tests use all 3 approved reference packages (§4).

---

## 6. Architecture Compliance Report

- **Dependency direction, empirically verified**: `grep` over `src/meca_engine/generators/reviews_xml/` shows imports only from `meca_engine.generators.*` (framework), `meca_engine.config.schema`/`meca_engine.model.*` (type-only), `meca_engine.exceptions`, and stdlib. **Zero** imports from `meca_engine.extraction` or `meca_engine.transform`.
- **No extraction/metadata-layer access**: confirmed by the same import check — no route to `ExtractionBundle`, `ParsedDocument`, or any Milestone 3/4 type.
- **No transformation-layer access**: confirmed — no import of `meca_engine.transform.*` anywhere in the package.
- **No other-generator dependency**: confirmed — `ReviewsXmlGenerator`'s constructor takes only config + `NamespaceManager`, matching manifest.xml's precedent, never composing `RawXmlGenerator`/`ArticleXmlGenerator`/`ManifestXmlGenerator`.
- **ICAM immutability**: `ReviewsXmlGenerator`/`review_builder`/`decision_builder` never assign to any `ArticleModel`/`ReviewerScorecard`/etc. field; every ICAM read is a plain attribute access. The only mutable trees are this generator's own freshly-built `Element` objects.
- **Generator Framework fully reused**: every element/attribute via `XmlDocumentBuilder.create_root`/`.create_element`; every namespace resolved via `NamespaceManager.uri_for`; the shared `xml.helpers.add_optional_element` is reused (not re-implemented) for optional `<string-name>`/`<email>` emission; lifecycle entirely via `BaseGenerator.generate()`.
- **No duplicated XML helper logic**: `add_review_item`/`add_reviews_contrib` are defined once (`review_builder.py`) and imported, not copied, into `decision_builder.py` — confirmed via `grep`, no second `<review-item-question>`/`<contrib-group>` construction exists anywhere in the tree.
- **Configuration-driven implementation**: `ReviewsXmlConfig`/`NamespaceConfig`/`FeatureFlagsConfig` are the only sources of DOCTYPE/encoding/content-version/blinding/permission/title/filename values — `grep` for BR-096's DOCTYPE string and BR-100's `"single"` confirms both appear only in `config/reviews-xml.yaml` and its test fixtures, never as a literal inside any `.py` file in the package.

---

## 7. Performance Report

Measured directly against all 3 real reference packages (Apple silicon, single process, no parallelism; `generate()` time excludes ICAM-build):

| Article | ICAM build time | reviews.xml generation time | Output size | Peak memory (generate only) | Scorecards / Declines / Decisions |
|---|---|---|---|---|---|
| CS-2025-6808 | 376.1 ms | 0.71 ms | 12,211 bytes | 145.0 KB | 4 / 1 / 2 |
| CS-2025-8493_C | 274.5 ms | 0.49 ms | 8,850 bytes | 67.0 KB | 2 / 3 / 2 |
| cs-2025-8827 | 135.2 ms | 0.54 ms | 15,425 bytes | 148.8 KB | 3 / 3 / 2 |

Generation time is sub-millisecond, negligible relative to ICAM-build time (well under 1%) — consistent with manifest.xml's own finding (no composed-generator overhead, no large-subtree copying).

**Scalability observation**: `_order_blocks` is `O(n log n)` in the number of review+decision blocks (one `sorted()` call); every builder function is a single `O(n)` pass over its input collection with no nested loops or repeated lookups (the round-sequence dictionary is built once, reused per block). No per-reviewer filesystem or network access. Memory scales with the number of `Element` objects created (one per review/decision block plus its children) plus one working copy during `serialize()`'s clone — the same already-characterized pattern from every prior generator's report. No algorithmic concern identified even at a much larger reviewer/round count than the 3 samples exhibit (2-4 reviewers, 1-2 rounds each).

**Observations only, no optimization performed** — no actual performance issue identified at this scale.

---

## 8. Reviews Decision Log

See `28_REVIEWS_DECISION_LOG.md` for every workflow-reconstruction decision this milestone made — round reconstruction, reviewer mapping, editor mapping, chronology, contributor resolution, decision-state mapping, and ambiguity handling — intended as the authoritative reference for future maintenance and for whoever eventually extends `WorkflowLog` population at the extraction layer.

---

## 9. Readiness Assessment for transfer.xml

**Ready to begin transfer.xml — no new blocking defects; the same already-known round-semantics caveat remains relevant, and one new, narrower recommendation:**

1. **`RoundInfo.is_latest`/`.label` semantic mismatch** (Milestone 6E §1.4/§8, reconfirmed here) — transfer.xml's own scope (per 11_LLD_02 §4.7: "config (publisher config, journal acronym), the ICAM's primary corresponding email") does not appear to be round-scoped at all, unlike reviews.xml — this is a lower-risk generator with respect to that specific gap, but worth a quick design-time check rather than an assumption.
2. **New recommendation**: before or during transfer.xml, no reviews.xml-specific blocker exists to carry forward — this generator's scope is fully self-contained (identity/journal/publisher config + article-level corresponding-email data, none of which reviews.xml touches).
3. **Recall the user's own stated recommendation**: after this milestone, only transfer.xml remains before all 4 XML artifacts are complete — the user has explicitly recommended a **Generator Suite Review** at that point (validating raw.xml/article.xml/manifest.xml/reviews.xml together against all 3 reference packages) before package assembly begins. This report's evidence (the CDATA-defect scope correction in §4, the `RoundInfo` semantic mismatch spanning 3 of 4 generators so far) supports that recommendation strongly — a consolidated review is likely to surface additional cross-generator consistency findings that no single generator's own report would catch in isolation.

**Waiting for approval before starting the transfer.xml Generator.**
