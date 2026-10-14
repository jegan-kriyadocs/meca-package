# Milestone 9 — Extraction Layer Defect Fix: Implementation Report

Fixes the critical extraction-layer defect identified during the
5-new-package certification exercise. Implements the fix, re-runs full
regression, re-certifies all 5 packages, and documents every change
against the explicit engineering rules the task set (no architecture
change, no business-rule change, no shortcuts, minimum-necessary
modules).

---

## 1. Executive Summary

The defect was exactly where the certification's Failure Analysis
identified it: `extraction/custom_metadata_extractor.py`'s
`_extract_named_content` read only the `content-type` XML attribute,
never the equally-valid `data-type` attribute some real production
packages use for the identical concept. This silently blanked out every
file's declared name/category, which then caused
`extraction/file_resolver.py`'s prefix-match tolerance tier to trivially
match the wrong file for every affected entry (`str.startswith("")` is
always `True`), and — as a direct consequence of the same mechanism —
silently dropped every affected article's `R1` round entirely.

**The fix is two additive changes, both confined to the extraction
layer**: (1) a fallback attribute read (`content-type` first, `data-type`
second) in `custom_metadata_extractor.py`, and (2) a defensive guard in
`file_resolver.py` so an empty declared name can never match any file.
No generator, no Package Builder, no ICAM type, and no transformation
logic was touched. Both changes are additive/backward-compatible: every
previously-processed package's behavior is provably unchanged (100% of
existing tests pass unmodified, including all 24 golden tests against
the 3 original reference packages).

**Result**: 2 of the 3 previously-corrupted packages
(`bcj-2025-3130`, `bsr-2025-3205`) now generate genuinely correct MECA
packages — every file resolves to its correct name, category, and
round; manifest-to-file referential integrity is exact; the `R1` round
is no longer dropped. The third (`cs-2024-5238`) now fails **safely and
explicitly** instead of silently: the fix's own defensive guard
unmasked one already-existing, separate, real source-data gap (one file
entry with no name field under *either* attribute), which this task's
own rules correctly forbid inventing a fix for (that would require
deriving a filename from a path hint — new business logic, out of
scope). The 2 packages that failed for the pre-existing, unrelated
Defect Class 2 (missing/misnamed license files) are unaffected by this
fix, as expected.

---

## 2. Root Cause

### 2.1 Primary defect

`src/meca_engine/extraction/custom_metadata_extractor.py`,
`_extract_named_content` (before fix):

```python
def _extract_named_content(value_element: ParsedElement) -> tuple[NamedContentField, ...]:
    return tuple(
        NamedContentField(
            content_type=get_attribute(element, "content-type"),
            text=get_text(element, recursive=True),
        )
        for element in find_all(value_element, "named-content")
    )
```

This reads exactly one attribute name. The 3 original golden-baseline
packages happen to always supply `content-type`. The 3 new packages
that "succeeded but were corrupted" (`bcj-2025-3130`, `bsr-2025-3205`,
`cs-2024-5238`) supply `data-type` instead, on 100% of their
file-reference `<named-content>` elements (confirmed by direct scan
during certification) — both are real, valid JATS/Kriyadocs
conventions for the same concept; neither is a malformed document.

With `content_type` silently `None`, downstream
`custom_meta_classifier.py`'s `_named_content(entry, "name")` /
`_named_content(entry, "type")` (both match on
`content_field.content_type == content_type`) never find a value, so
`FileEntry.original_filename`, `FileEntry.category`, and
`FileEntry.round_label` (all three derived through the same
`_named_content` helper) fell back to `""` for every affected entry.

### 2.2 Consequential defect (same root cause, two visible symptoms)

`file_resolver.py`'s `_match_in_directory`, prefix-match tier:

```python
for path in candidates:
    if path.stem.lower().startswith(declared_name):
        return path
```

When `declared_name == ""`, every filename satisfies
`str.startswith("")` — this tier trivially returned the *first* file
found by directory iteration, for every affected entry, in whichever
round directory was searched first. Because `round_label` was *also*
blanked (derived from the same helper), `_find_physical_file`'s
round-preference ordering had no round to prefer, falling back to
`_round_directories`'s own alphabetical ordering — `"Original"` sorts
before `"R1"`, so every entry resolved inside `Original/`, and `R1/` was
never even inspected. **File collapse and R1 loss are one mechanism, not
two separate bugs.**

---

## 3. Technical Analysis

### 3.1 Why this was never caught in 945 tests / 24 golden tests / 99% coverage

Every existing test fixture and all 3 golden-baseline reference packages
use `content-type` exclusively. Coverage measures *lines executed*, not
*attribute-name variants a line might encounter* — the single line
`get_attribute(element, "content-type")` was fully covered (100%) while
still being wrong for a real-world input it had never seen. This is a
correct, sobering illustration of coverage's own limits, not a gap in
how thoroughly the existing suite was written.

### 3.2 Why the fix is architecturally sound

- `custom_metadata_extractor.py`'s stated responsibility ("extracts
  everything it finds, without judgment... no business-rule filtering")
  is unchanged — attribute-name tolerance is a structural parsing
  concern, not a business decision, exactly like the module's own
  existing unfiltered-extraction philosophy already established in
  Milestone 4.
- `file_resolver.py`'s own module docstring already documents 4 tiers of
  *structural* filename-matching tolerance as "not a business-semantic
  judgment" — the new empty-name guard is the same category of
  structural safety property (a `None`/empty declared value can never
  identify a file), not a 5th business-driven tolerance tier.
- Both changes are purely defensive/additive: `content-type` is checked
  **first** in all cases, so a package that supplies it is completely
  unaffected; the empty-name guard only changes behavior when
  `declared_name` was already unusable (empty), which previously
  produced silently wrong output — it can only ever make behavior
  *more* correct, never regress a case that worked before.

### 3.3 Why no other layer needed to change

Verified directly, not assumed: all 5 XML generators and
`packaging.builder.PackageBuilder` operate exclusively on the
`ArticleModel`/`GeneratorContext` they are handed — they have no visibility
into custom-meta XML attributes at all (confirmed unchanged dependency
direction, per the existing Architecture Audit). Once the ICAM is
correctly populated, every downstream layer was already producing
correct output from correct input — this was independently confirmed
during the original certification's Regression Report (zero structural
drift in any of the 3 corrupted packages' generated XML).

---

## 4. Files Modified

| File | Type of change | Lines changed |
|---|---|---|
| `src/meca_engine/extraction/custom_metadata_extractor.py` | Added 1 new helper function (`_resolve_content_type`); changed 1 line inside `_extract_named_content` to call it; extended module docstring | +19 / -1 |
| `src/meca_engine/extraction/file_resolver.py` | Added 1 early-return guard inside `_match_in_directory`; extended module docstring | +8 / -0 |
| `tests/unit/extraction/test_custom_metadata_extractor.py` | Added 3 new tests | +54 |
| `tests/unit/extraction/test_file_resolver.py` | Added 1 new test | +11 |

**No other file in the repository was modified.** No generator, no
Package Builder, no ICAM/model type, no transformation module, no
configuration file, and no Business Rule Book text was touched.

---

## 5. Code Changes

### 5.1 `custom_metadata_extractor.py`

```python
def _resolve_content_type(element: ParsedElement) -> str | None:
    """Read a ``named-content`` element's content-type, tolerating both attribute spellings.

    Real Kriyadocs source packages have been observed using two distinct,
    equally-valid attribute names for the same concept: ``content-type``
    (the originally-observed convention) and ``data-type`` (confirmed
    present, in place of ``content-type``, in later-observed packages).
    ``content-type`` is checked first so every previously-processed
    package's behavior is completely unchanged; ``data-type`` is tried
    only when ``content-type`` is absent.
    """
    content_type = get_attribute(element, "content-type")
    if content_type is not None:
        return content_type
    return get_attribute(element, "data-type")


def _extract_named_content(value_element: ParsedElement) -> tuple[NamedContentField, ...]:
    return tuple(
        NamedContentField(
            content_type=_resolve_content_type(element),
            text=get_text(element, recursive=True),
        )
        for element in find_all(value_element, "named-content")
    )
```

**Why required**: this is the actual, sole point in the codebase that
reads this attribute. Fixing it here (rather than, e.g., normalizing the
XML earlier, or patching every caller) means every downstream consumer
of `NamedContentField.content_type` — `custom_meta_classifier.py`'s
`_named_content` and everything built on it — is corrected automatically,
with zero duplicated logic (requirement 4) and zero change to
`custom_meta_classifier.py` itself (requirement 5, extractor
responsibilities unchanged).

### 5.2 `file_resolver.py`

```python
def _match_in_directory(directory: Path, declared_name: str) -> Path | None:
    if not declared_name:
        # An empty declared name (e.g. a custom-meta entry whose name
        # field could not be read at all) must never match — every one
        # of the tiers below would otherwise match unconditionally
        # (`str.startswith("")` is trivially true), silently resolving
        # to an arbitrary file. See FileEntry.original_filename's own
        # contract: an empty value means "unknown," never "any file."
        return None
    candidates = [path for path in directory.rglob("*") if path.is_file()]
    ...
```

**Why required**: this is a defense-in-depth fix, independent of §5.1.
Even with §5.1 applied, a future source package could supply neither
`content-type` nor `data-type` (or omit the `name` sub-element
entirely — exactly what was found in `cs-2024-5238`'s "tables" entry
during re-certification, see §9). Without this guard, that case would
silently repeat the exact same collapse-to-one-file corruption this
whole exercise was about. This guard converts that scenario into an
honest `FileReferenceMissingError`, consistent with BR-011/ADR-016's
"never fabricate a file association" principle — the correct,
already-established failure mode for an unresolvable file reference.

---

## 6. Test Results

| Metric | Before fix | After fix |
|---|---|---|
| Total tests | 945 | **949** (+4 new) |
| All passing | Yes | **Yes** |
| Coverage — `custom_metadata_extractor.py` | 100% | **100%** |
| Coverage — `file_resolver.py` | 100% | **100%** |
| Overall coverage | 99% | **99%** (unchanged; same 8 pre-existing stub-module misses) |
| Ruff (`src/`, `tests/`) | clean | **clean** |
| Ruff format | clean | **clean** |
| Mypy `--strict` | clean (119 files) | **clean (119 files)** |

New tests added (all passing):
- `test_extracts_named_content_using_data_type_when_content_type_absent`
- `test_content_type_takes_priority_over_data_type_when_both_present`
- `test_named_content_with_neither_attribute_is_none`
- `test_empty_declared_name_never_matches_any_file`

---

## 7. Regression Results

**All 24 golden tests pass, unchanged.** Re-ran the complete golden
suite (5 generators + Package Assembly, all 3 original reference
packages) after the fix: 24/24 passing, identical to the pre-fix
baseline. Since all 3 original golden packages exclusively use
`content-type` (confirmed by scan during the original certification),
neither code change alters their code path at all — `_resolve_content_type`
returns the `content-type` value on its first check for every one of
their `named-content` elements, and `_match_in_directory`'s new guard
only activates when `declared_name` is empty, which never occurs for
these 3 packages. This is not merely inferred: it is empirically
confirmed by the unchanged golden-test outcome.

**No integration-layer regression**: the fix does not touch any
generator, `PackageBuilder`, or configuration file, so the previously-established
Architecture Audit, Configuration Audit, and Performance Assessment
conclusions from the System Verification milestone remain valid
unchanged.

---

## 8. Before vs. After Comparison

| Package | Before | After |
|---|---|---|
| `bcj-2025-3130` | "Succeeded," 1 of 18 files packaged, all 18 manifest items pointing at the same wrong file, R1 round entirely absent, raw.xml custom-meta blanked | **All 18 files packaged correctly**, each with its true name/category, R1 round fully present (16 of 18 files), manifest↔zip referential integrity exact (18=18=18) |
| `bsr-2025-3205` | "Succeeded," 1 of 7 files packaged (2 manifest items, both wrong) | **2 files packaged correctly** (the article's own custom-meta declares only 2 — both correctly resolved to their true R1-round files; the other 5 Original-round files are genuinely not custom-meta-referenced, an already-known, unrelated source-data characteristic) |
| `cs-2024-5238` | "Succeeded," 1 of 18 files packaged (17 manifest items, all wrong) | **Fails explicitly** at transformation with `FileReferenceMissingError` for one specific entry (`category='tables'`) whose source XML has no name field under either attribute — a newly-unmasked, genuine, separate source-data gap (see §9); no package produced, matching this task's "never silently proceed" principle |
| `cs-2025-6682` | Failed explicitly (missing/misnamed license file) | **Unchanged** — same failure, same reason, unrelated to this fix |
| `etls-2025-3020` | Failed explicitly (missing license file) | **Unchanged** — same failure, same reason, unrelated to this fix |
| 3 original golden packages | Certified, 24/24 golden tests passing | **Unchanged** — 24/24 golden tests still passing, byte-for-byte code path unaffected |

---

## 9. New finding surfaced by the fix (not a regression — documented, not fixed)

`cs-2024-5238`'s source XML has a `specific-use="form-files"` entry
(`category="tables"`) whose `<named-content>` sub-elements supply
`data-type="type"`, `data-type="path"`, and `data-type="fileRights"` —
but genuinely **no `name`-typed `named-content` element at all**, under
either attribute spelling. Before this fix, this entry was
indistinguishable from every other corrupted entry (all had empty
names); after the fix, every *other* entry now correctly resolves,
which isolates this one as a real, standalone gap. The `path` field
(`/ppl/cs/cs-2024-5238/inputs/R1/A2B_Tables 1 and 2_revised.docx`) does
contain the real filename as its basename — but deriving a filename
from a path hint when the dedicated name field is absent would be a new
fallback rule (new business logic), which this task's own instructions
explicitly forbid inventing without approval. **Not fixed. Documented
here and in the updated `certification_output/Article_5_Certification.md`
and `Failure_Analysis.md` for your review.**

---

## 10. Business Rule Impact Analysis

| Rule(s) | Impact |
|---|---|
| BR-011 (file inclusion completeness) | **Restored** for `bcj-2025-3130`/`bsr-2025-3205`; **newly, correctly enforced** (fails loudly instead of silently) for `cs-2024-5238`'s one gap |
| BR-013 (declared filename used verbatim as output filename) | **Restored** — every manifest item now carries its true declared name |
| BR-015 (round-folder placement) | **Restored** — `files/R1/...` now appears correctly |
| BR-018 (round×category grouping) | **Restored** — no more single-bucket collapse |
| BR-042 (custom-meta-group best-effort reconstruction in raw.xml) | **Restored** — real category/name/round values now populate the existing template, unchanged from its own established "best-effort, not verbatim" design |
| BR-066/143 (article.xml latest-round-only filter) | **Filtering mechanism restored to its pre-existing, already-documented behavior** — it now operates on real round labels again, but still exhibits the separately-tracked, unrelated TD-1 limitation (RoundInfo.label vs. physical round-folder mismatch) exactly as the 3 original golden packages already do. Not something this fix was scoped to address, and it was not touched. |
| BR-078 (item-type mapping) | **Restored** — categories are non-empty again, so the real mapping table is consulted instead of always hitting the fallback |
| BR-082/089/152/153 (manifest↔file referential integrity) | **Restored and verified exact** (18=18=18 hrefs/files for `bcj-2025-3130`; 2=2=2 for `bsr-2025-3205`) |
| BR-157/158 (manuscript / license-file presence) | **Restored** — `bcj-2025-3130` now correctly has 1 `item-type="manuscript"` item and 1 `item-type="author agreement"` item |
| No Business Rule Book text was changed, added, or reinterpreted. | This fix corrects the ICAM's *data*, not any rule's meaning. |

---

## 11. Architecture Compliance Report

Verified directly against the task's own explicit rules:

| Rule | Compliance |
|---|---|
| Do not redesign architecture | **Compliant** — zero new classes, zero new modules, zero new dependencies between layers |
| Do not change business rules | **Compliant** — Business Rule Book untouched; no rule's meaning altered |
| Do not introduce shortcuts | **Compliant** — the fix is a named, documented, tested tolerance function, not an inline hack |
| Maintain every architectural boundary | **Compliant** — both changes are internal to `extraction/`; no import added, removed, or redirected; `extraction` still has zero dependency on `generators`/`packaging`/`transform` internals (confirmed unchanged, per `grep` re-run) |
| Support both `content-type` and `data-type` | **Compliant** — `_resolve_content_type` checks both, in the documented priority order |
| Preserve backward compatibility | **Compliant** — proven via unchanged 24/24 golden-test outcome |
| Never change behavior for old packages | **Compliant** — `content-type`-first ordering guarantees this; empirically confirmed |
| Avoid duplicate extraction logic | **Compliant** — one helper function, one call site; `custom_meta_classifier.py` unchanged, still calls the same `_named_content`/`NamedContentField` contract it always did |
| Keep extractor responsibilities unchanged | **Compliant** — `custom_metadata_extractor.py` still "extracts everything it finds, without judgment"; no business-rule filtering was added |
| Preserve every architectural layer | **Compliant** — no generator, Package Builder, ICAM, or transformation file was modified |
| Update only the minimum required modules | **Compliant** — 2 source files, both inside the one layer the Failure Analysis identified |

---

## 12. Golden Comparison

| Check | Result |
|---|---|
| 3 original reference packages — golden tests | 24/24 passing, unchanged |
| 3 original reference packages — code path affected by this fix? | No (confirmed: all use `content-type` exclusively; guard never triggers on non-empty names) |
| Structural drift (DOCTYPE/namespace/DTD/encoding/DOI/license) | None — not touched by this fix, and the System Verification's own Regression Report already confirmed zero drift in the generation layer |

---

## 13. Certification Results — Final Matrix

| # | Article | Journal | Result | Reason |
|---|---|---|---|---|
| 1 | `etls-2025-3020` | Emerging Topics in Life Sciences | **FAIL** | Unchanged — genuine missing license-to-publish file in source package (Defect Class 2, unrelated to this fix) |
| 2 | `bsr-2025-3205` | Bioscience Reports | **PASS WITH WARNINGS** | File resolution now fully correct (2/2 files, exact manifest↔zip integrity); warnings = pre-existing TD-1 round-index mismatch and UNCONFIRMED journal config (business value, not a code defect) |
| 3 | `cs-2025-6682` | Clinical Science | **FAIL** | Unchanged — genuine license-file filename mismatch in source package (Defect Class 2, unrelated to this fix) |
| 4 | `bcj-2025-3130` | Biochemical Journal | **PASS WITH WARNINGS** | File resolution now fully correct (18/18 files, exact manifest↔zip integrity, R1 round restored); warnings = same TD-1/config caveats as above |
| 5 | `cs-2024-5238` | Clinical Science | **NOT CERTIFIED** | This fix's own defensive guard correctly unmasked a distinct, genuine, pre-existing source-data gap (one file entry with no name field under either attribute) — engine now fails safely rather than silently; requires a business/source-data decision, not a code fix |

**2 of 5 new packages now certifiable (up from 0 of 5). The remaining 3
are blocked by genuine source-data conditions, not engine defects** —
fully consistent with this task's own instruction not to invent
business logic to paper over missing/misnamed source data.

---

## 14. Remaining Risks

1. **TD-1 (pre-existing, unchanged)**: `RoundInfo.label` still never
   matches physical round-folder names, so article.xml's/reviews.xml's
   "latest round" filtering still operates on the wrong round label for
   any multi-round article — unchanged by this fix, already tracked,
   still requires a business decision on round-naming semantics.
2. **`cs-2024-5238`'s "tables" gap (new, narrow)**: one file per article
   with a `path` but no `name` field would need a business decision on
   whether deriving a filename from a path basename is ever acceptable
   — not decided here.
3. **Scope of the `data-type` convention beyond these 5 packages is
   unknown** — this fix makes the engine tolerant of it, but whether
   other not-yet-seen production packages use a third, still-different
   convention cannot be ruled out without further real data.
4. **Config confidence for `bcj`/`bsr`/`etls`** remains UNCONFIRMED
   (journal acronym, DOI prefix, provider names) — unrelated to this
   fix, unchanged from the original certification's own finding.

## 15. Recommendations

1. Regenerate and re-certify `bcj-2025-3130` and `bsr-2025-3205` as the
   production deliverables for this batch (both now PASS WITH WARNINGS).
2. Escalate `cs-2024-5238`'s missing-name-field gap and the 2 Defect
   Class 2 packages to the data/business owner — no further engine
   change is implicated for any of the 3.
3. Consider (separately, not part of this task) whether a durable,
   business-confirmed set of per-journal configuration files should be
   established before any of these journals are processed in a real
   production run — unchanged, standing recommendation from the
   original System Verification.
4. No other code change is recommended. The fix is minimal, tested, and
   fully backward-compatible.
