# Reviews Decision Log — reviews.xml Generator (Milestone 6F)

Authoritative reference for every workflow-reconstruction decision this
milestone made. reviews.xml is, by a wide margin, the least
mechanically-derivable of the 4 generators built so far — see
`27_MILESTONE_6F_REVIEWS_XML_GENERATOR_REPORT.md` §0 for the central
finding this whole log is organized around: the real reference
packages' richest content was manually curated from raw correspondence
logs, and the corresponding ICAM fields are confirmed always
empty/`None` on all 3 samples. Every decision below either implements
what the ICAM *does* carry, or explains precisely why something it
doesn't carry was diagnosed rather than fabricated.

## Round reconstruction

| Decision | Reason | Evidence |
|---|---|---|
| Round resolution reuses Milestone 6E's `RoundIndex` unchanged — a block's `review-version` is matched against `RoundInfo.label` by exact string equality only | Explicit milestone instruction: "use the corrected transformation output from Milestone 6E. Do not introduce additional round inference." | — |
| A `review-version` with no matching `RoundInfo` entry is diagnosed (`WARNING`) and sorted after every resolved round, never dropped | Same reasoning as `manifest_xml`'s identical defensive pattern (Milestone 6D) — a genuinely unresolvable round must never silently disappear | `test_unresolved_round_label_sorted_last_and_diagnosed` |
| **Known, inherited limitation, not fixed here**: `RoundInfo.label` is confirmed `"Original"` on every `<article-version>` element in all 3 real samples (even ones representing much later revision/resubmission snapshots) — it never discriminates a "latest round" that corresponds to the physical `files/<Round>/` folder convention `ReviewerScorecard.round_label`/`DeclineReason.round_label`/`DecisionDraft.round_label` actually use | Already documented as a confirmed, unfixed architectural finding in Milestone 6E §1.4/§8, explicitly flagged there as "reviews.xml is potentially the *most* sensitive generator to this gap" — reconfirmed here, not re-litigated | Every reviewer scorecard/decline/decision `round_label` observed in real ICAM data is `"Original"` or `"R1"`; every `RoundInfo.label` observed is `"Original"` only |
| Chronological ordering (BR-123) is: rounds ascending by `RoundInfo.sequence_number`; within a round, all `review-type="review"` blocks before the `review-type="decision"` block | Matches real evidence (decisions logically follow the reviews that inform them; no sample shows a decision interspersed before a review in the same round) | Direct inspection of all 3 real reviews.xml files' block ordering |

## Reviewer mapping

| Decision | Reason | Evidence |
|---|---|---|
| One `review-type="review"` block per `ReviewerScorecard` (completed) and per `DeclineReason` (declined/terminated) — the union of both collections is the full per-round reviewer roster | `ReviewOutcomeStatus.COMPLETED` is the only value the classifier ever actually assigns to a `ReviewerScorecard`; declined/terminated reviewers are represented as a *separate* `DeclineReason` record with no scorecard at all — there is no single unified "reviewer roster" collection in the ICAM | Confirmed via direct inspection of `custom_meta_classifier.py::classify()`: `outcome_status=ReviewOutcomeStatus.COMPLETED` is hard-coded at every `ReviewerScorecard` construction site |
| A `ReviewerScorecard` whose `outcome_status` is *not* `COMPLETED` (a structurally possible but never-currently-produced state) is defensively rendered as status-only, using `outcome_status.value` as the status text | Forward-compatible with the enum's own full vocabulary (`DECLINED`/`TERMINATED`/`PENDING`) without requiring a second code path if the classifier is ever extended to set them | `test_non_completed_outcome_status_renders_as_status_only` (synthetic — never exercised by real data, since only `COMPLETED` is ever produced today) |
| `ReviewerScorecard.answers` (the `QN_*` Q&A pairs) is the one substantive, real, non-fabricated content rendered for a completed review — formatted as `"QN_01: Yes; QN_02: No; ..."` inside a single `review-item-type="comments"` item | This is the *only* populated content field on a completed scorecard in any of the 3 real samples; `overall_recommendation` is confirmed always `None`. Rendering the raw answers (rather than nothing) satisfies "only emit information supported by the ICAM" without pretending to have a recommendation/comments split the ICAM doesn't carry | `overall_recommendation is None` confirmed 3/3 in `golden_baseline/*/03_icam.json` |
| **Not attempted**: splitting `ReviewerScorecard.answers`/comments into author-facing vs. editor-confidential channels (BR-104) | No ICAM field carries a channel/confidentiality signal at the per-answer or per-comment level — inventing a split would require guessing which content is confidential | BR-104's real evidence (pkg2/3's `attended-for`/`is-confidential` attributes) has no ICAM-side source data to derive from |
| `DeclineReason.reason_text` is used verbatim as the status-only review-item's content — never rewritten into a synthesized status phrase like `"Terminated - Auto Unassigned"` | BR-107 itself warns against hard-coding one literal wording; `DeclineReason` has no field distinguishing "declined" from "terminated" at all, so guessing which applies would violate BR-125/this milestone's "never guess" instruction even before considering exact wording | `DeclineReason` field list confirmed: `round_label`, `reviewer_name`, `reason_text` only — no status enum |
| Reviewer/editor names are rendered via `<string-name>` (unsplit), never `<name><surname>/<given-names></name>` | `ReviewerScorecard.reviewer_name`/`DeclineReason.reviewer_name` are raw, single strings (sometimes with a baked-in suffix, e.g. `"Pu-Hong Zhang (Reviewer)"`) — no structured components exist to split. Reuses `raw_xml/generator.py`'s own established pattern for exactly this situation (`Contributor.full_name_raw` → `<string-name>`) rather than inventing a name parser | Verified by reading `raw_xml/generator.py`'s contributor-rendering code before writing this generator's own |

## Editor mapping

| Decision | Reason | Evidence |
|---|---|---|
| An `editor`/`associate-editor` `<contrib>` is only ever emitted when `DecisionDraft.editor_name`/`.associate_editor_name` is non-`None` | Never fabricate a contributor from nothing; BR-113's `contrib-type` vocabulary is honored exactly, but only when real identity data exists | `test_populated_editor_name_produces_editor_contrib_and_suppresses_diagnostic` |
| **Confirmed, diagnosed limitation**: on all 3 real samples, `editor_name`/`associate_editor_name`/`decision_date` are always `None` — so no editor/associate-editor `<contrib>` and no decision `<date>` is ever emitted against real data today, even though the real reference packages clearly name the editor (e.g. "Karin Jandeleit-Dahm", "Michael Ryan") | That identity only exists as free text *inside* `DecisionDraft.decision_text` (e.g. "...Yours sincerely, Karin Jandeleit-Dahm, Clinical Science") — parsing a name out of a decision letter's closing signature would require inventing free-text extraction logic never evidenced or approved | Direct inspection of `golden_baseline/*/03_icam.json`: `editor_name`/`associate_editor_name`/`decision_date` are `null` for every `DecisionDraft` in all 3 samples |
| `DecisionDraft.decision_text` is included verbatim as the sole decision review-item content; BR-110's generated summary sentence (e.g. "Send for major revisions. Decision letter issued \<date\> by Editor \<name\>...") is never synthesized | Same reasoning as above — the summary sentence requires exactly the free-text-derived facts (outcome classification, editor name, date) that have no structured ICAM source | Real evidence's own summary sentences are confirmed compositional/non-templated (BR-110's own text: "not a single fixed template string byte-for-byte across packages") — even the *real* files don't have one mechanical formula to imitate |

## Chronology

| Decision | Reason | Evidence |
|---|---|---|
| No `<date>` element (`assigned`/`due`/`submitted`/decision date) is ever emitted | `ReviewerScorecard.assigned_date`/`.due_date`/`.submitted_date` and `DecisionDraft.decision_date` are confirmed always `None` on all 3 real samples — BR-125 forbids fabricating any of them | Confirmed via `golden_baseline/*/03_icam.json` inspection; also documented in `ReviewerScorecard`'s own model docstring ("this remains `None` on all 3 real reference packages today... never guessed or defaulted") |
| Within-document ordering (BR-123) relies solely on `RoundInfo.sequence_number`, never a per-reviewer/per-event timestamp | No timestamp field exists anywhere on `ReviewerScorecard`/`DeclineReason`/`DecisionDraft` to order by — round-level ordering is the finest granularity the ICAM supports | Same field-list confirmation as above |

## Contributor resolution

| Decision | Reason | Evidence |
|---|---|---|
| `contrib-type="reviewer"` for every scorecard/decline-based `<contrib>`; `contrib-type="editor"`/`"associate-editor"` only from `DecisionDraft` when a name exists | Matches BR-113's observed vocabulary exactly; never emits a 4th, unobserved role for reviews.xml's own contrib-group (distinct from `ContribType`'s larger, article.xml-facing enum which includes handling/academic/guest editor roles Milestone 5C added — those roles have no reviews.xml-specific evidence and are not applied here) | BR-113's own text: "`contrib-type` Values Observed: `reviewer`, `editor`, `associate-editor`" |
| A `ReviewerScorecard`/`DeclineReason` with no name **and** no email is diagnosed (`WARNING`), not raised | An identity-less record with no other real content (no recommendation) is a data-quality gap worth surfacing, but not one severe enough to halt generation | `test_scorecard_with_no_identity_and_no_recommendation_is_diagnosed_not_raised` |
| A `ReviewerScorecard` with a populated `overall_recommendation` **and** no reviewer identity raises `ReviewDataIntegrityError` | Matches the exact scenario the LLD's own `ReviewDataIntegrityError` docstring names: "a recommendation with no reviewer identity" — this is the one case severe enough to stop generation for this article, per 11_LLD_02 §4.7's stated error-handling contract | `test_scorecard_with_recommendation_but_no_identity_raises_review_data_integrity_error` — synthetic only; never triggered by real data (no sample has a populated `overall_recommendation` at all) |

## Decision-state mapping

| Decision | Reason | Evidence |
|---|---|---|
| No decision "outcome" classification (Accept / Major revisions / Minor revisions / Reject) is derived from `decision_text` | The real files' decision review-item `<title>` embeds this classification (e.g. "Editorial Decision: Accept with minor revisions") but it is manually curated, not templated — deriving it would require classifying free text into an outcome category, which is inventing NLP-style logic never evidenced or approved | Direct inspection: the canonical (pkg2/3) sample's decision title varies per-instance and is clearly composed from reading the letter, not extracted via any discoverable rule |
| The decision review-item's `<title>` is a fixed, config-driven constant (`"Editorial Decision"`), not a per-instance generated string | Honest about what this generator can and cannot derive — a static title costs nothing and never fabricates an outcome classification | — |

## Ambiguity handling (ADR-004 / ADR-005)

| Decision | Reason | Evidence |
|---|---|---|
| Both ADR-004 (duplicate correspondence) and ADR-005 (extended scope: author-suggested reviewers, editor reassignment, production queries) are implemented as **structurally ready, feature-flag-gated** code paths reading `WorkflowLog.events`, even though 0 real events exist on any of the 3 samples today | The model classes (`WorkflowLog`, `CorrespondenceEvent`, `ActorRole`, `CorrespondenceChannel`, `CorrespondenceKind`) and the 2 feature flags (`FeatureFlagsConfig.reviews_include_duplicate_correspondence`/`.reviews_extended_history_scope`) already existed, pre-provisioned specifically for this milestone, before this milestone began — implementing their consumption is using already-approved ICAM surface area, not inventing a new business rule. ADR-013's own precedent ("implement generically now, validate against a synthetic fixture as an interim substitute for real evidence") directly supports this approach for an approved-but-unevidenced path | `FeatureFlagsConfig`/`WorkflowLog`/`CorrespondenceEvent`/`ActorRole`/`CorrespondenceChannel`/`CorrespondenceKind` all pre-existed this milestone (confirmed via `model/article.py`/`model/enums.py`/`config/schema.py` inspection before writing any new code) |
| An unsupported `CorrespondenceKind` value (anything outside `REVIEW_COMMENT` and the 4 extended-scope kinds) is diagnosed (`WARNING`) and skipped, never raised | Defensive-only; the enum is closed today so this can only occur if a future extraction-layer change adds a new kind without a corresponding reviews.xml rendering rule — surfacing it as a diagnostic (not silently dropping, not crashing) is the safest default | `test_unsupported_event_kind_is_diagnosed_and_skipped` |

## Notes for the transfer.xml milestone and the recommended Generator Suite Review

- **`WorkflowLog.events` is always empty today** — if transfer.xml or a future extraction-layer milestone ever populates it, `review_builder.build_extended_history_reviews` is already written to consume it correctly (feature-flag-gated, per-event-kind dispatch) with no further reviews.xml code change required.
- **The `RoundInfo`/physical-round-folder semantic mismatch (Milestone 6E §1.4/§8) now spans 3 of 4 generators** (article.xml's BR-066, manifest.xml's file ordering, and reviews.xml's BR-123 chronology) — the user's own recommended Generator Suite Review is the right venue to decide whether this is worth a business-confirmed fix before transfer.xml/packaging, rather than each generator continuing to work around it independently.
- **The `"CDATA"` `review-type` defect is confirmed in 2 of 3 real packages** (not 1, as BR-099's text implies) — worth updating the Business Rule Book's own text at the next opportunity, though this generator's behavior is unaffected either way (it never emits the literal, regardless of how many real samples do).
