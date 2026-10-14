# Architecture Review — Pre-XML-Generation Checkpoint

**Role:** Lead Software Architect review, per the standing recommendation issued at Milestone 5B approval. **No production code was written or modified for this review.** Every finding below is traced to either a direct code citation (Milestones 1–5B, all approved), the approved baseline documents (Business Rule Book, ADRs, LLD), or direct inspection of the 3 real hand-built `Output/*.zip` packages (read-only — never modified).

**Scope of "current pipeline"**: Input (Milestone 2) → XML Parsing (Milestone 3) → Metadata Extraction (Milestone 4) → Metadata → ICAM Transformation (Milestone 5A/5B). **Scope of "generators"**: `raw_xml`, `article_xml`, `manifest_xml`, `reviews_xml`, `transfer_xml` — none of these exist yet; every statement about what a generator "would need" is a projection from the Business Rule Book + LLD §4.7 + direct inspection of the 3 real `Output/*.zip` samples, not a claim about existing code.

---

## 1. Executive Summary

**Verdict: the pipeline is sufficient to begin XML generator implementation without an architectural redesign — with one qualification.** The layering (`model ← extraction ← transform`), the ICAM's shape, the exception hierarchy, and the diagnostics-not-exceptions discipline all hold up under this review; nothing found here requires renaming a package, reversing an import direction, or replacing a design pattern already approved through Milestone 5B.

The qualification: **direct inspection of the 3 real `Output/*.zip` packages surfaced a materially larger reviewer/editor/reviews.xml data requirement than the ICAM currently models.** `article.xml` contains `contrib-type="editor"`, `"associate-editor"`, and `"reviewer"` entries (with CRediT contribution roles, review-history status footnotes, reviewer institutional affiliations, and reviewer academic suffixes) that the current ICAM has no field for — `ArticleMeta.contributors` only carries authors (`ContribType` is a single-member enum, by Milestone 5A design). `reviews.xml` requires per-review `assigned`/`submitted`/`due` dates that `ReviewerScorecard` does not carry at all. These are **additive gaps** — nothing already built is wrong or needs to be torn out — but they are real, they were not visible until real output samples were inspected line-by-line (which no prior milestone's task explicitly required), and they should be resolved with a scoped extension before `article_xml`/`reviews_xml` generation begins, not discovered mid-implementation.

A second, independently-confirmed gap: real `article.xml` also carries a full JATS `<abstract>` block, present in the source Kriyadocs XML (`<abstract>` under `article-meta`, verified directly against parsed real-sample data) but never read by any Milestone 4 extractor or held by any ICAM field — a straightforward, confirmed extraction-layer gap distinct from the reviewer/editor one, and likely the cheaper of the two to close (a single new field, following the same additive pattern used repeatedly through Milestone 5B, rather than a new contributor-role concept).

Every other generator's data dependencies (`raw_xml`, `manifest_xml`, `transfer_xml`) are fully satisfiable from the ICAM as it exists today. Two configuration schemas that later generators will need (`article-type-mapping.yaml`, `item-type-mapping.yaml`) were never created, even as empty schema stubs, in Milestone 1's otherwise-complete config-schema set — a gap worth closing before Milestone 7/8, not a design defect.

**No recommendation in this document proposes an architectural change.** Every finding is either "build this additive extension when its generator milestone starts" or "confirm this business question," consistent with the instruction not to invent solutions or modify the architecture without a compelling issue — and no issue found here is compelling enough to justify a redesign.

---

## 2. ICAM Completeness Matrix

Every field on every one of the 21 ICAM types (`meca_engine.model.article`), mapped to the generator(s) that would consume it, per the Business Rule Book + LLD §4.7 + direct `Output/*.zip` inspection.

### 2.1 `ArticleIdentity`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `article_id` | manifest (filenames), transfer (auth code building block via publisher_id, not article_id itself), all 5 (filename pattern `<ArticleID>_*.xml`, BR-048/073/088/122/139/151) | Used, not duplicated |
| `publisher_id_value` | manifest (BR-080 fixed-item interpolation), transfer (`security/authentication-code`, BR-136) | Used |
| `doi_article_id_value` | article (`doi_builder` input, BR-058) | Used — **not** copied to output directly; generator-computed |
| `journal_id` | *(none directly)* — a config lookup key only | **Configuration-driven field**: exists solely so a generator/config layer can resolve `JournalConfig`/`PublisherConfig`; never appears in any output XML itself |
| `source_object_key` | *(none)* | Traceability/logging only, per its own docstring — confirmed unused by any generator |

### 2.2 `JournalMeta`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `journal_title` | raw (copied), article (BR-060, copied with ids stripped — trivial here, no ids), transfer (`publication/publication-title`, BR-132/135) | Used |
| `issn_ppub` / `issn_epub` | raw (copied), article (confirmed present under `journal-meta/issn`, both `ppub`/`epub`, in the real sample) | Used |
| `publisher_name` | raw (copied), article (confirmed present under `journal-meta/publisher/publisher-name` in the real sample) | Used — the real sample's `article.xml` `journal-id[@journal-id-type=publisher-id]` value (`"cs"`) is lower-case, matching `ArticleIdentity.journal_id`'s own ADR-028 lower-casing — worth noting `JournalMeta` itself has no field for the journal-id text (that lives on `ArticleIdentity`), so `article_xml` would need to read both types to reconstruct this one `journal-meta` block |
| `abbrev_titles` | raw (copied) | article.xml's real sample **does** copy both `abbrev-journal-title` entries verbatim (confirmed) |

### 2.3 `CorrespEmail`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `email` | article (`author-notes/corresp`, BR-061), transfer (`transfer-source`/`publication` contact email, BR-130) | Used |
| `display_text` | *(none confirmed)* | **Populated field with no confirmed consumer**: the real `article.xml` sample's `<corresp>` blocks show `"Yun-Long Zhang, <email>...</email>"` — the author's *name*, not free display text — `contributor_transformer.build_contributors_and_affiliations` never sets this field (always `None`); if a generator needs the corresponding author's *name* alongside the email, today's `CorrespEmail` has nowhere non-`None` to get it from except re-deriving it by matching `email` back against `ArticleMeta.contributors` — see Gap Analysis §6.3 |

### 2.4 `Affiliation`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `model_key` | article (as the basis for a generator-synthesized clean `id="aff{N}"` string — confirmed real-sample pattern, §4) | Used indirectly (never emitted as a raw int) |
| `institution` | article (`<institution>` copied) | Used — real samples show `institution`/`country`/`addr-line` as **separate** JATS sub-elements the generator must re-decompose; `Affiliation.institution` today holds either the structured value or (for all 3 real samples) `AffiliationRecord.raw_text` — an **undifferentiated flattened string** ("Department of Cardiology, First Affiliated Hospital..., Dalian, 116011, China") that `article_xml` cannot cleanly re-split into `<institution>`/`<addr-line>`/`<country>` sub-elements without further parsing. **This is a real gap** — flagged in §6.1. |
| `country` | article (`<country>`) | Same caveat as `institution` |

### 2.5 `Contributor`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `surname` / `given_names` | article (`<name>`), reviews (`<contrib-group><contrib>` per BR-112) | Used |
| `contrib_type` | article (`@contrib-type`) | **Currently always `AUTHOR`** — real `article.xml` needs `"editor"`/`"associate-editor"`/`"reviewer"` values too (BR-113) that no ICAM `Contributor` instance ever carries — see §6.1, the review's central finding |
| `email` | article, reviews, transfer (via `CorrespEmail`, not this field directly) | Used |
| `orcid` | article (`<contrib-id contrib-id-type="orcid">`) | Used |
| `affiliation_keys` | article (`<xref ref-type="aff">`) | Used |
| `is_corresponding` | article (`corresp="yes"` + `<xref ref-type="corresp">`), identity/transfer indirectly (via `ArticleMeta.corresponding_emails`) | Used |

**Unmodeled real-sample `Contributor`-adjacent data** (found in `article.xml`, no ICAM field exists for any of these today): `equal-contrib="yes"` flag + `<xref ref-type="equal">`; CRediT contribution-role footnotes (`fn fn-type="con"`, e.g. "Conceptualization", "Writing – original draft") per author; footnote cross-references beyond affiliation/corresp (`xref ref-type="fn"`).

### 2.6 `ArticleCounts`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `word_count` / `ref_count` / `fig_count` | article (`<counts>`, part of BR-060's copied set) | Used — real `<counts>` also has `digest-count`/`decision-count`/`author-response-count`/`table-count`/`equation-count`/`page-count` (all `0` or small ints in the sample) that **no ICAM field captures**; low-impact (all `0` in real data) but a genuine omission if `article.xml` is meant to copy the full `<counts>` block, not a curated subset |

### 2.7 `HistoryDates`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `received` / `revision` / `accepted` | raw (BR-047, direct copy), article (BR-060, copied with ids stripped), reviews (BR-115/156, cross-consistency check) | Used — `revision` is populated by `transform.coordinator` looking for `date_type == "revised"`; real sample's `<history>` uses `date-type="received"`/`"accepted"` only (no `"revised"` observed) — not a bug, just unexercised on real data so far |

### 2.8 `ArticleMeta` (remaining fields)

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `display_channel_subject` | article (input to article-type mapping, ADR-001) — **not** copied verbatim; BR-057 says `article-type` is *always* `"Original Study"` in the observed samples, making this field's actual generator use an open question (§6.2) | Config-driven mapping input |
| `article_title` | raw, article (both copy verbatim) | Used |
| `contributors` | see §2.5 | Used, incompletely (authors only) |
| `affiliations` | see §2.4 | Used |
| `corresponding_emails` | transfer (`BR-130`), article (`author-notes/corresp`) | Used |
| `heading_subjects` | raw, article (`article-categories/subj-group[@subj-group-type=heading]`, copied) | Used |
| `copyright_statement` | raw (BR-045), article (BR-062, copied verbatim) | Used |
| `copyright_year` | raw, article (part of `<permissions>`, copied) | Used |
| `funding` | raw, article (BR-060, `funding-group`, copied with ids stripped) | Used — confirmed sufficient: the real sample's `article.xml` output renders `funding-group` as one flat `<funding-statement>` sentence (not a decomposed `award-group`/`funding-source`/`award-id` structure), matching `ArticleMeta.funding: tuple[str, ...]`'s current shape exactly. (The *source* Kriyadocs XML's internal `award-group` nesting, seen during Milestone 5B's real-data inspection, is Kriyadocs' own working structure — it does not need to survive to article.xml's output.) |
| `keywords` | raw, article (`kwd-group`, copied) | Used |
| `counts` | see §2.6 | Used |
| `history_dates` | see §2.7 | Used |
| *(no field)* | article (`<abstract><p>...</p></abstract>`) | **Missing field** — real `article.xml` carries a full `<abstract>` block under `article-meta`, distinct from (and not byte-identical to) the "Article Summary" custom-meta entry. No Milestone 4 extractor reads a JATS `<abstract>` element at all; `ArticleMeta` has no field for it. See §6.11. |

### 2.9 `BodyFragment`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `raw_xml_fragment` | raw (BR-043, verbatim `<body>` copy) | Used — **not** consumed by `article_xml` (BR-072: article.xml never includes `<body>` at all) — confirms the Milestone 5A design decision to keep this opaque was correct; **duplicated information**: none — this is the one field intentionally *not* shared across generators |

### 2.10 `FormAnswerBag` / `FormAnswerEntry`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `entries` (open-vocabulary key→values) | article (BR-071's deny-list: everything *not* explicitly pruned passes through unchanged into article.xml's own `custom-meta-group`) | Used — this is the **primary mechanism** by which `article_xml` would access "License Type" (BR-063), "Article Language", and every other unclassified business field; a **string-keyed lookup** (`form_answers.get("License Type")`), not a strongly-typed field — see §6.2 |

### 2.11 `FileEntry` (inside `CustomMetaStore`, pre-resolution)

Not directly generator-facing — consumed only by `file_resolver` to produce `ResolvedFile`. No gap.

### 2.12 `ReviewerScorecard`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `round_label` | reviews (BR-102, one `<review>` per reviewer×round) | Used |
| `reviewer_name` / `reviewer_email` | reviews (`contrib-group`, BR-112) | Used |
| `outcome_status` | reviews (BR-106, status-only for declined/terminated) | Used — **enum vocabulary mismatch found**: `ReviewOutcomeStatus` has `COMPLETED`/`DECLINED`/`TERMINATED`/`PENDING`; the real `article.xml` reviewer-history footnote text uses `"completed"`/`"rejected"`/`"terminated"` — `"rejected"` does not textually match any current enum member's `.value` (`"declined"`) — a generator would need its own mapping table regardless, so this is not blocking, but the enum's naming should not be assumed to be the literal output vocabulary (§6.4) |
| `answers` (QN_* pairs) | reviews (a candidate source for `review-item[@review-item-type=comments]` free text — **unconfirmed**, see §6.3) | The real `reviews.xml` sample's actual reviewer comment text is a long free-form paragraph, not `QN_*`-keyed Q&A pairs — whether `answers` is the right source, or whether a different, currently-unclassified custom-meta key holds this free text, is unresolved |
| `overall_recommendation` | reviews (`review-item[@review-item-type=recommendation]`, BR-103) | Used |

**Missing fields, confirmed by direct `reviews.xml` inspection**: `assigned_date`, `submitted_date`, `due_date` — every real `<review>` block carries all three (BR-114); `ReviewerScorecard` has none of them today.

### 2.13 `DecisionDraft`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `round_label` | reviews (`<review review-type="decision">`, BR-109) | Used |
| `decision_text` | reviews (BR-110, combined with a generated summary sentence) | Used |
| `editor_name` / `associate_editor_name` | reviews (identity of the decision-maker, BR-112) | **Currently always `None`** on real data — `custom_meta_classifier._build_decision_draft` never populates these; the source `submission-decision` custom-meta entry (a *different* key from `Decision Draft`) carries `data-email`/`data-role="editor"` attributes that could supply this, but the classifier does not currently cross-reference the two — see §6.2 |
| `decision_date` | reviews (BR-114/115/156) | **Currently always `None`** — no source attribute for it was identified on real "Decision Draft" entries (`data-version`/`data-type`/`data-draft-name`/`data-decision` were the only attributes found; no timestamp) — may exist on the sibling `submission-decision` entry (`data-time`), again requiring cross-referencing not currently performed |

### 2.14 `DeclineReason`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `round_label` / `reviewer_name` / `reason_text` | reviews (BR-106/107, status-only review-item; the real `reason_text` itself doesn't appear verbatim in `reviews.xml`'s sample output — the sample uses a generic templated sentence instead) | Used, though the real sample suggests generators may synthesize their own status sentence rather than surfacing `reason_text` verbatim — an open question, not a defect |

### 2.15 `CorrespondenceEvent` / `WorkflowLog`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| All fields | reviews (BR-111/116-119, correspondence-type review-items — ADR-005 extended-history scope) | **Currently always empty on all 3 real samples** — confirmed in Milestone 5B (no custom-meta entry combines a real actor/role/timestamp *and* non-empty free text). If ADR-005's extended-history scope is ever turned on for real data, this remains the correct, already-built destination — no redesign needed, just population once/if source data supports it. |

### 2.16 `RoundInfo`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `label` | manifest (BR-082, path segment), reviews (per-round grouping) | Used |
| `sequence_number` | *(none directly)* — used only to compute `is_latest` | Internal ordering key only |
| `is_latest` | article (BR-066/143, "latest round wins" for custom-meta collisions), manifest (BR-083, "latest round first" ordering) | Used |

### 2.17 `ResolvedFile`

| Field | Consuming generator(s) | Notes |
|---|---|---|
| `round_label` | manifest (path prefix `files/<Round>/`) | Used |
| `category` | manifest (`item_type_mapper` input, BR-078) | Used — **configuration-driven**: needs `item-type-mapping.yaml`, which does not exist yet (§6.6) |
| `original_filename` | manifest (`xlink:href` filename component, BR-013) | Used |
| `staged_physical_path` | packaging (Milestone 12, to physically copy the file — not a generator concern at all) | Used downstream of generation, not by a generator |
| `checksum` | *(no generator)* — a packaging/validation concern (BR-012's byte-identical copy verification) | Not generator-facing |
| `size_bytes` | *(no generator; BR-021 explicitly "available but currently unused downstream")* | Confirmed unused, matching the rule's own framing |
| `media_type` | manifest (`instance/@media-type`, BR-081) | Used |

### 2.18 Summary of Field-Level Findings

- **Unused fields** (present, no confirmed generator consumer): `ArticleIdentity.source_object_key`, `RoundInfo.sequence_number` (internal only), `ResolvedFile.checksum`/`size_bytes` (packaging/validation, not generation).
- **Missing fields** (a generator needs data the ICAM has nowhere to hold): `ReviewerScorecard.{assigned_date,submitted_date,due_date}`; a `Contributor`-shaped record for editors/associate-editors/reviewers (CRediT roles, equal-contrib, review-history status, reviewer institutional affiliation, academic suffix); possibly `DecisionDraft.decision_date`'s real source.
- **Duplicated information**: none found beyond the already-documented, deliberate `JournalMetadata.doi_related_ids` (Milestone 4) convenience duplication, which is an *extraction*-layer convenience, not an ICAM one — the ICAM itself has no duplicated field.
- **Optional fields used correctly**: every `str | None` field observed either has a real value on at least one sample or is honestly `None` when the source lacks the data (e.g., `JournalMeta.issn_ppub` when a journal has no print ISSN) — no optional field was found masking a mapping bug.
- **Configuration-driven fields**: `ArticleIdentity.journal_id` (config lookup key only), `ArticleMeta.display_channel_subject` (article-type mapping input), `ResolvedFile.category` (item-type mapping input), `FormAnswerBag` entries keyed by `"License Type"` (license-template mapping input) — all real, all pointing at config files that either don't exist yet (`article-type-mapping.yaml`, `item-type-mapping.yaml`) or exist only as an empty schema stub pending business confirmation (`license-templates.yaml`).

---

## 3. Business Rule Traceability Matrix

160 rules across 10 categories (`01_BUSINESS_RULE_BOOK.md`). Full per-rule detail is impractical to reproduce in this document without duplicating the entire Business Rule Book; the table below gives an accurate implementation-status **count per category**, followed by every individually notable rule (fully implemented ahead of its "natural" milestone, partially implemented, or carrying a known conflict/ambiguity the Business Rule Book itself flags).

| Category | Rules | Implemented | Partial | Not Yet (generator/packaging/validation doesn't exist) | N/A (observation only, nothing to implement) |
|---|---|---|---|---|---|
| A. Ingestion & Source Structure | BR-001–010 | 6 | 1 | 1 | 2 |
| B. File Inclusion/Copy/Exclusion | BR-011–025 | 9 | 2 | 4 | 0 |
| C. Media-Type & Extension Mapping | BR-026–035 | 10 | 0 | 0 | 0 |
| D. `raw.xml` Generation | BR-036–050 | 0 | 0 | 15 | 0 |
| E. `article.xml` Generation | BR-051–075 | 0 | 0 | 25 | 0 |
| F. `manifest.xml` Generation | BR-076–095 | 0 | 0 | 20 | 0 |
| G. `reviews.xml` Generation | BR-096–125 | 0 | 0 | 30 | 0 |
| H. `transfer.xml` Generation | BR-126–140 | 0 | 0 | 15 | 0 |
| I. Multi-Round Processing | BR-141–150 | 4 | 3 | 1 | 2 |
| J. Cross-File Consistency & Package Invariants | BR-151–160 | 1 | 0 | 9 | 0 |
| **Total** | **160** | **30** | **6** | **120** | **4** |

**Individually notable rules:**

| Rule | Status | Note |
|---|---|---|
| BR-001, BR-010 | **Fully implemented** | Milestones 2/3 (well-formedness) + Milestone 5B (`round_resolver`) |
| BR-003 | **Fully implemented** | `identity_transformer` — `article_id` passed through, never re-cased |
| BR-007, BR-011, BR-018, BR-019 | **Fully implemented** | Milestone 5B `custom_meta_classifier`/`file_resolver` |
| BR-013, BR-016, BR-017 | **Fully implemented**, extended | Milestone 5B `file_resolver` — 2 additional real-evidenced tolerance tiers beyond what BR-016/017 document (see Milestone 5B Architecture Compliance Report §1) |
| BR-025 | **Fully implemented** | Milestone 5B `file_resolver._log_unreferenced_physical_files` (ADR-016) |
| BR-026–035 | **Fully implemented** | Milestone 5B `config/media-types.yaml` + `file_resolver._resolve_media_type` |
| BR-008 | **Partial** | Milestone 4's `WorkflowMetadata` extraction confirms the internal workflow/log data *exists* and is correctly *not* copied anywhere in the ICAM — but the actual "never copied verbatim into raw.xml" guarantee can only be fully confirmed once `raw_xml` generation exists and is tested against it |
| BR-021 | **Partial** | `declared_size_bytes` (custom-meta) and `size_bytes` (actual, computed) both exist on separate ICAM types (`FileEntry` vs. `ResolvedFile`) but are never cross-validated against each other — that cross-check is Validation Engine scope (BR-021 itself says "currently unused downstream", so this is not a defect, just unexercised) |
| BR-014 | **Partial** | Milestone 2's discovery module flags anomalous/zero-byte/OS-artifact files structurally; whether "browser-cache artifacts" specifically are excluded is a byproduct of BR-011 (custom-meta is authoritative — a file simply isn't referenced) rather than a dedicated exclusion rule |
| BR-020 | **Not addressed** | The `[object Object]` source-system-artifact observation has no corresponding filter/handling anywhere in `custom_meta_classifier` — if this literal string ever appears in a `name`/`path` named-content value on a real package, it would flow through unfiltered into `FileEntry` fields today |
| BR-133 | **Pre-existing, documented ambiguity** — "two candidate rules conflict" per the Business Rule Book's own text | Not something this review introduces; flagged here only because `transfer_xml` (Milestone 10) will need this resolved, and it was never resolved in Milestones 1–5B (correctly — it's a business decision, not an engineering one) |
| BR-141 | **Partial** | `round_resolver.resolve_rounds` implements the `vocab-identifier`-ordering half; it does not currently *intersect* against physically-present folder names or custom-meta-referenced rounds — no test or real-sample evidence has yet exercised a case where these three sets disagree |
| BR-149 | **Fully implemented, confirmed against real data** | CS-2025-8493_C's real 3-`article-version` result is direct evidence `round_resolver` does not assume 2 rounds |
| BR-159 | **Fully implemented** | Milestone 3 `xml_loader` (`defusedxml`, no source mutation anywhere in the pipeline) |
| Every D/E/F/G/H rule (raw/article/manifest/reviews/transfer generation, 105 rules) | **Not yet implemented** | No generator code exists; this is the expected, correct state at this checkpoint — the ICAM Completeness Matrix (§2) is the relevant readiness signal for these, not this matrix |
| Every J rule except BR-159 (9 rules) | **Not yet implemented** | Package-level invariants require packaging (Milestone 12) and/or the Validation Engine (Milestone 11) to exist |

**No implemented rule was found to contradict the Business Rule Book.** Every "Not Yet" rule is not yet applicable because its owning component doesn't exist — none represents a rule that was skipped, deferred without documentation, or silently violated.

---

## 4. Generator Dependency Matrix

For each generator: every ICAM field it would need, per the Business Rule Book + LLD §4.7 + direct `Output/*.zip` inspection. **✓** = fully available today. **⚠** = available but with a caveat (see referenced section). **✗** = not available in the ICAM at all today.

### 4.1 `raw_xml` (BR-036–050)

| Dependency | Status |
|---|---|
| `ArticleModel.body_fragment.raw_xml_fragment` | ✓ (verbatim `<body>` copy) |
| `identity`, `journal_meta`, `article_meta` (front-matter re-emission) | ✓ |
| `custom_meta` — **full, unpruned `custom-meta-group` reconstruction** (BR-042: "retains 100% of custom-meta-group") | ⚠ — `custom_meta_classifier` re-shapes custom-meta into typed collections; reconstructing the *original* `<custom-meta>` XML element structure (including the ~65% of entries with no `meta-name` at all, per Milestone 5B's own finding) from the classified `CustomMetaStore` is not a lossless round-trip today. Milestone 4's raw `ExtractionBundle.custom.entries` (untouched, still available) is the more direct source for this specific generator's needs — worth confirming which input `raw_xml` should actually read from before implementation begins. |
| Original `id="uuid"` attributes on front-matter elements (BR-039) | ⚠ — preserved faithfully inside `body_fragment` (attributes are serialized verbatim), but front-matter (`journal-meta`/`article-meta`) is reconstructed fresh from typed ICAM fields, which never retained the original ids — `raw_xml` would need those original ids from *somewhere* if BR-039's "retains every source id" applies to front-matter too, not just body |

### 4.2 `article_xml` (BR-051–075)

| Dependency | Status |
|---|---|
| `identity.doi_article_id_value` (DOI formula input) | ✓ |
| `journal_meta`, `article_meta.{article_title, heading_subjects, copyright_statement, copyright_year, funding, keywords, counts, history_dates}` | ✓ |
| `article_meta.contributors` (authors) | ✓ |
| `article_meta.contributors` (editors/associate-editors/reviewers) | ✗ — see §2.5, §1 |
| `article_meta.affiliations` (structured institution/country) | ⚠ — see §2.4 (often only `raw_text`) |
| `custom_meta.form_answers` (License Type lookup, BR-063) | ✓, string-keyed — see §2.10 |
| `custom_meta.{file_entries pruning, reviewer_scorecards exclusion, decision_drafts exclusion, decline_reasons exclusion}` (BR-066–071 deny-list) | ✓ — the classified `CustomMetaStore` already separates these out of `form_answers`, so "don't include them in article.xml's custom-meta" is nearly free (they're not in `form_answers` to begin with) |
| `rounds` (latest-round-wins for file-category collisions, BR-066/143) | ✓ |

### 4.3 `manifest_xml` (BR-076–095)

| Dependency | Status |
|---|---|
| `identity.publisher_id_value` (fixed-item interpolation, BR-080) | ✓ |
| `resolved_files.*` (category, original_filename, media_type, round_label) | ✓ |
| `rounds` (latest-round-first ordering, BR-083) | ✓ |
| Item-type lookup (`category` → manifest item-type, BR-078) | ⚠ — needs `item-type-mapping.yaml`, which does not exist (§6.6) |

### 4.4 `reviews_xml` (BR-096–125)

| Dependency | Status |
|---|---|
| `custom_meta.reviewer_scorecards.{round_label, reviewer_name, reviewer_email, outcome_status, overall_recommendation}` | ✓ |
| `custom_meta.reviewer_scorecards.{assigned_date, submitted_date, due_date}` (BR-114) | ✗ — see §2.12, §1 |
| Free-text reviewer comments (`review-item-type=comments`) | ⚠ — unconfirmed source; `answers` (QN_* pairs) don't obviously match the real sample's long free-text paragraphs (§2.12) |
| `custom_meta.decision_drafts.{round_label, decision_text}` | ✓ |
| `custom_meta.decision_drafts.{editor_name, associate_editor_name, decision_date}` | ✗ — always `None` today (§2.13) |
| `custom_meta.decline_reasons` | ✓ (though real sample synthesizes its own status sentence rather than using `reason_text` verbatim — open question, not a blocker) |
| `custom_meta.workflow_log` (correspondence-type review-items, ADR-005 scope) | ✓ structurally, but always empty on real data (§2.15) |
| `rounds` (per-round grouping, BR-102/123/124) | ✓ |
| Editor/associate-editor identity as their own `contrib-group` entries (BR-112/113) | ✗ — same gap as §4.2's editor/associate-editor finding |

### 4.5 `transfer_xml` (BR-126–140)

| Dependency | Status |
|---|---|
| `identity.publisher_id_value` (auth code, BR-136) | ✓ |
| `journal_meta.journal_title` (BR-132/135) | ✓ |
| `article_meta.corresponding_emails[0]` (BR-130) | ✓ |
| `PublisherConfig.provider_name`/`JournalConfig.acronym` (config, not ICAM) | ⚠ — both schemas/loader methods already exist (Milestone 1); actual populated `config/journals/*.yaml`/`config/publishers/*.yaml` files remain intentionally absent pending business confirmation (unchanged since Milestone 1 — not a new gap, a pre-existing, documented one) |
| BR-133's acronym ambiguity | ⚠ — pre-existing, documented conflict in the Business Rule Book itself |

**Summary**: `raw_xml`, `manifest_xml`, `transfer_xml` have no missing (✗) dependencies — only caveats (⚠) already well-understood and traceable to either a config gap or an open business question. `article_xml` and `reviews_xml` share the one real missing-dependency finding of this review (editor/associate-editor/reviewer contributor data) plus their own generator-specific gaps (structured affiliation decomposition; reviewer dates).

---

## 5. Data Lineage Matrix

Tracing representative fields through all 6 stages. **Loss** = information present in an earlier stage that does not survive to a later one (not necessarily a defect — sometimes deliberate, per BR-072's body-fragment exclusion from article.xml).

| Field | Source XML | Parsed Model (M3) | Metadata (M4) | Transformation (M5B) | ICAM (M5A/5B) | Generator (planned) |
|---|---|---|---|---|---|---|
| Article title | `article-title` text | `ParsedElement` (verbatim) | `ArticleMetadata.title` | `_build_article_meta` | `ArticleMeta.article_title` | raw ✓, article ✓ — **no loss** |
| DOI source field | `article-id[@pub-id-type=doi]` | `ParsedElement` | `ArticleMetadata.identifiers` | `identity_transformer` | `ArticleIdentity.doi_article_id_value` | article (as `doi_builder` input, not copied) — **no loss**, transformation intentionally deferred |
| Contributor affiliation link | `xref[@ref-type=aff]/@rid` (source UUID-ish or `aff1`-style id) | `ParsedElement` attributes | `ContributorRecord.affiliation_ref_ids` (raw ref string) | `contributor_transformer` re-keys to `model_key: int` | `Contributor.affiliation_keys: tuple[int,...]` | article (re-synthesizes a clean `id="aff{N}"`) — **no loss of the *relationship*; the original id string itself is deliberately not retained** (by LLD design, TC-060/070) |
| Institution/country | `<institution>`/`<country>` (structured) **or** flat run-on text (all 3 real samples) | `ParsedElement` (either shape) | `AffiliationRecord.{institution,country,raw_text}` | `contributor_transformer` (falls back to `raw_text`) | `Affiliation.{institution,country}` | article — **partial loss**: once collapsed into `raw_text`, the structured institution/country/city split cannot be perfectly reconstructed by a generator (§2.4) |
| Custom-meta round hint | `path` named-content (sometimes a real round, sometimes a `_temp/<uuid>/` job id) | `ParsedElement` | `CustomMetaEntry.named_content` (verbatim path string) | `custom_meta_classifier` extracts a *hint*; `file_resolver` re-derives the *authoritative* label from the staged directory actually matched | `FileEntry.round_label` (hint) vs. `ResolvedFile.round_label` (authoritative) | manifest (uses the authoritative one) — **no loss; a deliberate correction**, documented in Milestone 5B |
| Reviewer QN_* answers | `custom-meta[@specific-use=question]` | `ParsedElement` | `CustomMetaEntry` (name=`QN_01`, attributes incl. `data-reviewer-email`/`data-version`) | `custom_meta_classifier` groups by (email, round) | `ReviewerScorecard.answers: tuple[(str,str),...]` | reviews (⚠, unconfirmed whether this is the right source for free-text comments — §2.12) — **no loss of the QN_* data itself; open question is whether it's the data reviews.xml actually needs** |
| Reviewer assigned/submitted/due dates | *(present in source, per real `reviews.xml` — exact custom-meta location not yet traced)* | — | — | — | **absent** | reviews — **confirmed loss**: this data is not carried past whatever source field holds it, because no extraction or transformation step currently looks for it |
| Editor/associate-editor identity + CRediT roles | `custom-meta[@data-user-role=editor]` (the audit-trail entries, Milestone 5B's own finding) + separate CRediT custom-meta keys | `ParsedElement` | `CustomMetaEntry` (present, unclassified — falls into `form_answers` or the unmapped no-text bucket) | *(not read by any Milestone 5B transformer)* | **absent** | article, reviews — **confirmed loss**: the raw data survives to `ExtractionBundle`/Milestone-4 output, but nothing carries it into the ICAM today |
| Abstract | `<abstract>` under `article-meta` (confirmed present in source) | `ParsedElement` (present, unused) | *(never read — no Milestone 4 area covers `<abstract>`)* | — | **absent** | article — **confirmed loss, earliest possible stage**: the data survives into the Parsed Object Model (Milestone 3 captures everything generically) but is never read out of it by any later stage |
| Body content | `<body>` subtree, JATS-tagged | `ParsedElement` tree | *(not separately re-extracted — Milestone 4 never touches body)* | `body_fragment_builder` re-serializes the parsed tree | `BodyFragment.raw_xml_fragment` | raw ✓ (article.xml deliberately excludes it, BR-072) | **Fidelity caveat, not loss**: reconstructed XML text, not the original bytes (Milestone 5B's own documented, flagged limitation) |

**Pattern across all rows**: information loss, where it occurs, is either (a) deliberate and LLD-mandated (affiliation ids, body exclusion from article.xml), or (b) confined to data that was never extracted past Milestone 4 in the first place (editor/CRediT/reviewer-dates) — **no row shows data that the ICAM successfully captured and then dropped on the floor during transformation.** Every transformation-stage loss is a "never captured" gap (Metadata layer or earlier), not a "captured then discarded" one.

---

## 6. Gap Analysis

Per the instruction: gaps only, no proposed solutions.

### 6.1 Missing mapping: editor/associate-editor/reviewer contributor data (highest impact)

`article.xml` and `reviews.xml` both require `contrib-group` entries for roles beyond author — confirmed present in all inspected real output. No Milestone 4 extractor or Milestone 5B transformer currently reads or carries this data. The likely source (`custom-meta` entries carrying `data-user-role="editor"`/`"reviewer"`/`"associateeditor"`, discovered during Milestone 5B's own custom-meta classification work) is known but not yet mapped to any structured type.

### 6.2 Ambiguous mapping: `submission-decision` vs. `Decision Draft`, and `DecisionDraft.editor_name`/`decision_date`

Two distinct custom-meta keys (`Decision Draft`, full letter text; `submission-decision`, a short label + `data-email`/`data-role`/`data-time` attributes) plausibly describe the same editorial event per round, but `custom_meta_classifier` treats them as fully independent today (one becomes a `DecisionDraft`, the other falls into `form_answers`). Whether `reviews.xml` generation needs them merged, and by what key, is unresolved.

### 6.3 Ambiguous mapping: reviewer free-text comments

`reviews.xml`'s `review-item[@review-item-type=comments]` holds long free-form paragraphs; `ReviewerScorecard.answers` holds short `QN_*` Q&A pairs. Whether the free-text lives in a different, currently-unclassified custom-meta key, or whether `answers` includes it under a key this review did not happen to sample, is unresolved.

### 6.4 Data-quality concern: `ReviewOutcomeStatus` vocabulary vs. real output text

The ICAM enum's `.value`s (`"completed"`, `"declined"`, `"terminated"`, `"pending"`) do not textually match the real sample's `reviews.xml`/`article.xml` status wording (`"completed"`, `"rejected"`, `"terminated"`) one-for-one (`DECLINED` → `"rejected"`, not `"declined"`). Not necessarily a defect (a generator can map enum→output-text explicitly), but worth confirming the enum was never assumed to be directly emittable.

### 6.5 Resolved on inspection: funding-group internal structure (no gap)

Business Rule Book BR-060 lists `funding-group` among the elements `article.xml` copies "with ids stripped." The source Kriyadocs XML's `funding-group` has deep internal nesting (`award-group`, with Kriyadocs-internal node-placement attributes), which initially looked like a potential decomposition gap. Direct inspection of the real `article.xml` **output**, however, shows `funding-group` rendered as one flat `<funding-statement>` sentence — exactly matching `ArticleMeta.funding: tuple[str, ...]`'s current shape. **No gap** — listed here only to correct an earlier working assumption during this review, not as an open item.

### 6.6 Configuration gap: two config schemas never created

`article-type-mapping.yaml` (ADR-001) and `item-type-mapping.yaml` (BR-078) have no JSON Schema under `schemas/config-schema/`, unlike every other config file (`journal`, `publisher`, `license-templates`, `media-types`, `runtime`, `feature-flags`, all of which have a schema, per Milestone 1's otherwise-complete set). Neither has a `ConfigLoader.load_*` method either (unlike `load_media_type_config`, added in Milestone 5B). This is a gap in the *foundation* config layer, not a generator-specific one — it will block `article_xml` (needs article-type-mapping) and `manifest_xml` (needs item-type-mapping) specifically.

### 6.7 Configuration gap: `license-templates.yaml` remains unpopulated

Consistent with `config/journals/`/`config/publishers/` — deliberately empty pending business confirmation (documented since Milestone 1). Not a new finding, restated here only because `article_xml`'s BR-063 license synthesis directly depends on it.

### 6.8 Data-quality concern: `[object Object]` source artifact (BR-020)

No extraction or classification code currently detects or specially handles this documented Kriyadocs source-system artifact. If it appears in a real `name`/`path` field on a future package, it would flow through unfiltered into `FileEntry`/`ResolvedFile` fields today.

### 6.9 Unresolved ADR impact: BR-133 (transfer.xml acronym ambiguity)

Pre-existing in the Business Rule Book itself ("two candidate rules conflict") — not introduced or resolved by any milestone through 5B. Restated here because it directly blocks a clean `transfer_xml` implementation decision.

### 6.10 Unresolved ADR impact: round-set intersection (BR-141)

`round_resolver` implements the `vocab-identifier`-ordering half of BR-141 but does not cross-check its result against physically-staged round folders or against which rounds custom-meta file-entries actually reference. No real sample has yet exercised a disagreement between these three sources, so this has not surfaced as a concrete bug — but it is an unimplemented half of a documented rule.

### 6.11 Missing mapping: JATS `<abstract>` (confirmed both source and output)

**Confirmed on both ends**: the source Kriyadocs XML has a genuine `<abstract>` element directly under `article-meta` (verified against `golden_baseline/CS-2025-6808/01_parsed_object.json` — present, real, not inferred), and real `article.xml` output carries a full `<abstract><p>...</p></abstract>` block. **No Milestone 4 extractor reads it** — `article_metadata_extractor.py` has no `abstract` handling, and `ArticleMeta` has no field for it. This is a straightforward, evidence-confirmed extraction-layer gap (Milestone 4 scope) that cascades into an ICAM gap (Milestone 5A/5B scope) — the abstract text is present in `<abstract>` and, separately, in a near-duplicate but not byte-identical "Article Summary" custom-meta entry (independently worded in places — "whose inhibition" vs. "that its inhibition"), confirming these are two distinct source fields, not one field surfacing twice.

---

## 7. Performance Assessment

This assessment is necessarily more limited than the other sections: no generator, packaging, or batch-orchestration code exists yet to profile, and this sandbox has no access to production-scale (6,000–10,000+ article) data. The findings below are based on the *shape* of the code that does exist (Milestones 1–5B) and the LLD's own stated scalability targets (`13_LLD_04_PIPELINE_SCALABILITY_VALIDATION.md`).

- **Object allocations**: Every ICAM type is a frozen `dataclass` with `tuple` collections — appropriate for read-heavy, write-once construction, and avoids the accidental-mutation-under-concurrency risk the LLD calls out (§3.7 of the LLD's canonical-model design). No excessive intermediate collection copying was found in the transformation services reviewed (`contributor_transformer`, `custom_meta_classifier`, `file_resolver` each build their output collections in a single pass).
- **Memory usage**: `BodyFragment.raw_xml_fragment` is a single in-memory string per article — confirmed up to ~1MB on the largest real sample (`cs-2025-6808`). At 6,000–10,000+ articles/run, if any stage ever holds many `ArticleModel` instances resident simultaneously (e.g., a worker pool sized larger than its per-article memory budget), this is the single largest per-article memory contributor identified. This was already true before this review (Milestone 5A/5B did not change body-fragment size) — noted here because generator implementation is the point at which multiple large strings (raw.xml, article.xml, reviews.xml) will exist per article simultaneously in memory, compounding it.
- **Batch scalability**: `file_resolver._match_in_directory` calls `directory.rglob("*")` **once per file entry, per candidate directory** — for an article with N file entries and R round directories, this is O(N × R) directory walks in the worst case (when early tiers/directories don't match). On the real samples (≤21 file entries, ≤3 round directories) this was not observed to be slow (sub-second per article), but this pattern was not designed with 6,000–10,000+-article batch throughput specifically in mind — it was designed for per-article correctness against real, messy filename data (Milestone 5B's explicit scope). Whether this matters at batch scale depends on typical file-entry counts per article, which this review has no production data to estimate beyond the 3 real samples (8–21 files each).
- **Streaming opportunities**: None of the pipeline stages reviewed (parsing, extraction, transformation) currently stream — `XmlLoader.load()` reads a whole file into memory before parsing (a documented, accepted Milestone 3 design choice, not revisited here), and every extractor/transformer operates on a fully-materialized `ParsedDocument`/`ExtractionBundle`. This is consistent with the LLD's own scope (`13_LLD_04...` targets a full-staging, not a streaming, architecture) — not a regression introduced by this review's subject milestones.
- **Parallel generation readiness**: The ICAM's frozen, immutable design (LLD §3.7's explicit stated goal — "a frozen object shared across concurrent readers has no possible race condition") is exactly the property the Data Flow Document's "generators may run concurrently" design depends on. Nothing observed in Milestones 1–5B threatens this: no generator-facing ICAM field is mutable, and no transformation service retains module-level mutable state across calls (confirmed by `test_two_calls_produce_independent_models`-style tests already in the Milestone 5B suite). **The ICAM is structurally ready for concurrent generator execution as designed.**

**No performance finding in this section rises to "requires an architectural change before generation begins."** The `file_resolver` directory-walk pattern is the one item worth re-measuring once real batch-scale file-entry-count data is available (a Milestone 13, not Milestone 6, concern per the Implementation Roadmap's own phasing).

---

## 8. Generator Readiness Scorecard

Scored on: (1) ICAM field availability, (2) Business Rule coverage of the generator's own category, (3) configuration dependency readiness, (4) real-sample evidence quality.

| Generator | Readiness | Rationale |
|---|---|---|
| **raw_xml** | **High** (ready to begin, one confirmation needed) | `BodyFragment` + all front-matter ICAM fields are populated and real-sample-verified. Open item: whether `raw_xml` should read the classified `CustomMetaStore` or Milestone 4's raw `ExtractionBundle.custom.entries` for its "100% of custom-meta-group" requirement (BR-042) — a scoping question to settle at kickoff, not a missing capability. |
| **manifest_xml** | **High** (ready to begin, one config gap to close) | `ResolvedFileList` + `RoundIndex` are fully populated and real-sample-verified (21/8/17 files resolved with zero errors across all 3 samples). Blocked only on `item-type-mapping.yaml` (schema + loader method) not existing yet — a small, well-understood addition, not a design gap. |
| **transfer_xml** | **High** (ready to begin, pending config population + one business decision) | Every ICAM field this generator needs already exists and is populated. Blocked on `config/journals/`/`config/publishers/` remaining intentionally empty (pre-existing, Milestone-1-documented, unrelated to this review) and BR-133's pre-existing acronym ambiguity — both business/config gaps, not engineering ones. |
| **article_xml** | **Medium** | The bulk of this generator (identity, journal, author contributors/affiliations, copyright, keywords, funding, counts, history dates, custom-meta deny-list pruning, license lookup) is well-supported. Three real, confirmed gaps would surface as incomplete generator output if implementation started today without addressing them first: the editor/associate-editor/reviewer contrib-group requirement (§2.5, §6.1); the missing `<abstract>` field (§6.11 — the cheapest of the three to close); and the structured-affiliation-decomposition caveat (§2.4). |
| **reviews_xml** | **Medium-Low** | Reviewer scorecards, decision drafts, and decline reasons are structurally present and round-grouped, which is the harder architectural problem already solved. But three concrete data gaps (assigned/submitted/due dates — entirely missing; free-text comment source — unconfirmed; editor/associate-editor identity — entirely missing) mean this generator could not be fully implemented against the ICAM as it stands today without first resolving where this data comes from. |

**No generator scores "Not Ready" / "Blocked"** — every gap identified is additive (new fields/config, not a redesign) and independently addressable per-generator, matching this review's opening verdict.

---

## 9. Final Recommendation

**Proceed to XML generator implementation. No architectural redesign is warranted.** The layering, the ICAM's overall shape, the immutability/freeze discipline, the diagnostics-vs-exceptions split, and the extraction/transform package boundaries all hold up against real-sample evidence, not just synthetic test cases.

**Before `article_xml` and `reviews_xml` specifically begin** (raw_xml/manifest_xml/transfer_xml are not blocked by any of this), the following should be resolved — as scoped extensions to the existing architecture, following the same additive-Milestone-4/5B-extension pattern already used repeatedly and successfully through this project (e.g. `journal_id`, `display_channel_subject`, `custom-meta` attributes were all added the same way, each discovered by exactly this kind of real-data inspection):

1. Determine the correct source and shape for editor/associate-editor/reviewer contributor data (§6.1) — the highest-impact, most consequential open item in this review.
2. Add a JATS `<abstract>` extraction path (Milestone 4 area) and an `ArticleMeta.abstract`-equivalent ICAM field (§6.11) — confirmed on both source and output ends; likely the cheapest of the gaps found here to close.
3. Determine the correct source for `ReviewerScorecard`'s missing `assigned`/`submitted`/`due` dates (§2.12).
4. Confirm the source of `reviews.xml`'s free-text reviewer comments (§6.3) and `DecisionDraft`'s missing `editor_name`/`decision_date` (§6.2).
5. Add the two missing config schemas (`article-type-mapping.yaml`, `item-type-mapping.yaml`) and their loader methods (§6.6) — small, mechanical, same pattern as `load_media_type_config`.
6. Decide `raw_xml`'s custom-meta source (classified `CustomMetaStore` vs. raw `ExtractionBundle.custom.entries`) before that generator's implementation, not during it.

**Explicitly not recommended**: no change to package layering, no change to the ICAM's frozen-dataclass/builder pattern, no change to the extraction/transform split established across Milestones 3–5B, and no change to the exception hierarchy. This review found real, worth-fixing gaps — it did not find an architecture that needs to be redesigned.

**This document proposes no solutions to the gaps it identifies**, per its own scope — each numbered item above is a decision or a small scoped addition for the owning milestone (5C, or folded into Milestone 6/7/8 kickoff, at the user's discretion) to resolve, not something this review has designed.
