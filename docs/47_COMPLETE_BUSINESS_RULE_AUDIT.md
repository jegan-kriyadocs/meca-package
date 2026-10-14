# Complete Business Rule Audit — Milestone 8

Full audit of all 160 Business Rules (BR-001–BR-160), cross-referenced
against every implementation milestone report, decision log, and golden
test in the project, with targeted `grep`-based empirical spot-checks
against the current codebase (not assertions taken on report prose
alone). No rule is omitted.

Status legend: **CI** = Confirmed-Implemented, **INFE** =
Implemented-Not-Fully-Evidenced, **SSNE** = Structurally-Supported-Not-Exercised,
**NIWCI** = Not-Implementable-With-Current-ICAM, **BAO** =
Business-Ambiguity-Open, **SBE** = Superseded-By-Evidence.

---

## A. Ingestion & Source Structure (BR-001–010) — pre-generator layer, Milestones 2/3/5B

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-001 | CI | extraction | Yes (parser/loader unit tests) | Golden: 3/3 well-formed | 17_ARCH_REVIEW §3: "Fully implemented — Milestones 2/3" | None |
| BR-002 | CI | extraction | Yes (file_resolver unit tests) | Golden: 3/3 | 17_ARCH_REVIEW §3 (BR-011/018 implementation covers this) | None |
| BR-003 | CI | extraction | Yes (identity_transformer tests) | Golden: 3/3 verbatim IDs | 17_ARCH_REVIEW §3: "Fully implemented — identity_transformer" | None |
| BR-004 | SSNE | extraction | No dedicated multi-journal test | N/A — only 1 journal in samples | Config-driven (`JournalConfig`) per 31_SUITE_REVIEW §4; never exercised against 2nd journal | Behavior with a 2nd journal untested |
| BR-005 | CI | extraction | Yes (xml_loader tolerant-parse tests) | Golden: 3/3 | 17_ARCH_REVIEW §3; Milestone 3 `xml_loader` uses `defusedxml`, tolerates non-JATS elements | None |
| BR-006 | CI | extraction | Yes (body_fragment tests) | Golden: 3/3 | `BodyFragment.raw_xml_fragment` verbatim copy, confirmed 17_ARCH_REVIEW §2.9 | None |
| BR-007 | CI | extraction | Yes (custom_meta_classifier tests) | Golden: 3/3 | 17_ARCH_REVIEW §3: "Fully implemented — Milestone 5B" | None |
| BR-008 | CI | extraction | Yes (raw_xml BR-041 "satisfied by construction" test) | Golden: 3/3, confirmed via raw.xml now existing | 20_MILESTONE_6B §3 BR-041: workflow tags never captured in ICAM at all | None (was "Partial" in 17_ARCH pending raw.xml; now closed) |
| BR-009 | CI | extraction | Yes (single-pass parse tests) | Golden: 3/3 | 17_ARCH_REVIEW §3 | None |
| BR-010 | CI | extraction | Yes (`round_resolver` unit + synthetic 3-round ADR-013 fixture) | Golden: confirmed correct (31_SUITE_REVIEW BR-142) | 31_SUITE_REVIEW §3.1 BR-142: "Confirmed correct... unchanged since 5B/6E" | Only 2 real rounds ever observed; 3+-round correctness rests on synthetic fixture |

**A summary: CI=9, SSNE=1**

---

## B. File Inclusion, Copy & Exclusion (BR-011–025) — extraction + packaging

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-011 | CI | extraction | Yes, 16 pre-existing `file_resolver` tests | Golden: 3/3 | 17_ARCH_REVIEW §3 | None |
| BR-012 | CI | packaging | Yes (`test_asset_copy.py`, checksum verify) | Golden: 3/3 (Milestone 7 golden) | 36_MILESTONE_7 §2 `AssetCopyService` streams+verifies checksum/size | None |
| BR-013 | CI | extraction | Yes | Golden: 3/3 | `ResolvedFile.original_filename` preserved; BR-082 manifest href confirms | None |
| BR-014 | INFE | extraction | No dedicated denylist test | Golden: pkg1 36-file exclusion consistent with BR-011 | 17_ARCH_REVIEW §3: "Partial — byproduct of BR-011, not a dedicated exclusion rule" | Confirm no dedicated pattern-based denylist is needed |
| BR-015 | CI | packaging | Yes | Golden: 3/3 | `files/<Round>/` folder naming, packaging asset_copy | None |
| BR-016 | CI | extraction | Yes (16 file_resolver tests incl. leading-slash tolerance) | Golden: 3/3 | 17_ARCH_REVIEW §3: "Fully implemented, extended — 2 additional tolerance tiers beyond BR-016/017 text" | None |
| BR-017 | CI | extraction | Yes | Golden: 3/3 | Same as BR-016 | None |
| BR-018 | CI | extraction | Yes (custom_meta_classifier tests) | Golden: 3/3 | 17_ARCH_REVIEW §3 | None |
| BR-019 | CI | extraction | Yes (item-type-mapping.yaml default fallback tests, Milestone 5C/6D) | Golden: 3/3 item-types match | 18_MILESTONE_5C §4; 23_MILESTONE_6D BR-078 | None |
| BR-020 | SSNE | extraction | No test found (grep: 0 hits) | N/A | 17_ARCH_REVIEW §6.8/§6: "Not addressed — no filter/handling exists; would flow through unfiltered if it appeared in name/path" | Confirm whether explicit filtering is needed before production scale |
| BR-021 | SSNE | extraction | No cross-validation test | N/A | 17_ARCH_REVIEW §3: "Partial — declared_size_bytes and size_bytes exist on separate ICAM types, never cross-validated" | Cross-check deferred to future Validation Engine |
| BR-022 | SSNE | extraction | No dedicated test (trivial ignore) | N/A | BR book: "ppi field ignored, confirmed 3/3 always null" | None — low priority |
| BR-023 | CI | packaging | Yes (asset_copy byte-stream tests) | Golden: 3/3 | 36_MILESTONE_7 §2: streams via `shutil.copyfileobj`, no re-encoding | None |
| BR-024 | SSNE | extraction | No direct test (all sample rounds have qualifying files) | N/A — not exercised in any real sample | BR book self-notes "not directly observed"; no milestone report contradicts | Genuinely untested edge case |
| BR-025 | CI | extraction | Confirmed via grep: `_log_unreferenced_physical_files` in `file_resolver.py` (ADR-016) | N/A (log-only, not output) | 17_ARCH_REVIEW §3: "Fully implemented — Milestone 5B (ADR-016)"; grep-confirmed this review | None |

**B summary: CI=9, INFE=1, SSNE=5**

---

## C. Media-Type & Extension Mapping (BR-026–035) — extraction (`utils/media_types.py`)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-026 | BAO | extraction | Yes (media_types tests) | Golden: non-exact (ADR-008) | 23_MILESTONE_6D §4: config deliberately uses **modern** OOXML types; all 3 real packages use **legacy** types | ADR-008 unresolved: legacy vs. modern MIME types |
| BR-027 | CI | extraction | Yes | Golden: 3/3 exact | Standard, unambiguous mapping | None |
| BR-028 | BAO | extraction | Yes | Golden: non-exact (ADR-008) | Same ADR-008 conflict as BR-026, for `.xlsx` | Same as BR-026 |
| BR-029 | CI | extraction | Yes | Golden: 3/3 exact | Standard, unambiguous mapping | None |
| BR-030 | CI | manifest_xml | Yes | Golden: 3/3 | BR-079/030 fixed items, `application/xml` constant | None |
| BR-031 | CI | extraction | Yes (`test_unmapped_extension_defaults_and_is_diagnosed`) | N/A (no sample has unmapped ext.) | ADR-009 fallback + WARN diagnostic implemented | Never exercised against a real unmapped extension |
| BR-032 | CI | extraction | Yes (config loader tests) | N/A | `config/media-types.yaml`, fully external, no hard-coded table | None |
| BR-033 | CI | extraction | Yes (`test_media_types.py`) | N/A (all samples lower-case) | Verified directly: `PurePath(filename).suffix.lower()` in `utils/media_types.py` | None |
| BR-034 | CI | extraction | Yes | Golden: 3/3 | Pure extension lookup, no content-sniffing, confirmed via code read | None |
| BR-035 | CI | extraction | Yes (same fallback mechanism as BR-031) | N/A | ADR-009 default fallback | Same as BR-031 |

**C summary: CI=8, BAO=2**

---

## D. raw.xml Generation (BR-036–050) — raw_xml (Milestone 6B, corrected 6E)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-036 | CI | raw_xml | `test_doctype_matches_br_036` | 3/3 exact | 20_MILESTONE_6B §3/§5 | None |
| BR-037 | CI | raw_xml | `test_root_declares_4_namespaces_unconditionally_br_037` | 3/3 exact | 20_MILESTONE_6B §3 | None |
| BR-038 | CI | raw_xml | `test_xml_declaration_matches_br_038` | 3/3 exact | 20_MILESTONE_6B §3 | None |
| BR-039 | INFE | raw_xml | `test_body_attached_verbatim_including_ids` (partial) | Partial — body ids preserved, front-matter ids not | 20_MILESTONE_6B §3/§6: "partial — front-matter reconstructed fresh from typed fields, original ids never retained" | Does BR-039 apply to front-matter ids too, or body only? |
| BR-040 | CI | raw_xml | `test_article_type_matches_br_040` | 3/3 exact | 20_MILESTONE_6B §3 | None |
| BR-041 | CI | raw_xml | `test_back_matter_always_diagnosed_never_fabricated` | Satisfied by construction | 20_MILESTONE_6B §3 | None |
| BR-042 | INFE | raw_xml | `test_custom_meta_group_reconstructed_from_all_categories` | Best-effort, not verbatim (65% no-`meta-name` entries dropped at classifier) | 20_MILESTONE_6B §3/§6: "best-effort, not verbatim" | Should raw_xml read classified `CustomMetaStore` or raw entries? (17_ARCH §8 item 6) |
| BR-043 | CI | raw_xml | `test_body_attached_verbatim_including_ids` | 3/3 (after Milestone 6C xlink-prefix fix) | 20_MILESTONE_6B/21_MILESTONE_6C §0 | None |
| BR-044 | CI | raw_xml | `test_pretty_print_uses_zero_indentation_per_br_044` | 3/3 style match | 20_MILESTONE_6B §3/§5 | None |
| BR-045 | CI | raw_xml | `test_copyright_statement_preserved_verbatim` | 3/3 exact | 20_MILESTONE_6B §3 | None |
| BR-046 | CI | raw_xml | `test_no_license_element_ever_added_br_046` | 3/3 (satisfied by omission) | 20_MILESTONE_6B §3 | None |
| BR-047 | INFE | raw_xml | `test_history_dates_copied_verbatim` + 6E fix tests | 3/3 date values now match (Milestone 6E fix) | 25_MILESTONE_6E §1.1/§4: revision date fixed; middle date-type string still fixed literal, not verbatim | Date-type text fidelity for the middle history date is a residual, undecided limitation |
| BR-048 | CI | raw_xml | `test_filename_matches_br_048_pattern` | 3/3 pattern (casing latent issue, see TD-9) | 20_MILESTONE_6B §3 | `article_id` casing (CS-2025-6808) never directly asserted in this golden test |
| BR-049 | CI | raw_xml | `test_dtd_version_matches_br_049` | 3/3 exact | 20_MILESTONE_6B §3 | None |
| BR-050 | CI | raw_xml | `test_xml_lang_matches_br_050` | 3/3 (all English) | 20_MILESTONE_6B §3 | Non-English sample never tested |

**D summary: CI=12, INFE=3**

---

## E. article.xml Generation (BR-051–075) — article_xml (Milestone 6C, corrected 6E)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-051 | CI | article_xml | `test_raw_xml_generator_diagnostics_are_shared` | 3/3 | 21_MILESTONE_6C §3 | None |
| BR-052 | CI | article_xml | `test_doctype_matches_br_052` | 3/3 exact | 21_MILESTONE_6C §3 | None |
| BR-053 | CI | article_xml | `test_xml_declaration_matches_br_053` | 3/3 exact | 21_MILESTONE_6C §3 | None |
| BR-054 | CI | article_xml | UUID-strip tests | 3/3, 0 UUID ids remain | 21_MILESTONE_6C §3 | None |
| BR-055 | CI | article_xml | `test_root_never_declares_mml_xsi_ali_or_xml_lang_br_055` | 3/3 | 21_MILESTONE_6C §3 | None |
| BR-056 | CI | article_xml | 3 dedicated tests | 3/3 | 21_MILESTONE_6C §3 | None |
| BR-057 | CI | article_xml | 2 dedicated tests | 3/3 | 21_MILESTONE_6C §3 | Non-Research/Review article-type never tested (ADR-001) |
| BR-058 | CI | article_xml | `test_doi_generated_from_doi_article_id_br_058`; grep-confirmed | 3/3 exact match | 21_MILESTONE_6C §3/§4 | None |
| BR-059 | CI | article_xml | `test_doi_prefix_comes_from_journal_config_br_059` | 3/3 (single journal only) | 21_MILESTONE_6C §3 | Untested against 2nd journal/publisher |
| BR-060 | CI | article_xml | Multiple `_COPIED_VERBATIM_TAGS` tests | 3/3 (funding-group flat structure confirmed correct) | 21_MILESTONE_6C §3 | None |
| BR-061 | CI | article_xml | `test_corresp_email_xlink_attributes_stripped_br_061` | 3/3 exact | 21_MILESTONE_6C §3 | None |
| BR-062 | CI | article_xml | `test_copyright_statement_and_year_copied_verbatim` | 3/3 exact | 21_MILESTONE_6C §3 | None |
| BR-063 | CI | article_xml | CC-BY synthesis tests | 3/3 exact license-p text | 21_MILESTONE_6C §3/§4 | None |
| BR-064 | CI | article_xml | `test_license_carries_license_type_and_xlink_href_br_064` | 2/3 exact; 1/3 ref-package defect (not this impl) | 21_MILESTONE_6C §4 | None (defect is in reference package) |
| BR-065 | BAO | article_xml | `test_cc_by_license_synthesized_when_no_license_type_key_br_065_evidence` | N/A — no non-CC-BY sample exists | ADR-002 unresolved | Non-CC-BY license text |
| BR-066 | INFE | article_xml | `test_only_latest_round_file_entries_survive_br_066` (correct in isolation) | Starved: 0-2 entries vs. ~19-21 real, 3/3 | 25_MILESTONE_6E §4: "filter provably correct; RoundInfo.is_latest label doesn't match physically-latest round" | RoundInfo.label vs. physical-round mismatch (TD-1 root cause) |
| BR-067 | CI | article_xml | `test_reviewer_scorecards_never_reach_article_xml_br_067` | 3/3 (satisfied by construction) | 21_MILESTONE_6C §3 | None |
| BR-068 | CI | article_xml | `test_decline_reasons_never_reach_article_xml_br_068` | 3/3 | 21_MILESTONE_6C §3 | None |
| BR-069 | CI | article_xml | `test_decision_drafts_never_reach_article_xml_br_069` | 3/3 | 21_MILESTONE_6C §3 | None |
| BR-070 | SBE | article_xml | `test_submission_decision_values_pass_through_unfiltered_br_070_evidence` | 3/3, contradicts BR-070's literal text | 21_MILESTONE_6C §3: "BRB inaccuracy, evidence trusted" | BR book itself needs correction |
| BR-071 | CI | article_xml | `test_unrecognized_form_answer_keys_pass_through_br_071` | 3/3 | 21_MILESTONE_6C §3 | None |
| BR-072 | CI | article_xml | `test_output_never_contains_body_br_072` | 3/3 confirmed absent | 21_MILESTONE_6C §3 | None |
| BR-073 | CI | article_xml | `test_filename_matches_br_073_pattern` | 3/3 pattern | 21_MILESTONE_6C §3 | Casing never directly asserted (TD-9) |
| BR-074 | CI | article_xml | `test_dtd_version_matches_br_074` | 3/3 exact | 21_MILESTONE_6C §3 | None |
| BR-075 | CI | article_xml | Same as BR-067 (satisfied by construction) | 3/3 | 21_MILESTONE_6C §3 | None |

**E summary: CI=22, INFE=1, BAO=1, SBE=1**

---

## F. manifest.xml Generation (BR-076–095) — manifest_xml (Milestone 6D, TD-1 confirmed 6H)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-076 | CI | manifest_xml | `test_doctype_matches_br_076_and_br_095` | 3/3 exact | 23_MILESTONE_6D §3 | None |
| BR-077 | CI | manifest_xml | `test_exactly_three_fixed_items_appear_first_br_077` | 3/3 exact | 23_MILESTONE_6D §3 | None |
| BR-078 | CI | manifest_xml | `test_item_type_uses_the_configured_mapping_br_078` | 3/3 exact for every common href | 23_MILESTONE_6D §3/§4 | None |
| BR-079 | CI | manifest_xml | 2 dedicated tests | 3/3 exact | 23_MILESTONE_6D §3/§4 | None |
| BR-080 | CI | manifest_xml | Same as BR-079 | 3/3 exact | 23_MILESTONE_6D §3/§4 | None |
| BR-081 | BAO | manifest_xml | `test_resolved_extension_uses_the_configured_media_type` | Structural only; ADR-008 legacy/modern conflict | 23_MILESTONE_6D §4 | Same ADR-008 as BR-026/028 |
| BR-082 | CI | manifest_xml | 2 dedicated tests | 100% subset match, 3/3 | 23_MILESTONE_6D §3/§4 | None |
| BR-083 | BAO | manifest_xml | `test_latest_round_files_listed_before_earlier_round_files_br_083` (unit, correct in isolation); golden test now asserts the real violation explicitly | **VIOLATED in all 3 real samples**, confirmed Milestone 6H | 31_SUITE_REVIEW §5.3 (root cause), 34_TD_REGISTER TD-1 (Critical) | Requires business-confirmed round-naming/mapping rule |
| BR-084 | CI | manifest_xml | `test_file_item_description_uses_the_clean_template_br_084` | Deliberately not equal to real (ADR-010) | 23_MILESTONE_6D §3/§4 | None — real pattern is a confirmed ref-package defect |
| BR-085 | CI | manifest_xml | `test_file_item_ids_are_flat_sequential_br_085` | Deliberately not equal to real (ADR-011) | 23_MILESTONE_6D §3/§4 | None |
| BR-086 | CI | manifest_xml | `test_xml_declaration_matches_br_086` | 3/3 exact | 23_MILESTONE_6D §3 | None |
| BR-087 | CI | manifest_xml | `test_manifest_version_matches_br_087` | 3/3 exact | 23_MILESTONE_6D §3/§4 | None |
| BR-088 | CI | manifest_xml | `test_filename_matches_br_088_pattern` | 2/3 exact, 1/3 case-insensitive | 23_MILESTONE_6D §4 | article_id casing (TD-9) |
| BR-089 | INFE | manifest_xml | `test_item_count_equals_three_plus_file_count_br_094` | manifest→files half confirmed; reverse unverifiable at generator layer | 31_SUITE_REVIEW §3.2 BR-153 | Reverse direction depends on custom-meta completeness (TD-5) |
| BR-090 | CI | manifest_xml | `test_href_is_not_percent_encoded_br_090` | 3/3 (ADR-012) | 23_MILESTONE_6D §3/§4 | None |
| BR-091 | BAO | manifest_xml | Covered defensively via ADR-009 fallback | N/A (no sample has unmapped ext.) | 23_MILESTONE_6D §3 | Same as BR-031/035 |
| BR-092 | CI | manifest_xml | `test_fixed_items_present_even_for_the_simplest_package_br_092` | 3/3 | 23_MILESTONE_6D §3 | None |
| BR-093 | CI | manifest_xml | `test_no_resolved_files_is_diagnosed...br_093` | 3/3 | 23_MILESTONE_6D §3 | None |
| BR-094 | CI | manifest_xml | `test_item_count_equals_three_plus_file_count_br_094` | 3/3 | 23_MILESTONE_6D §3 | None |
| BR-095 | CI | manifest_xml | `test_doctype_matches_br_076_and_br_095` | 3/3 | 23_MILESTONE_6D §3 | None |

**F summary: CI=16, BAO=3, INFE=1**

---

## G. reviews.xml Generation (BR-096–125) — reviews_xml (Milestone 6F)

Central finding: real reviews.xml content is manually curated from raw
correspondence, so most ICAM source fields are confirmed always empty
on real sample data.

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-096 | CI | reviews_xml | 2 dedicated tests | 3/3 exact | 27_MILESTONE_6F §3 | None |
| BR-097 | CI | reviews_xml | `test_content_version_matches_br_097` | 3/3 exact | 27_MILESTONE_6F §3 | None |
| BR-098 | CI | reviews_xml | All 3 builder-function tests | 2/3 exact; 1/3 ref-package defect | 27_MILESTONE_6F §3 | None |
| BR-099 | CI | reviews_xml | golden `test_reviews_xml_golden.py` (grep-confirmed) | Never emits "CDATA"; refines BRB text (2/3, not 1/3) | 27_MILESTONE_6F §3/§4 | BR book text should be corrected to "2/3" |
| BR-100 | CI | reviews_xml | Config test | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-101 | CI | reviews_xml | Config test | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-102 | CI | reviews_xml | `test_completed_scorecard_produces_a_review_block` etc. | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-103 | SSNE | reviews_xml | `test_missing_overall_recommendation_is_diagnosed` | N/A — field always `None` on real data | 27_MILESTONE_6F §3: "structurally supported, never populated" | Source of recommendation text unconfirmed |
| BR-104 | NIWCI | reviews_xml | None | N/A | 27_MILESTONE_6F §3: "Not implementable — no ICAM field distinguishes author/editor channel" | Needs new ICAM field + confirmed source |
| BR-105 | NIWCI | reviews_xml | None | N/A | 27_MILESTONE_6F §3: "Not applicable — no confidential-comment field exists" | Same as BR-104 |
| BR-106 | CI | reviews_xml | `test_decline_reason_produces_a_status_only_review` | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-107 | CI | reviews_xml | Same as BR-106 | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-108 | SSNE | reviews_xml | `test_attachment_url_produces_an_ext_link_br_108` | N/A — `WorkflowLog.events` always empty on real data | 27_MILESTONE_6F §3 | ADR-003: link-only vs. fetch-and-package, unresolved |
| BR-109 | CI | reviews_xml | `test_decision_draft_produces_a_decision_review` | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-110 | INFE | reviews_xml | `test_missing_editor_identity_is_diagnosed` | Partial — decision text verbatim; summary sentence never synthesized | 27_MILESTONE_6F §3 | Deliberately not attempted (would require free-text parsing) |
| BR-111 | SSNE | reviews_xml | `test_extended_scope_events_gated_by_extended_history_flag` | N/A — always empty | 27_MILESTONE_6F §3 | ADR-005 extended-scope activation |
| BR-112 | INFE | reviews_xml | `test_completed_scorecard_produces_a_review_block` | Partial | 27_MILESTONE_6F §3: "ReviewerScorecard has email; DeclineReason/DecisionDraft don't" | Needs email field on DeclineReason/DecisionDraft |
| BR-113 | INFE | reviews_xml | `test_populated_editor_name_produces_editor_contrib...` | Reviewer confirmed; editor/associate-editor never exercised on real data | 27_MILESTONE_6F §3 | Editor contrib never exercised against real data |
| BR-114 | NIWCI | reviews_xml | None | N/A | 27_MILESTONE_6F §3: "all 3 date fields confirmed always None" | Source for dates unconfirmed |
| BR-115 | NIWCI | reviews_xml | None | N/A | 27_MILESTONE_6F §3 | Same as BR-114 |
| BR-116 | SSNE | reviews_xml | `test_duplicate_correspondence_included_when_flag_enabled`/`disabled` | N/A — gated by ADR-004 flag | 27_MILESTONE_6F §3 | ADR-004 unresolved |
| BR-117 | SSNE | reviews_xml | `test_extended_scope_events_gated_by_extended_history_flag` | N/A | 27_MILESTONE_6F §3 | ADR-005 scope |
| BR-118 | SSNE | reviews_xml | Same | N/A | 27_MILESTONE_6F §3 | ADR-005 scope |
| BR-119 | SSNE | reviews_xml | Same | N/A | 27_MILESTONE_6F §3 | ADR-005 scope |
| BR-120 | CI | reviews_xml | `test_xml_declaration_matches_br_120` | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-121 | CI | reviews_xml | `test_no_byte_order_mark_br_121` | Satisfied by construction | 27_MILESTONE_6F §3 | None |
| BR-122 | CI | reviews_xml | `test_filename_matches_br_122_pattern` | 3/3 pattern | 27_MILESTONE_6F §3 | None |
| BR-123 | INFE | reviews_xml | `test_rounds_ordered_ascending_by_sequence_number` | Best-effort; inherits RoundInfo.label limitation | 27_MILESTONE_6F §3 | Same TD-1 dependency |
| BR-124 | CI | reviews_xml | Satisfied by construction | 3/3 | 27_MILESTONE_6F §3 | None |
| BR-125 | CI | reviews_xml | Central design principle | 3/3 | 27_MILESTONE_6F §0/§3 | None |

**G summary: CI=15, SSNE=7, NIWCI=4, INFE=4**

---

## H. transfer.xml Generation (BR-126–140) — transfer_xml (Milestone 6G)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-126 | CI | transfer_xml | `test_doctype_matches_br_126` | 3/3 exact | 30_MILESTONE_6G §3/§4 | None |
| BR-127 | CI | transfer_xml | `test_xml_declaration_has_no_encoding_attribute_br_127` | 3/3 exact | 30_MILESTONE_6G §3/§4 | None |
| BR-128 | CI | transfer_xml | `test_source_provider_name_matches_br_128` | 3/3, config-driven | 30_MILESTONE_6G §3/§4 | None |
| BR-129 | CI | transfer_xml | `test_source_contact_name_is_always_empty_br_129` | 3/3 | 30_MILESTONE_6G §3/§4 | None |
| BR-130 | INFE | transfer_xml | `test_source_and_publication_contact_email_matches_corresponding_author_br_130` | 2/3 exact; 1/3 index mismatch | 30_MILESTONE_6G §5 (TD-7) | Milestone 5B "primary email" ordering rule unconfirmed |
| BR-131 | CI | transfer_xml | `test_source_contact_phone_is_always_empty_br_131` | 3/3 | 30_MILESTONE_6G §3/§4 | None |
| BR-132 | CI | transfer_xml | `test_publication_title_matches_journal_title_br_132` | 3/3 exact | 30_MILESTONE_6G §3/§4 | None |
| BR-133 | BAO | transfer_xml | `test_publication_acronym_comes_from_journal_config_br_133` | Config-driven; matches once supplied | ADR-007 (TD-2), highest-priority open question | Journal acronym CLINSCI vs. CS — unresolved |
| BR-134 | CI | transfer_xml | `test_destination_provider_name_matches_br_134` | 3/3, config-driven | 30_MILESTONE_6G §3/§4 | None |
| BR-135 | BAO | transfer_xml | Same as BR-133 | Same acronym caveat | Same as BR-133 | Same |
| BR-136 | CI | transfer_xml | `test_authentication_code_matches_br_136` | 3/3 exact | 30_MILESTONE_6G §3/§4 | None |
| BR-137 | CI | transfer_xml | `test_processing_instructions_matches_br_137` | 3/3 exact | 30_MILESTONE_6G §3/§4 | None |
| BR-138 | CI | transfer_xml | `test_processing_comments_matches_br_138` | 3/3, case-insensitive on 1 sample | 30_MILESTONE_6G §3/§4 | article_id casing (TD-9) |
| BR-139 | CI | transfer_xml | `test_filename_matches_br_139_pattern` | 3/3 | 30_MILESTONE_6G §3/§4 | None |
| BR-140 | CI | transfer_xml | `test_output_never_references_rounds_or_custom_meta` | Satisfied by construction | 30_MILESTONE_6G §3/§4 | None |

**H summary: CI=12, INFE=1, BAO=2**

---

## I. Multi-Round Processing (BR-141–150)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-141 | INFE | extraction | Constructional | Partial — 16 Original-round files never custom-meta-declared | 31_SUITE_REVIEW §3.1 | Custom-meta completeness gap (Milestone 3/4 layer) |
| BR-142 | CI | extraction | `round_resolver` unit tests | Confirmed correct | 31_SUITE_REVIEW §3.1 | None |
| BR-143 | INFE | article_xml | Unit-tested correct in isolation | Starved by upstream data (same as BR-066) | 31_SUITE_REVIEW §3.1 | Same TD-1 dependency |
| BR-144 | BAO | manifest_xml | Unit-tested correct in isolation; golden now asserts the violation | **VIOLATED, confirmed in all 3 real samples** | 31_SUITE_REVIEW §5.3, 34_TD_REGISTER TD-1 (Critical) | Requires business-confirmed round-naming/mapping rule |
| BR-145 | CI | reviews_xml | `test_rounds_ordered_ascending_by_sequence_number` | Confirmed — same reviewer in 2 independent scorecards across rounds | 31_SUITE_REVIEW §3.1 | None |
| BR-146 | CI | raw_xml | Satisfied by construction | Confirmed — flat custom-meta-group | 31_SUITE_REVIEW §3.1 | None |
| BR-147 | CI | N/A | `cs-2025-8827` (1 round) produces complete 5-file suite | Confirmed | 31_SUITE_REVIEW §3.1 | None |
| BR-148 | SSNE | extraction | Synthetic-fixture only (ADR-013) | N/A — no real 3rd-round-name sample | 31_SUITE_REVIEW §3.1; 34_TD_REGISTER TD-10 | No real sample beyond Original/R1 |
| BR-149 | CI | extraction | 3+ synthetic-fixture tests per generator | Confirmed — no generator hard-codes round count | 31_SUITE_REVIEW §3.1 | None |
| BR-150 | CI | N/A | Satisfied by omission | Confirmed — no diffing feature exists anywhere | 31_SUITE_REVIEW §3.1 | None |

**I summary: CI=6, INFE=2, BAO=1, SSNE=1**

---

## J. Cross-File Consistency & Package-Level Invariants (BR-151–160)

| Rule ID | Status | Module | Test Coverage | Golden Coverage | Evidence | Open Questions |
|---|---|---|---|---|---|---|
| BR-151 | CI | N/A | Cross-generator filename check | Confirmed, 3/3, all 5 filenames | 31_SUITE_REVIEW §3.2; 33_CONSISTENCY_MATRIX | None |
| BR-152 | CI | manifest_xml | `test_item_count_equals_three_plus_file_count_br_094`-adjacent | Confirmed 1:1 exact, 3/3 | 31_SUITE_REVIEW §3.2 | None |
| BR-153 | INFE | manifest_xml | manifest→files half confirmed | Reverse half unverifiable at generator layer | 31_SUITE_REVIEW §3.2 | Full verification needs real files/ contents (now exists post-Milestone 7, not re-verified against this specific invariant) |
| BR-154 | CI | packaging | `test_in_memory_doi_registry.py` incl. idempotent-reservation fix | Golden: `test_package_assembly_golden.py` | 36_MILESTONE_7 §2/§6: `DoiRegistry` implemented, bug found+fixed this milestone | Durable (cross-run) backend still deferred |
| BR-155 | CI | article_xml | Cross-checked via history dates | Confirmed 3/3, strictly ascending | 31_SUITE_REVIEW §3.2 (direct benefit of Milestone 6E fix) | None |
| BR-156 | INFE | reviews_xml | No dedicated test | Structurally plausible, not cross-validated | 31_SUITE_REVIEW §3.2; 34_TD_REGISTER TD-6 | Add a targeted cross-reference assertion |
| BR-157 | CI | manifest_xml | Confirmed exactly 1 manuscript item | 3/3 | 31_SUITE_REVIEW §3.2 | None |
| BR-158 | CI | manifest_xml | Confirmed present for all 3 (open-access) | 3/3 | 31_SUITE_REVIEW §3.2 | None |
| BR-159 | CI | extraction | grep: no `open(...,"w")` on any Input-sourced path | Confirmed architecturally | 31_SUITE_REVIEW §3.2 | None |
| BR-160 | CI | packaging | `test_build_leaves_no_artifacts_when_a_generator_fails`, `test_build_cleans_up_a_partially_written_zip_on_zip_failure` | Golden: Milestone 7 golden tests | 36_MILESTONE_7 §2/§8; 38_DECISION_LOG "Atomicity mechanism" | Per-article atomicity delivered; **run-level/batch atomicity explicitly out of scope**, deferred to orchestration layer |

**J summary: CI=8, INFE=2**

---

## Overall Summary (160 rules)

| Status | Count |
|---|---|
| Confirmed-Implemented (CI) | **117** |
| Implemented-Not-Fully-Evidenced (INFE) | **15** |
| Structurally-Supported-Not-Exercised (SSNE) | **14** |
| Not-Implementable-With-Current-ICAM (NIWCI) | **4** |
| Business-Ambiguity-Open (BAO) | **9** |
| Superseded-By-Evidence (SBE) | **1** |
| **Total** | **160** |

## Key cross-cutting findings

1. **TD-1 (Critical, single highest-impact item)**: `RoundInfo.label`
   (always `"Original"`) never matches physical round-folder names —
   confirmed to invert manifest.xml's required round order (BR-083/144)
   on all 3 real samples, and starves article.xml's BR-066/143 filter
   and reviews.xml's BR-123 chronology. Root cause is upstream
   (extraction/round_resolver), deliberately not patched without
   business input.
2. **ADR-007 (journal acronym, BR-133/135)** — the single most-cited
   open business ambiguity across the whole document set.
3. **ADR-008 (legacy vs. modern MIME types, BR-026/028/081)** — config
   deliberately uses modern OOXML types, diverging from all 3 real
   samples' legacy values; unresolved.
4. **reviews.xml (Section G) has the weakest evidence base** of the 5
   generators: 12 of 30 BRs are structurally-supported-but-never-exercised
   or not-implementable, because real reviews.xml content is manually
   curated by humans from raw correspondence that doesn't survive into
   the ICAM.
5. **Milestone 7 closed BR-154 and the per-article half of BR-160**
   (previously "not yet applicable" per the Suite Review) via
   `DoiRegistry`/atomic staging — the only two BRs in Section J whose
   status materially improved after the Suite Review.
6. **Two "Requires Business Confirmation" items are now resolved by
   evidence rather than business decision**: BR-070 (Superseded-By-Evidence)
   and BR-099 (scope refined from "1/3" to "2/3" samples affected).
