# Milestone 6E — Transformation-Layer Corrections Report

A focused corrective milestone: fixes 3 confirmed defects in the
transformation layer, already evidenced in the Milestone 6B/6C/6D
reports, that degrade the ICAM's quality for every generator built on
top of it. No new functionality, no architectural change, no
reviews.xml work. All fixes are minimal, evidence-grounded, and
confined to `meca_engine.transform`/`meca_engine.extraction` plus their
tests, per this milestone's explicit scope.

**One investigation finding is reported but deliberately *not* fixed**
— see §1.4 and §8: a deeper, genuinely un-fixable-without-guessing
mismatch between two independent "round" concepts, discovered while
re-verifying the already-documented round-labeling defect.

---

## 1. Root Cause Analysis

### 1.1 History "revision" date silently dropped (fixed)

**Symptom** (documented in the Milestone 6B/6C reports): `HistoryDates.revision` was `null` in the ICAM for all 3 real reference packages, even though every one of them has a real, present middle history date in its source XML.

**Root cause**: `transform/coordinator.py`'s `_build_article_meta` called `_find_date(article.history_dates, "revised")` — a single hard-coded literal string. Direct inspection of all 3 real source XML files' `<history>` blocks confirms the actual `date-type` attribute values are:

| Sample | `received` | middle date | `accepted` |
|---|---|---|---|
| CS-2025-6808 | `"received"` | `"rev-recd"` | `"accepted"` |
| CS-2025-8493_C | `"received"` | `"rev-recd"` | `"accepted"` |
| cs-2025-8827 | `"received"` | `"revision"` | `"accepted"` |

`"revised"` (the literal the code looked for) appears in **0 of 3** real samples — the lookup could never match, silently dropping the date every time (no exception, no diagnostic — `_find_date` returns `None` on no match by design, which `HistoryDates` accepts as a legitimate "date absent" value, indistinguishable from a genuinely missing date).

**Fix**: `_find_date` now accepts a `frozenset[str]` of acceptable date-types instead of one literal string. The revision lookup uses `{"revised", "rev-recd", "revision"}` — the 2 evidence-confirmed values plus the original literal, kept defensively (zero direct evidence for it, but it was the pre-existing intent and costs nothing to retain). `received`/`accepted` were already correct (both observed 3/3) and are now expressed the same way for consistency, not because they were broken.

### 1.2 `FileEntry.round_label` garbage for staging-job-form paths (fixed)

**Symptom** (documented in the Milestone 6C/6D reports): `custom_meta.file_entries[i].round_label` held a raw per-file Kriyadocs staging-job UUID (e.g. `"f2f0b0b6-5368-4166-8f05-d0383a0fb8c3"`) instead of a real round name for many entries, breaking article.xml's BR-066 "latest round" file filter and threatening manifest.xml's file inventory.

**Root cause**: `extraction/custom_meta_classifier.py::_build_file_entry` derives `round_label` positionally from the declared custom-meta `path` field: `path_hint.rsplit("/", 2)[-2]`. For a path like `.../inputs/R1/manuscript.docx` this correctly yields `"R1"`. But `extraction/file_resolver.py`'s own module docstring already documents that some declared paths use a **different, no-round-segment** form instead: `_temp/<uuid>/<file>` (a per-file staging-job id, not a round). For that form, `rsplit("/", 2)[-2]` yields the UUID segment — a confirmed, reproducible defect, not a corner case: 4 of CS-2025-6808's 21 declared file entries hit this exact form.

Critically, `extraction/file_resolver.py::resolve_files` **already** solves this correctly and has since Milestone 5B — its own docstring: *"Round label is resolved physically, not from the custom-meta hint... this resolver... reports the directory it was actually found under."* `ResolvedFile.round_label` was always correct. The bug was that `custom_meta.file_entries` (the collection article.xml's BR-066 filter and any other `FileEntry`-based consumer actually reads) kept the broken, unreconciled hint value forever — the already-correct answer existed in the ICAM the whole time, just in a different field nobody copied it from.

**Fix**: `transform/coordinator.py::build_model` now calls `resolve_files` *before* freezing `custom_meta_store`, then overwrites every `FileEntry.round_label` with its corresponding `ResolvedFile.round_label` (`resolve_files` returns one `ResolvedFile` per input `FileEntry`, in the same order — its own documented, unchanged contract). A new `_reconcile_file_entry_round_labels` helper performs this, with a defensive `ValueError` if that one-per-input contract is ever violated (never observed; unit-tested directly).

### 1.3 `"track-changes"` audit-trail entries leaking into `form_answers` (fixed)

**Symptom** (newly discovered during Milestone 6C's golden verification, documented as an "unresolved issue" there): CS-2025-6808's generated article.xml carried 22 extra `custom-meta` entries (`"PubData"`, `" Affiliation 1"`, `"Figure 1"`–`"Figure 8"`, `"Keyword"`, `"Funding"`, `"History"`, `"Author"`, etc.) reading `"<field> was changed"`, absent from all 3 real reference packages' own approved `article.xml`.

**Root cause**: `extraction/custom_meta_classifier.py`'s module docstring already documents one audit-trail exclusion (`specific-use` values `"history"`/`"lqc"`/`"query"`/`"summary"` with no `meta-name` at all, correctly excluded). The `"was changed"` entries are a **different shape** of the same underlying phenomenon: `<custom-meta specific-use="track-changes" ...><meta-name>Figure 1</meta-name><meta-value><named-content specific-use="changeData">Figure 1 was changed</named-content></meta-value></custom-meta>` — this **does** carry a real `meta-name`, so it fell through the existing "no name → excluded" check straight into the generic `form_answers` catch-all. Direct inspection confirms all 22 occurrences in CS-2025-6808's source XML share this exact shape (a `specific-use="track-changes"` outer element wrapping a `specific-use="changeData"` synthetic message) — never genuine business/form data. The other 2 real samples contain zero `specific-use="track-changes"` entries at all.

**Fix**: `classify()` now checks `specific_use == "track-changes"` (alongside the existing `"form-files"`/`"reviewer-decline"` checks, at the same priority, before the generic name-based fallback) and excludes the entry — same treatment as the existing "no meta-name" audit markers: not force-fit into `form_answers`, not synthesized into any other collection, counted in a new `unclassified_track_changes_count` logged alongside the existing `unclassified_no_name_count`.

### 1.4 Round-label vs. round-ordering: a deeper mismatch, found but not fixed

While re-verifying §1.2's fix against real data, a second, more fundamental finding emerged that this milestone does **not** fix — see §8 for why.

`round_resolver.py` (unchanged, and confirmed *correct* per its own BR-010 specification) resolves `RoundInfo.label` from each `<article-version>` element's `article-version-type` attribute. Direct inspection of all 3 real samples' source XML shows this attribute is **literally `"Original"` on every single `<article-version>` element, with no exceptions** — including CS-2025-8493_C's 3 elements (sequence numbers 9, 13, 17, all labeled `"Original"`) and even the one CS-2025-6808/cs-2025-8827 element that represents a much later "author revision"/"author resubmission" snapshot per its own `vocab-identifier` text. `article-version-type` therefore carries **zero discriminating round-name information** — it cannot be used to answer "which physical `files/<Round>/` folder does the current/latest content belong to," because it never varies.

Meanwhile, the physical round-folder convention (`"Original"`, `"R1"`, ...) that `FileEntry`/`ResolvedFile.round_label` — and BR-015, BR-066, BR-082, BR-083 — all actually use is a **completely independent axis**, with no reliable correspondence to `<article-version>` sequence/label data (confirmed: every sample has exactly 2 physical folders regardless of how many `<article-version>` elements exist — 1, 3, and 1 respectively — ruling out even a positional/count-based correspondence).

Net effect: even after §1.2's fix makes every `FileEntry.round_label` physically correct, `ArticleXmlGenerator`'s BR-066 filter (`latest_round_label = next(r.label for r in rounds if r.is_latest)`, then `file_entries` filtered by string equality against that label) still resolves `latest_round_label == "Original"` for all 3 samples — because that's the only value `article-version-type` ever produces — which is very likely **not** the round a human would call "latest" (real evidence: `manifest.xml`'s own BR-083 ordering, and the sheer volume of real `article.xml` file entries, both point to `"R1"` as the actually-latest, most-recently-uploaded round in every sample that has one). §4 quantifies the resulting, still-incomplete improvement to BR-066.

---

## 2. Files Modified

```
meca-engine/
  src/meca_engine/
    transform/
      coordinator.py                           # MODIFIED — §1.1 date-type synonyms; §1.2 round-label reconciliation
    extraction/
      custom_meta_classifier.py                # MODIFIED — §1.3 track-changes exclusion
  tests/
    unit/transform/test_coordinator.py         # MODIFIED (+6 tests)
    unit/extraction/test_custom_meta_classifier.py  # MODIFIED (+2 tests)
    golden/test_article_xml_golden.py          # MODIFIED — history-date assertion updated to reflect the fix
    golden/expected_output/
      CS-2025-6808.icam.snapshot.json          # REGENERATED
      CS-2025-8493_C.icam.snapshot.json        # REGENERATED
      cs-2025-8827.icam.snapshot.json          # REGENERATED

golden_baseline/
  README.md                                    # MODIFIED — "Milestone 6E changes" section
  CS-2025-6808/03_icam.json                    # REGENERATED
  CS-2025-8493_C/03_icam.json                  # REGENERATED
  cs-2025-8827/03_icam.json                    # REGENERATED

25_MILESTONE_6E_TRANSFORMATION_CORRECTIONS_REPORT.md  # NEW — this report
```

No generator file (`generators/raw_xml/`, `generators/article_xml/`, `generators/manifest_xml/`) was modified — only their *inputs* (the ICAM) changed. No file was deleted. No `Input/`/`Output/` source zip was touched. `04_raw.xml`/`05_article.xml`/`06_manifest.xml` under `golden_baseline/*/` remain the pre-existing, intentionally-deferred placeholders (unchanged; regenerating them is a separate, not-yet-scheduled documentation task, unrelated to this milestone).

---

## 3. Before vs. After Behaviour

| Field / Output | Before | After | Classification |
|---|---|---|---|
| `ArticleModel.article_meta.history_dates.revision` (all 3 samples) | `None` (always) | `2025-07-20` / `2025-11-10` / `2026-04-15` | **Bug fix** |
| `raw.xml`'s `<history>` block (all 3 samples) | 2 `<date>` elements (`received`, `accepted`) | 3 `<date>` elements (`received`, `revised`, `accepted`) — the middle date's own `date-type` *string* is still the fixed literal `"revised"`, not the source's `"rev-recd"`/`"revision"` text (a separate, narrower, pre-existing BR-047 fidelity limit in `raw_xml/generator.py`, unchanged, out of scope — see §4) | **Bug fix** (value no longer dropped) + **known residual limitation** (date-type string not verbatim) |
| `article.xml`'s `<history>` block (all 3 samples) | 2 dates (inherited from raw.xml) | 3 dates (inherited from raw.xml) | **Bug fix**, inherited |
| `custom_meta.file_entries[].round_label` (CS-2025-6808: 4 entries; CS-2025-8493_C: 7; cs-2025-8827: 16) | Kriyadocs staging-job UUID string | Correct physical round name (`"R1"`/`"Original"`), matching `resolved_files` | **Bug fix** |
| `article.xml`'s BR-066 file-manifest custom-meta entries | 0 entries, 3/3 samples (diagnostic: "No file-manifest entries found for the latest round") | CS-2025-6808: 1 entry; CS-2025-8493_C: 1 entry; cs-2025-8827: 2 entries — no longer 0, but still far short of real evidence (≈19-21 real entries per sample) | **Expected, partial improvement** — see §1.4/§8 for why full BR-066 correctness needs a separate, not-guessable fix |
| `manifest.xml`'s file-item inventory/ordering | Unaffected (already read the already-correct `resolved_files`, never `file_entries`) | Unaffected | **No change** (confirmed, not assumed) |
| `custom_meta.form_answers` (CS-2025-6808 only) | 22 extra `"<field> was changed"` audit-trail entries present | Removed; 28 legitimate entries remain (down from 50) | **Bug fix** |
| `custom_meta.form_answers` (CS-2025-8493_C, cs-2025-8827) | — | Unchanged (0 `track-changes` entries in either source) | **No change** (confirmed, not assumed) |
| Every other ICAM field, all 3 samples | — | Byte-identical | **No change** (confirmed via full snapshot diff, not assumed) |

**No regression identified** in any of the 3 diffs (each diff below was inspected line-by-line against the fixes' own expected scope before being accepted):

```
CS-2025-6808:   revision date populated; 4 round_label corrections; 22 form_answers entries removed
CS-2025-8493_C: revision date populated; 7 round_label corrections
cs-2025-8827:   revision date populated; 16 round_label corrections
```

---

## 4. Updated Golden Comparison

Re-ran the golden comparison for all 3 real reference packages against `raw.xml`, `article.xml`, and `manifest.xml` (the 3 already-approved generators).

| Difference (previously documented) | Previous classification | Current classification | Evidence |
|---|---|---|---|
| History middle date missing from raw.xml/article.xml | Unresolved issue (Milestone 6B/6C reports) | **Resolved** | All 3 samples' generated `raw.xml`/`article.xml` now carry exactly 3 `<date>` elements, matching the real reference packages' date *values* (year/month/day) exactly; verified via `tests/golden/test_article_xml_golden.py`'s updated assertion (date-value-set equality, not date-type-string equality — see below) |
| History middle date's `date-type` attribute text (`"revised"` vs. real `"rev-recd"`/`"revision"`) | (not previously assessed — the date wasn't reaching output at all) | **Formatting-only, separate, pre-existing limitation** | `raw_xml/generator.py::_build_history` always writes the literal `"revised"` for this position — a fixed 3-value vocabulary (`received`/`revised`/`accepted`) baked into that already-approved Milestone 6B generator, independent of this milestone's fix. `HistoryDates` (the ICAM model) has no field to carry the source's literal date-type string, only a semantic `revision: date \| None`. Not fixed here per "keep the ICAM model stable unless a change is absolutely required" — the *value* is no longer lost, which was the actual defect; the date-type label's exact text was never separately confirmed broken (BR-047 says "copied verbatim" but no BR/ADR entry specifically pins the date-type string as an inspected fact prior to this milestone) |
| `custom_meta.file_entries[].round_label` UUID garbage | Confirmed upstream defect (Milestone 6C/6D reports) | **Resolved** | 0 UUID-shaped round labels remain in any of the 3 samples' ICAM, confirmed by direct inspection |
| `article.xml`'s BR-066 file-manifest custom-meta completeness | Confirmed upstream defect: 0 entries generated, ~19-30 expected per sample | **Partially improved, root cause still open** | CS-2025-6808: 0→1 entries (real: ~19); CS-2025-8493_C: 0→1 (real: ~8); cs-2025-8827: 0→2 (real: ~17). The filter itself is provably correct (unit-tested in isolation, Milestone 6C); the *input* it filters against (`RoundInfo.is_latest`'s label, always `"Original"`) does not correspond to the physically-latest round (`"R1"` in every sample with 2+ rounds) — see §1.4. This is a **new, more precise diagnosis** of what was previously described (in the 6C/6D reports) as one single "round-label" defect; it is now understood to be *two* separate defects, one fixed this milestone (§1.2) and one requiring a business/design decision this milestone cannot make (§8) |
| `manifest.xml`'s file-item inventory (BR-089/094) | Confirmed upstream defect: item count short of real evidence (same root cause as article.xml's, per the 6D report) | **Unchanged, confirmed unaffected by this milestone's fixes** | `ManifestXmlGenerator` reads `resolved_files` exclusively (never `file_entries`), and `ResolvedFile.round_label` was already correct before this milestone — re-ran the manifest.xml golden suite (3/3 pass, unchanged assertions) to confirm no regression and no improvement. The manifest.xml shortfall's real root cause (custom-meta simply never declaring some physical rounds' files at all — a Milestone 4/5B extraction-completeness gap, not a labeling defect) remains exactly as documented in the 6D report, out of this milestone's "round labeling"/"custom-meta classification" scope as literally named |
| `custom_meta.form_answers`'s `"track-changes"` leakage (CS-2025-6808) | Newly-discovered, unresolved issue (Milestone 6C report) | **Resolved** | 0 `"<field> was changed"` entries remain in any of the 3 samples' generated `article.xml` |
| Every other previously-documented difference (ADR-008 media-type legacy/modern, BR-084/085 item-description/id clerical defects, `article_id` casing, license attribute inconsistency on CS-2025-6808, CRLF/attribute-wrapping formatting limits) | As documented in the 6B/6C/6D reports | **Unchanged** | None of this milestone's 3 fixes touch any of these fields/paths; re-confirmed via the full golden suite (12/12 pass) with no new or different failures in these areas |

---

## 5. Regression Summary

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 807 passed, 0 failed |
| New tests this milestone | 6 in `tests/unit/transform/test_coordinator.py` (revision date-type synonyms ×3 parametrized cases, unrecognized-date-type-leaves-None, round-label reconciliation end-to-end, reconciliation length-mismatch defensive branch); 2 in `tests/unit/extraction/test_custom_meta_classifier.py` (track-changes exclusion, track-changes-alongside-legitimate-answers) |
| Modified tests | `tests/golden/test_article_xml_golden.py`'s history-date assertion (updated to assert the fix's actual, correct new behavior — date-value equality — rather than the old, now-incorrect "middle date never reaches article.xml" assertion) |
| Coverage, modified modules | `transform/coordinator.py` 100% (up from 98% pre-fix baseline — the new defensive branch is now covered), `extraction/custom_meta_classifier.py` 100% (unchanged) |
| Overall project coverage | 99% (3,496 statements, 13 missed — all in unimplemented future-milestone stub modules, unchanged from Milestone 6D) — **no reduction** |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (232 files) |
| `mypy --strict` | Clean (105 source files) |
| Golden tests | 12/12 pass (`test_metadata_to_icam_golden.py` ×3, `test_raw_xml_golden.py` ×3, `test_article_xml_golden.py` ×3, `test_manifest_xml_golden.py` ×3) |

All existing tests pass unmodified except the one golden-test assertion documented above, which was updated because it explicitly asserted the pre-fix (buggy) behavior by name (`"confirmed upstream gap: the middle history date never reaches article.xml today"`) — updating an assertion that names the exact defect just fixed is the intended, expected outcome of a corrective milestone, not a weakening of test rigor: the new assertion is *more* precise (checks actual date values, not just "some date is missing").

---

## 6. Architecture Compliance Confirmation

- **No architectural redesign**: no new module, no new package, no new cross-layer dependency. `coordinator.py` and `custom_meta_classifier.py` are the same 2 already-existing transformation-layer files; both fixes are internal to functions that already existed.
- **Layering preserved**: `grep` confirms neither modified file gained any new import; `coordinator.py` still imports only from `extraction.*`/`transform.*`/`model.*`/`logging_.*` (unchanged set), `custom_meta_classifier.py` still imports only from `model.*` (unchanged set).
- **ICAM model kept stable**: zero dataclass fields added, removed, or retyped anywhere in `meca_engine.model`. `schema_version` (`model/serialization.py`) is unchanged at `1.1.0` — these are internal *value* corrections (a field that already existed now holds a more-correct value), not shape changes, so no schema version bump is warranted (consistent with the Milestone 5C precedent of only bumping for additive/structural changes).
- **Backward compatibility preserved**: `_find_date`'s new `frozenset[str]` parameter type is a strict superset of what a single string check could express — no caller outside `coordinator.py` itself calls `_find_date` (private, module-local), so no external compatibility concern exists. `classify()`'s public signature is completely unchanged; the new exclusion is purely additive to its internal dispatch logic. `_reconcile_file_entry_round_labels` is a new private helper, not a public API change.
- **No generator touched**: confirmed via `grep` — zero changes anywhere under `generators/`. Every behavioral change observed in `raw.xml`/`article.xml`/`manifest.xml` output is a pure, mechanical consequence of those generators reading a now-more-correct ICAM, exactly as intended by "this milestone exists solely to improve the quality of the ICAM consumed by all generators."
- **No new business rule invented**: §1.1's fix uses only directly-observed literal strings (no invented vocabulary); §1.2's fix reuses an already-existing, already-approved resolution algorithm (`file_resolver.resolve_files`) rather than inventing a new one; §1.3's fix uses a directly-observed `specific-use` literal, applying the exact same treatment the module already gives other audit-trail markers. §1.4's finding was investigated but *not* acted on, specifically because doing so would have required inventing an unevidenced round-folder-to-`<article-version>` correspondence.

---

## 7. Performance Report

Not separately measured this milestone — none of the 3 fixes change algorithmic complexity (a `frozenset` membership check replaces a string equality check; one additional `O(n)` pass reconciles round labels; one additional `if` branch in an existing `O(n)` classification loop). No measurable performance impact is expected or was observed in the full test suite's wall-clock time (14.4s for 807 tests, consistent with prior milestones' reported scale).

---

## 8. Readiness Assessment for the reviews.xml Generator

**Ready to begin reviews.xml — with one important, explicitly-flagged caveat that reviews.xml's own design should account for:**

The §1.4 finding (RoundInfo's `article-version-type`-derived label never varies, and cannot be reconciled with the physical round-folder convention without inventing an unevidenced mapping) is **directly relevant** to reviews.xml, per 11_LLD_02 §4.7's own description of that generator as review-history-and-round-scoped. If reviews.xml's design assumes `RoundInfo.label`/`is_latest` reliably identifies "the round reviewers most recently acted on" the way `files/<Round>/` folders do, it will inherit the exact same defect BR-066 has — a generator-level assumption issue, not something a further transformation-layer patch can safely resolve without business input.

**Recommendation, not a blocker**: before or during reviews.xml's design, get explicit business confirmation on one specific, narrow question: *does "latest round" for review/decision-history purposes mean (a) the highest-`vocab-identifier`-sequence-number `<article-version>` snapshot (today's `RoundInfo.is_latest`, a content-versioning concept), or (b) the most-recently-uploaded physical `files/<Round>/` folder (a submission-workflow concept)?* All evidence gathered this milestone suggests these are almost certainly not the same round in real data, and reviews.xml very likely needs (b), matching what article.xml/manifest.xml's BR-066/BR-083 already assume. This is a one-question business decision, not an engineering unknown — this milestone deliberately did not answer it, since doing so from code alone would be guessing.

Nothing else found this milestone blocks reviews.xml. The 3 fixes applied are confirmed correct via golden re-verification and impose no new risk on the reviews.xml design, which was already going to need its own round/history mapping work regardless of this milestone's outcome.

**Waiting for approval before starting the reviews.xml Generator.**
