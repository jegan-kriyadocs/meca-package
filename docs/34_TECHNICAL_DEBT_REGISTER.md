# Technical Debt Register — Milestone 6H (Generator Suite Review)

Consolidated across all prior milestone reports (18–30) and this
review's own new findings. Ranked Critical / High / Medium / Low.
Ranking reflects risk to Package Assembly / production correctness,
not effort to fix.

## Critical

| ID | Item | Origin | Description | Remediation path |
|---|---|---|---|---|
| TD-1 | manifest.xml round ordering violates BR-083/144 (all 3 real samples) | Milestone 6E, confirmed/elevated 6H | `RoundInfo.label` (always `"Original"`) never matches `ResolvedFile.round_label` (physical folder names like `"R1"`), causing manifest.xml's round-sort to invert real evidence's required "latest first" order. Root cause is upstream of manifest.xml itself (article.xml's BR-143 filter and reviews.xml's round-labeling are also affected, at lower visible impact). | Requires a business-confirmed round-naming/mapping rule feeding `round_resolver.py` (Milestone 5B layer) — cannot be resolved inside any generator without violating the explicit "do not introduce additional round inference" constraint. Now permanently asserted as a regression tripwire in `test_manifest_xml_golden.py`. |

## High

| ID | Item | Origin | Description | Remediation path |
|---|---|---|---|---|
| TD-2 | ADR-007: journal acronym has no evidence-based derivation rule | Milestone 6G | 2/3 real samples use `"CLINSCI"` (absent from all source XML); 1/3 uses `"CS"` (matches source). No rule can distinguish "correct" from a 3rd, unseen journal. | Business confirmation required before onboarding any journal beyond the 3 already observed; currently mitigated by `JournalConfig.acronym` being fully config-driven (no code change needed once confirmed) |
| TD-3 | BR-154 (DOI uniqueness) unverified at batch level | Milestone 6H (Section J review) | Each of the 3 samples has a unique DOI individually, but no batch-wide uniqueness check exists anywhere in the codebase yet. | Implement in the future DOI Registry module (11_LLD_02 §`registry.doi_registry`) — natively a Package Assembly-era concern, not a generation-layer gap |
| TD-4 | BR-160 (atomic 5-file package generation) not yet implemented | Milestone 6H (Section J review) | Each generator is invoked and tested independently today; no orchestration layer guarantees all 5 succeed-or-fail together as one unit. | Package Assembly's own orchestration layer (Milestone 7) — expected, not a defect |
| TD-5 | manifest.xml file-item completeness gap (CS-2025-6808) | Milestone 6D | 16 physical `Original`-round files never appear in custom-meta, so they never enter the ICAM or manifest.xml, despite existing on disk. | Requires Milestone 3/4 (`custom_meta_classifier.py`) investigation — out of generation-layer scope |

## Medium

| ID | Item | Origin | Description | Remediation path |
|---|---|---|---|---|
| TD-6 | BR-156 cross-validation (reviews.xml decision ↔ history date) has no dedicated test | Milestone 6H (Test Review) | Both `decision_drafts` and `history_dates` are populated per-round, but nothing cross-references them directly in any test. | Add a targeted golden/unit assertion; low effort, no production-code risk |
| TD-7 | Corresponding-email selection discrepancy (CS-2025-8493_C) | Milestone 6G | article.xml/transfer.xml use `corresponding_emails[0]`; real evidence uses index 1 for this one sample. | Milestone 5B (`contributor_transformer.py`) "primary email" resolution question — needs real-world confirmation of the selection rule, not a guess from output |
| TD-8 | reviews.xml extended-scope fields never exercised by real data (12 of 30 BRs) | Milestone 6F | `WorkflowLog.events`, reviewer recommendation text, editor identity/dates, extended decision categories are structurally supported but always empty/`None` on all 3 real samples. | No action needed unless/until a real sample populates these fields; structural support is already correct and unit-tested against synthetic fixtures |
| TD-9 | `article_id` casing quirk (CS-2025-6808) | Milestone 6D, reconfirmed 6G/6H | Real reference package lower-cases `article_id` in filenames/hrefs/comments; generated output uses the mixed-case Input folder name. Confirmed in manifest.xml + transfer.xml; latent (never directly asserted) in raw.xml/article.xml. | Source-data/Milestone 3 (folder-naming ingestion) question — needs confirmation of the intended canonical casing rule |

## Low

| ID | Item | Origin | Description | Remediation path |
|---|---|---|---|---|
| TD-10 | Round-naming beyond `Original`/`R1` unverified (BR-148) | Milestone 6E/6H | No real sample demonstrates a 3rd round name; only synthetic-fixture coverage exists (ADR-013). | No action — revisit if/when a real 3+-round sample appears |
| TD-11 | CRLF/line-wrapping differences vs. real files | Milestone 6B+ | `XmlDocumentBuilder` always emits LF, single-line attributes; real files use CRLF and wrapped attributes. Purely cosmetic — no functional or schema impact. | No action recommended; would require a framework-level serialization change for zero functional benefit |
| TD-12 | Reference-package-internal defects (never replicated) | Milestone 6D/6F | CDATA `review-type` literal (2/3 samples), malformed manifest item id sequence, missing outer `<license>` attributes (1/3 samples) — all confirmed defects in the hand-built real reference packages themselves. | No action — these are correctly NOT replicated by this project's generators; documented for audit-trail completeness only |
| TD-13 | Report numbering gap (missing `26_`) | Pre-existing | Report sequence jumps from 25 to 27; a prior-session numbering slip. | No action — cosmetic, out of this review's scope |

## Summary

| Priority | Count |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 4 |
| Low | 4 |
| **Total** | **12** |

No item in this register requires new generation-layer architecture, ICAM changes, or new business logic to be invented without confirmation. Every Critical/High item's remediation path is either (a) a business/data decision outside this layer, or (b) natively scoped to Package Assembly/future milestones.
