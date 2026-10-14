# MECA Package Generation Engine — Business Rule Book

Baseline: `REVERSE_ENGINEERING_REPORT.md`, `FUNCTIONAL_SPECIFICATION.md`. This document atomizes every rule identified in those two documents into a single numbered rule catalogue, each rule independently implementable and independently testable.

**Field legend**
- **Classification**: `Confirmed` (3/3 samples agree) · `Strongly Inferred` (2/3, or 3/3 with only one value ever observed) · `Requires Business Confirmation` (samples disagree or are silent).
- **Priority**: `Critical` (package is invalid/unusable without it) · `High` (materially wrong output) · `Medium` (cosmetic/secondary correctness) · `Low` (nice-to-have/edge case).

Rule IDs are stable identifiers — do not renumber if rules are added later; append instead.

---

## A. Ingestion & Source Structure (BR-001 – BR-010)

**BR-001 — Single Source-of-Truth XML**
Description: Every article's complete metadata lives in exactly one Kriyadocs-exported XML file at the root of the input package.
Purpose: Establishes the one authoritative parse target per article; nothing else in the input is a metadata source.
Input Source: Input zip root — `<ArticleID>.xml`.
Output Target: Internal article model (feeds all 5 output XMLs).
Transformation Logic: Locate the single root-level `.xml` file; if zero or more than one is found, fail ingestion for that article.
Validation Rule: Exactly one root-level XML file must exist; must be well-formed XML.
Dependencies: None (entry point).
Evidence: 3/3 packages, one root XML each.
Confidence: Confirmed.
Priority: Critical.

**BR-002 — Round Folders Are the Physical File Store**
Description: Submitted files are physically stored under round-named subfolders (`Original`, `R1`, ...) beneath the article root.
Purpose: Defines where to look for physical files once custom-meta identifies what to look for.
Input Source: Input zip, `<ArticleID>/<Round>/*`.
Output Target: `files/<Round>/*` in the output package.
Transformation Logic: Enumerate round subfolders present; each becomes a candidate round.
Validation Rule: At least one round folder must exist and contain at least one file referenced by custom-meta.
Dependencies: BR-001.
Evidence: 3/3.
Confidence: Confirmed.
Priority: Critical.

**BR-003 — Article ID Casing Is Preserved, Not Normalized**
Description: The `<ArticleID>` string used for output filenames/folder is copied exactly as the input folder/zip base name — casing and underscores included.
Purpose: Preserve traceability back to the exact source submission.
Input Source: Input zip's top-level folder name.
Output Target: All 5 output XML filenames (`<ArticleID>_article.xml` etc.).
Transformation Logic: `outputArticleId = inputFolderName` (no case-folding, no dash/underscore normalization).
Validation Rule: Output filenames must contain the identical string used as the input folder name.
Dependencies: BR-001.
Evidence: 3/3 (`cs-2025-6808`, `CS-2025-8493_C`, `cs-2025-8827` all preserved verbatim in output names).
Confidence: Confirmed.
Priority: Critical.

**BR-004 — Journal Is Always Clinical Science / Portland Press (in samples)**
Description: All 3 samples belong to the same journal (Clinical Science, Portland Press Limited).
Purpose: Journal-level constants (ISSN, publisher name, DOI prefix) can be looked up rather than parsed, if a multi-journal config exists.
Input Source: `journal-meta` in the Kriyadocs XML.
Output Target: `journal-meta` in raw.xml/article.xml; `provider-name`/`publication-title` in transfer.xml.
Transformation Logic: Copy `journal-meta` verbatim; do not hard-code "Clinical Science" in code — read it from source, since a future multi-journal deployment will need this to vary.
Validation Rule: `journal-meta/journal-title` must be non-empty.
Dependencies: BR-001.
Evidence: 3/3 same journal — no multi-journal sample exists.
Confidence: Strongly Inferred (structure is generic; only one journal has been observed).
Priority: High.

**BR-005 — Source Platform Is Kriyadocs**
Description: The Kriyadocs XML embeds platform-specific markers (`data-project`, `vocab-identifier="snapshots/..."`, `ppl.kriyadocs.com` resource URLs) not part of standard JATS.
Purpose: Confirms the ingestion parser must handle a Kriyadocs-specific superset of JATS, not generic JATS.
Input Source: Root Kriyadocs XML.
Output Target: N/A (parser design constraint).
Transformation Logic: Parser must tolerate/ignore unknown non-JATS elements rather than fail.
Validation Rule: Parser must not reject the document solely for containing non-JATS elements.
Dependencies: BR-001.
Evidence: 3/3.
Confidence: Confirmed.
Priority: Critical.

**BR-006 — Body Contains Title Page Only, Never Full Manuscript Text**
Description: The Kriyadocs XML's `<body>` holds only title/authors/affiliations/abstract/keywords — the full manuscript text is never present in XML form, only inside the submitted `.docx`.
Purpose: Prevents the converter from expecting (or trying to extract) full-text content from the XML.
Input Source: Kriyadocs XML `<body>`.
Output Target: raw.xml `<body>` (verbatim copy); absent from article.xml.
Transformation Logic: Copy `<body>` as-is; do not attempt to parse or supplement it with manuscript-file content.
Validation Rule: `<body>` must contain at least a `<title>`-page/author block and one `AbsPara`-class abstract paragraph.
Dependencies: BR-001.
Evidence: 3/3.
Confidence: Confirmed.
Priority: High.

**BR-007 — Custom-Meta Is the Audit-Trail-of-Record**
Description: All editorial/production history (decisions, reviewer scores, correspondence, file manifest) lives in `custom-meta-group`, not in separately-shaped sections.
Purpose: One consistent parse target for everything except pure bibliographic JATS.
Input Source: Kriyadocs XML `custom-meta-group/custom-meta`.
Output Target: Feeds raw.xml, article.xml, manifest.xml, reviews.xml.
Transformation Logic: Parse into a typed collection: file-entries / form-answers / reviewer-scorecards / decision-drafts / decline-reasons, keyed by `meta-name`.
Validation Rule: `custom-meta-group` must be present and parseable; a missing group is a hard ingestion error.
Dependencies: BR-001.
Evidence: 3/3.
Confidence: Confirmed.
Priority: Critical.

**BR-008 — Internal Workflow/Log Data Exists but Is Never Copied Verbatim**
Description: `workflow`, `stage`, `time-log`, `log`, correspondence (`mail-*`, `from`/`to`/`cc`, `assigned`, `user`, `useremail`) tags hold the raw editorial system trail; none of this is copied into any output XML as-is.
Purpose: Distinguishes "source material to interpret" from "content to pass through."
Input Source: Kriyadocs XML.
Output Target: Reconstructed into reviews.xml only (never copied directly).
Transformation Logic: Parse dates/identities/text out of this region; discard the wrapper tags themselves.
Validation Rule: N/A (internal-only region; not independently validated in output).
Dependencies: BR-007.
Evidence: 3/3.
Confidence: Confirmed.
Priority: High.

**BR-009 — One Kriyadocs XML Snapshot Represents the Entire Article Lifecycle**
Description: A single export contains data spanning submission through acceptance/production (not one file per round).
Purpose: The converter runs once per article, not once per round.
Input Source: Kriyadocs XML.
Output Target: All 5 output XMLs for one article.
Transformation Logic: Single-pass parse of the whole XML; round segregation happens downstream (§ Multi-Round rules).
Validation Rule: N/A.
Dependencies: BR-001.
Evidence: 3/3.
Confidence: Confirmed.
Priority: Critical.

**BR-010 — `vocab-identifier` Snapshot Numbers Are the Authoritative Round-Ordering Key**
Description: Each `article-version` element carries `vocab-identifier="snapshots/<N>_<stage>/..."`; `<N>` is a monotonically increasing integer across the article's lifecycle.
Purpose: Provides a reliable ordering key stronger than folder-name string comparison (avoids `"R10" < "R2"` lexical bugs).
Input Source: Kriyadocs XML `article-version/@vocab-identifier`.
Output Target: Internal round-ordering logic only (not directly copied to output).
Transformation Logic: Extract leading integer `N` from each `vocab-identifier`; sort rounds by `N` ascending.
Validation Rule: If multiple `article-version` elements share folder-round mapping ambiguously, flag for manual review.
Dependencies: BR-001.
Evidence: Present 3/3, but only 2 distinct rounds ever observed (Original, R1) so the ordering logic itself is inferred, not exhaustively tested.
Confidence: Strongly Inferred.
Priority: Medium.

---

## B. File Inclusion, Copy & Exclusion Rules (BR-011 – BR-025)

**BR-011 — Custom-Meta File Entries Are the Authoritative File List**
Description: A file is part of the package if and only if it has a `custom-meta[@specific-use="form-files"]` entry; directory contents are not independently trusted.
Purpose: Automatically excludes accidental/incidental files dropped into the source folder.
Input Source: `custom-meta` entries with `named-content[@content-type=name|path|type|size]`.
Output Target: `files/<Round>/<name>` + one `manifest.xml` item.
Transformation Logic: For each qualifying custom-meta entry, resolve `name`/`path` to a physical file and copy it; files without such an entry are skipped.
Validation Rule: Every custom-meta file entry must resolve to an existing physical file (hard error if not); files with no custom-meta entry generate a warning-level log line (not an error).
Dependencies: BR-002, BR-007.
Evidence: 3/3; confirmed against a 36-file browser-cache exclusion in pkg1.
Confidence: Confirmed.
Priority: Critical.

**BR-012 — Files Copied Byte-Identical**
Description: No re-encoding, re-compression, or content modification of any submitted file.
Purpose: Preserve exact submitted content for archival/legal fidelity.
Input Source: Physical file resolved via BR-011.
Output Target: `files/<Round>/<original filename>`.
Transformation Logic: Direct byte copy (stream copy); no format conversion of any kind.
Validation Rule: Output file checksum (MD5/SHA-256) must equal input file checksum.
Dependencies: BR-011.
Evidence: 3/3, MD5-verified.
Confidence: Confirmed.
Priority: Critical.

**BR-013 — Original Filenames Preserved Exactly**
Description: Spaces, mixed case, parentheses, and unusual characters in filenames are kept as-is.
Purpose: Filenames are referenced by manifest.xml `xlink:href`; any renaming breaks that link and loses provenance.
Input Source: `named-content[@content-type=name]`.
Output Target: `files/<Round>/<name>`.
Transformation Logic: No slugification, no whitespace stripping, no case change.
Validation Rule: Output filename string must be byte-identical to the source `name` field.
Dependencies: BR-011.
Evidence: 3/3.
Confidence: Confirmed.
Note (ADR-032, Milestone 10): this rule's own text is unchanged and remains the correct description of default/strict behavior. As a separate, configurable, opt-in *product* extension — not a correction of this rule — when the `name` field is entirely absent but `declared_path_hint` (BR-016) is present and usable, the engine may derive a filename from it for generation purposes only, recording a mandatory `BR013_FALLBACK_FILENAME_FROM_PATH` warning. See ADR-032 for the full decision record; `allow_filename_fallback: false` restores this rule's literal behavior with no code changes.
Priority: Critical.

**BR-014 — Browser-Cache / Non-Submission Artifacts Are Excluded**
Description: Files such as `*.docx.html` and its `*_files/` sibling folder (Office-Online "saved webpage" artifacts) are not real submission files and must not appear in output.
Purpose: Keeps the MECA package clean of accidental local-machine artifacts.
Input Source: Physical folder contents with no matching custom-meta entry.
Output Target: N/A (excluded).
Transformation Logic: A consequence of BR-011, not a separate pattern-match rule — do not build filename-pattern denylists; rely on the custom-meta-driven inclusion instead.
Validation Rule: No file lacking a custom-meta entry may appear under `files/`.
Dependencies: BR-011.
Evidence: pkg1 (36 excluded files).
Confidence: Confirmed.
Priority: High.

**BR-015 — Round Subfolder Name Copied Verbatim into Output**
Description: The output `files/` subfolder name equals the input round-folder name exactly.
Purpose: No renaming of round labels (`Original`, `R1`, ...).
Input Source: Input folder name.
Output Target: `files/<Round>/`.
Transformation Logic: Direct string copy.
Validation Rule: Set of round-folder names under output `files/` must equal the set under input, minus any round with zero qualifying files.
Dependencies: BR-002.
Evidence: 3/3.
Confidence: Confirmed.
Priority: High.

**BR-016 — Physical File Path Resolution Tolerates Leading-Slash Variance**
Description: The `path` field in custom-meta sometimes begins with `_temp/...` and sometimes `/_temp/...` (leading slash present or absent) for otherwise-equivalent entries.
Purpose: File resolution logic must not depend on exact leading-slash presence.
Input Source: `named-content[@content-type=path]`.
Output Target: N/A (internal resolution only — final output filename comes from BR-013, not this path).
Transformation Logic: Normalize/strip leading slash before resolving; treat `path` as a hint only — actual file discovery is by matching `name` against files physically present in the round folder.
Validation Rule: File resolution must succeed regardless of leading-slash variance.
Dependencies: BR-011.
Evidence: pkg3 (`manuscript` entry has a leading `/`, all others don't).
Confidence: Confirmed.
Note (ADR-032, Milestone 10): "hint only, not authoritative" remains this rule's correct default reading. See BR-013's own note — `allow_filename_fallback` is the only, explicitly-configurable exception, applied solely when `name` is entirely absent, never as a general reinterpretation of this rule.
Priority: Medium.

**BR-017 — One Supplementary File Path Points Outside `_temp` (Direct Input Path)**
Description: At least one custom-meta path in the samples points to `/ppl/cs/<id>/inputs/Original/<file>` rather than a `_temp/<uuid>/` staging path.
Purpose: File-resolution logic must handle both staging-path and direct-input-path styles.
Input Source: `named-content[@content-type=path]`.
Output Target: N/A (resolution only).
Transformation Logic: Do not assume all paths share the `_temp/<uuid>/` shape; resolve primarily by matching `name` to a file physically present in the expected round folder, using `path` only as a secondary hint/log field.
Validation Rule: Resolution must succeed for both path shapes.
Dependencies: BR-011, BR-016.
Evidence: pkg3 (`Supplementary_RNA_sequencing_data_of_All_samples.xlsx`).
Confidence: Confirmed.
Priority: Medium.

**BR-018 — A File Category Key Can Recur Across Multiple Rounds**
Description: The same custom-meta key (e.g. `manuscript`, `figure`, `coverletter`) appears once per round, each pointing at that round's version of the file.
Purpose: Distinguishes "one canonical file per category" from "one file per category per round."
Input Source: `custom-meta` grouped by round + `meta-name`.
Output Target: `files/<Round>/...` (all rounds); `manifest.xml` (all rounds); `article.xml` custom-meta (latest round only, see BR-066).
Transformation Logic: Group file entries by (round, category) — never collapse rounds together.
Validation Rule: No two entries in the same round for the same category should silently overwrite one another without a log entry.
Dependencies: BR-007, BR-011.
Evidence: 3/3 (manuscript, figure, coverletter, supplement categories repeat per round).
Confidence: Confirmed.
Priority: Critical.

**BR-019 — Category Vocabulary Is Open, Not a Fixed Enum**
Description: Observed file-category keys include `manuscript`, `figure`, `supplement`, `coverletter`, `responsetoreviewer`, `trackchanges`, `licencetopublishform`, `tables` — and this list is not exhaustive (pkg1 alone contributes `tables`, which the other two packages never use).
Purpose: The item-type mapping (BR-078) must have a documented default ("supplemental") for any unrecognized future category, rather than failing.
Input Source: `custom-meta/meta-name` values.
Output Target: `manifest.xml` `item-type`.
Transformation Logic: Maintain an explicit category→item-type lookup table (BR-078) with a default fallback of `supplemental` for unmapped keys.
Validation Rule: An unmapped category key must not cause ingestion failure — log a warning and apply the default.
Dependencies: BR-018.
Evidence: 8 distinct category keys observed across 3 packages, no two packages share the exact same set.
Confidence: Confirmed (open vocabulary); Strongly Inferred (default-fallback behavior, since no sample shows an actually-unmapped key).
Priority: High.

**BR-020 — `[object Object]` in the `file` Named-Content Field Is a Source-System Artifact**
Description: The `named-content[@content-type=file]` value is literally the string `[object Object]` in every sample — a JavaScript object serialization defect baked into the Kriyadocs export itself.
Purpose: This field must never be used for anything (not a real value); do not attempt to interpret or repair it.
Input Source: `named-content[@content-type=file]`.
Output Target: Not used anywhere downstream.
Transformation Logic: Ignore this field entirely.
Validation Rule: N/A — must not cause a validation failure.
Dependencies: BR-007.
Evidence: 3/3, every file entry.
Confidence: Confirmed.
Priority: Low.

**BR-021 — File Size Field Is Available but Currently Unused Downstream**
Description: `named-content[@content-type=size]` carries the byte size of the original upload.
Purpose: Potential validation aid (compare declared size vs. actual copied file size) not currently exploited in any sample output.
Input Source: `named-content[@content-type=size]`.
Output Target: None currently; recommended validation use (see Test Spec).
Transformation Logic: Available for a file-integrity cross-check: `sizeInSource == actualFileSize`.
Validation Rule: Recommended: flag mismatch as a warning (source metadata may be stale, not necessarily a real corruption).
Dependencies: BR-011.
Evidence: 3/3 field always present.
Confidence: Confirmed (field exists); Requires Business Confirmation (whether to actively validate against it).
Priority: Medium.

**BR-022 — `ppi` Field Is Present but Unused**
Description: `named-content[@content-type=ppi]` is `"null"` in every sample.
Purpose: No observed downstream use; flag as dead field unless a future sample shows otherwise.
Input Source: `named-content[@content-type=ppi]`.
Output Target: None.
Transformation Logic: Ignore.
Validation Rule: N/A.
Dependencies: BR-007.
Evidence: 3/3, always `"null"`.
Confidence: Confirmed.
Priority: Low.

**BR-023 — No Format Conversion of Any File Type**
Description: `.doc`, `.docx`, `.pdf`, `.jpg`, `.xlsx` files are all passed through untouched — no PDF flattening, no image re-compression, no DOCX-to-PDF conversion.
Purpose: The converter is a metadata/packaging tool, not a document-processing tool.
Input Source: Physical files.
Output Target: `files/<Round>/*`.
Transformation Logic: Pure byte copy for every recognized (and unrecognized) file type.
Validation Rule: Output file byte-for-byte identical to input (same as BR-012, restated at the file-type level for clarity).
Dependencies: BR-012.
Evidence: 3/3.
Confidence: Confirmed.
Priority: Critical.

**BR-024 — Round Folder With Zero Qualifying Files Produces No Output Subfolder**
Description: If a round folder exists physically but every file in it lacks a custom-meta entry, no `files/<Round>/` subfolder should be created.
Purpose: Avoid empty/meaningless directories in the output package.
Input Source: Round folder contents vs. custom-meta entries.
Output Target: `files/` tree.
Transformation Logic: Only materialize a round subfolder once at least one file is confirmed for it.
Validation Rule: No empty subfolder under `files/`.
Dependencies: BR-011, BR-015.
Evidence: Not directly observed (all sample rounds have qualifying files) — inferred from the general custom-meta-driven rule.
Confidence: Strongly Inferred.
Priority: Low.

**BR-025 — Unreferenced Physical Files Should Be Logged, Not Silently Dropped**
Description: A file physically present but with no custom-meta entry is excluded from the package (BR-011) but should still be recorded in the run log for operator review.
Purpose: Catches source-system tagging errors (a real submission file the source system forgot to tag) before they become silent data loss.
Input Source: Directory scan vs. custom-meta entries.
Output Target: Run log / processing report (not the package itself).
Transformation Logic: Diff directory contents against resolved custom-meta file list; log every unmatched physical file at WARN level.
Validation Rule: N/A (informational).
Dependencies: BR-011.
Evidence: None directly (no sample confirms this is done) — new operational recommendation.
Confidence: Requires Business Confirmation.
Priority: Medium.

---

## C. Media-Type & Extension Mapping (BR-026 – BR-035)

**BR-026 — `.doc`/`.docx` → `application/msword`**
Description: Both legacy and OOXML Word formats map to the same, older MIME type.
Purpose: Manifest `instance/@media-type` value.
Input Source: File extension.
Output Target: `manifest.xml` `instance/@media-type`.
Transformation Logic: Extension-to-MIME lookup table entry.
Validation Rule: Value must be a syntactically valid MIME type.
Dependencies: BR-011.
Evidence: 3/3 for both extensions.
Confidence: Confirmed (as observed); Requires Business Confirmation (whether `.docx` should instead use the modern OOXML MIME type per current MECA/JATS best practice).
Priority: High.

**BR-027 — `.pdf` → `application/pdf`**
Standard mapping. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-028 — `.xlsx` → `application/vnd.ms-excel`**
Legacy Excel MIME type used for the modern OOXML spreadsheet extension. Evidence: pkg3 (RNA-seq data file). Confidence: Confirmed (as observed); Requires Business Confirmation (modern MIME type is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). Priority: High.

**BR-029 — `.jpg`/`.jpeg` → `image/jpeg`**
Standard mapping. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-030 — Generated `_article.xml` Manifest Item → `application/xml`**
Applies only to the 3 fixed metadata items (article/reviews/transfer), not to submitted files. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-031 — No Sample Contains `.png`/`.tif`/`.zip`/other Extensions**
Purpose: Behavior for unmapped extensions is undefined by evidence. Recommend an extensible, externally-configurable lookup table with a safe default (`application/octet-stream`) rather than a hard failure. Confidence: Requires Business Confirmation. Priority: High.

**BR-032 — Media-Type Table Must Be External Configuration, Not Hard-Coded**
Purpose: New file types will appear in a 6,000–10,000-article production run that never appeared in 3 samples; the table must be editable without a code deployment. Confidence: Requires Business Confirmation (design recommendation, not sample-derived). Priority: High.

**BR-033 — Extension Matching Is Case-Insensitive**
Description: Not directly tested (all sample extensions are lower-case), but file uploads at scale will include `.JPG`, `.PDF`, etc.
Confidence: Strongly Inferred. Priority: Medium.

**BR-034 — Media-Type Is Never Derived from File Content (Magic Bytes)**
Description: All 3 samples show media-type strictly following the file extension, never a sniffed content-type.
Purpose: Confirms a simple extension-lookup implementation is sufficient and matches observed behavior; content-sniffing would be extra, unrequested complexity.
Confidence: Confirmed. Priority: Medium.

**BR-035 — A File With No Extension or an Unrecognized Extension Requires a Defined Fallback Behavior**
Description: Not observed in samples; must be defined before production use given the scale (10,000+ articles will include edge-case filenames).
Confidence: Requires Business Confirmation. Priority: High.

---

## D. `raw.xml` Generation Rules (BR-036 – BR-050)

**BR-036 — raw.xml Uses JATS Journal Publishing DTD v1.3**
DOCTYPE: `-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.3 20210610//EN`, system id `JATS-journalpublishing1-3.dtd`. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-037 — raw.xml Declares 4 Namespaces Unconditionally**
`xmlns:mml`, `xmlns:xlink`, `xmlns:xsi`, `xmlns:ali` always present on `<article>`, regardless of whether the document uses MathML/xlink in that instance. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-038 — raw.xml Encoding Declared as Upper-Case `UTF-8`**
Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-039 — raw.xml Retains Every Source `id="uuid"` Attribute**
Purpose: Preserves the Kriyadocs internal identity of every element for traceability/audit. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-040 — raw.xml `article-type` Is Always `research-article`**
Description: Regardless of the source `display-channel` value ("Research Article", "Review Article", "Research"). Evidence: 3/3. Confidence: Confirmed (as a literal pass-through value that happens to be constant in source — verify this isn't itself a source-side default). Priority: High.

**BR-041 — raw.xml Strips All Internal Workflow/Log Tags**
Removes `workflow`, `stage`, `time-log`, `log`, `mail-subject`, `mail-body`, `from`, `to`, `cc`, `assigned`, `user`, `useremail`, `object`, `variable`, and generic styling wrappers (`div`, `span`, `a`, `b`, `i`, `em`, `strong`, `ol`, `li`, `br`, `s` used as HTML-style formatting, not JATS). Evidence: 3/3 (tag-count-diffed). Confidence: Confirmed. Priority: Critical.

**BR-042 — raw.xml Retains 100% of `custom-meta-group`**
No pruning at all — every key, every round, every duplicate. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-043 — raw.xml `<body>` Is a Verbatim Copy**
No transformation beyond whatever namespace/id handling applies document-wide. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-044 — raw.xml Is Pretty-Printed**
Source is single-line/minified; output is indented, human-readable XML. Evidence: 3/3. Confidence: Confirmed. Priority: Low (cosmetic, but affects any downstream diffing/QA process).

**BR-045 — raw.xml Preserves `permissions/copyright-statement` Wording Exactly as Sourced**
Even when wording differs between articles ("The Author(s)." vs "The Authors."). Do not normalize. Evidence: 3/3 (2 distinct wordings observed, both preserved). Confidence: Confirmed. Priority: Medium.

**BR-046 — raw.xml Never Adds a `<license>` Element**
The source Kriyadocs `permissions` block never includes a machine-readable license; raw.xml reflects that absence exactly (only article.xml synthesizes one — see BR-058). Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-047 — raw.xml `history` Dates Are a Direct Copy**
`received`, `revision`, `accepted` dates copied verbatim; cross-checked for internal consistency against reviews.xml decision dates. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-048 — raw.xml Filename Pattern: `<ArticleID>_raw.xml`**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-049 — raw.xml `dtd-version` Attribute Fixed at `"1.3"`**
Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-050 — raw.xml Retains `xml:lang="en"` Unconditionally**
Evidence: 3/3 (all 3 sample articles are English). Confidence: Strongly Inferred (no non-English sample exists to confirm this varies correctly by source language). Priority: Medium.

---

## E. `article.xml` Generation Rules (BR-051 – BR-075)

**BR-051 — article.xml Is Derived From raw.xml, Not Re-Parsed From Source**
Purpose: Establishes a strict internal pipeline order: Kriyadocs XML → raw.xml model → article.xml model. Evidence: 3/3 (no independent-extraction artifacts found; article.xml content is a strict subset/transform of raw.xml). Confidence: Confirmed. Priority: Critical.

**BR-052 — article.xml Uses JATS Archiving & Interchange DTD v1.2**
DOCTYPE: `-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2 20190208//EN`. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-053 — article.xml Encoding Declared Lower-Case `utf-8`**
Deliberately different casing from raw.xml's upper-case `UTF-8`. Evidence: 3/3. Confidence: Confirmed. Priority: Low (but must be replicated exactly for byte-for-byte QA diffing against samples).

**BR-054 — article.xml Strips Every `id="uuid"` Attribute**
No element in article.xml carries an internal Kriyadocs id. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-055 — article.xml Removes `xmlns:mml`, `xmlns:xsi`, `xmlns:ali`, `xml:lang`**
Only `xmlns:xlink` may remain (see BR-056). Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-056 — article.xml Declares `xmlns:xlink` If and Only If an `xlink:*` Attribute Is Used**
Purpose: Avoids invalid XML (undeclared namespace prefix). Evidence: pkg1/pkg2 declare it and use it; pkg3 fails to declare it despite using it (a defect — see BR-091). Confidence: Confirmed as the *correct* rule; pkg3 is the counter-example proving the rule was violated, not disproving it. Priority: Critical (validity-breaking if violated).

**BR-057 — article.xml `article-type` Is Always `"Original Study"`**
Independent of source `display-channel` (confirmed against both "Research"-family and "Review Article" source values). Evidence: 3/3. Confidence: Strongly Inferred (constant across all observed inputs, but the input sample never included a non-Research/Review type such as Correction or Editorial). Priority: Critical.

**BR-058 — article.xml DOI Is Generated, Never Copied**
Formula: `"10.1042/" + doi_article_id.replace("-","").replace("_","")`, preserving original character casing. Evidence: 3/3 exact matches. Confidence: Confirmed. Priority: Critical.

**BR-059 — DOI Prefix `10.1042` Is a Portland-Press-Wide Constant (as observed)**
Not verified against a different Portland Press journal; must be externally configurable per publisher/journal in a multi-tenant system. Evidence: 3/3 (same value). Confidence: Strongly Inferred. Priority: High.

**BR-060 — article.xml Copies `article-categories`, `title-group`, `contrib-group`, `aff`, `kwd-group`, `funding-group`, `history`, `counts` With Ids Stripped**
Content identical to raw.xml aside from id removal. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-061 — article.xml Strips `xlink:href`/`xlink:type` From `author-notes/corresp/email`**
Plain `<email>address</email>` remains. Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-062 — article.xml `permissions/copyright-statement` Copied Verbatim From raw.xml**
Same wording-variance caveat as BR-045. Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-063 — article.xml Synthesizes a `<license>` Block When License Type = "CC BY"**
Generated text: `"This is an open access article published by Portland Press Limited on behalf of the Biochemical Society and distributed under the Creative Commons Attribution License 4.0 (CC BY)."` with `ext-link` to `https://creativecommons.org/licenses/by/4.0/`. Evidence: 3/3 identical license-p text. Confidence: Confirmed. Priority: Critical.

**BR-064 — `<license>` Must Carry `license-type="open-access"` and `xmlns:xlink` Attributes**
Evidence: pkg2/pkg3 include both; pkg1 includes neither (defect, see BR-090). Confidence: Confirmed as the correct target shape. Priority: High.

**BR-065 — No Sample Demonstrates Non-CC-BY License Handling**
All 3 samples are CC-BY OA articles. Behavior for a subscription/all-rights-reserved article is undefined. Confidence: Requires Business Confirmation. Priority: Critical (blocks generalized production use).

**BR-066 — article.xml custom-meta Retains Only the Latest Round's File-Manifest Entries**
When a category (e.g. `manuscript`) exists in multiple rounds, only the most recent round's entry survives into article.xml (raw.xml keeps all). Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-067 — article.xml custom-meta Drops All `QN_*` Reviewer-Scorecard Keys**
Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-068 — article.xml custom-meta Drops `reviewer-decline-reasons`**
Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-069 — article.xml custom-meta Drops `Decision Draft` Full-Text Entries**
This content is relocated into reviews.xml instead of being duplicated in article.xml. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-070 — article.xml custom-meta Keeps Only the Final `submission-decision` Value(s)**
Earlier-round decision values (e.g. "Send to Author resubmission") are dropped once a later round supersedes them. Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-071 — article.xml custom-meta Pruning Is a Deny-List, Not an Allow-List**
Every other key — including package-unique ones like `Ethical Research Statement`, `Clinical perspective`, `Submitting Author Details`, `ccc-integration-status`, `pdf-job-id`, `copyeditor information`, `Article Language`, `tables`, `High risk`, `Author Resubmission` — passes through unchanged. Evidence: 3/3 (each package retains keys the others don't have). Confidence: Confirmed. Priority: Critical (misimplementing this as an allow-list will silently drop legitimate business data on articles with different form-answer sets).

**BR-072 — article.xml Never Includes a `<body>` Element**
Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-073 — article.xml Filename Pattern: `<ArticleID>_article.xml`**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-074 — article.xml `dtd-version` Attribute Fixed at `"1.2"`**
Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-075 — Any Custom-Meta Key Beginning `QN_` Is Treated as a Reviewer-Scorecard Field, Regardless of Suffix Number**
Purpose: Robust rule for BR-067 that doesn't require enumerating every observed `QN_NN` value; new scorecard questions must still be excluded automatically. Evidence: 3/3 (13–14 distinct `QN_` keys observed, not a fixed set). Confidence: Confirmed pattern; Strongly Inferred as a prefix-match rule (never tested against a `QN_` key that should NOT be excluded). Priority: High.

---

## F. `manifest.xml` Generation Rules (BR-076 – BR-095)

**BR-076 — manifest.xml Uses NISO MECA Manifest DTD v1.0**
DOCTYPE: `-//MECA//DTD Manifest v1.0//en`, root `xmlns="https://manuscriptexchange.org/schema/manifest"`. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-077 — manifest.xml Always Lists Exactly 3 Fixed Metadata Items First**
`item-article` (article-metadata), `item-reviews` (review-metadata), `item-transfer` (transfer-metadata), in that fixed order, before any file item. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-078 — File Item-Type Lookup Table**
`manuscript`→`manuscript`; `figure`→`figure`; `licencetopublishform`→`author agreement`; all others (`coverletter`, `supplement`, `responsetoreviewer`, `trackchanges`, `tables`, unmapped future keys)→`supplemental`. Evidence: 3/3, every observed key maps consistently. Confidence: Confirmed. Priority: Critical.

**BR-079 — item-description for Fixed Items Is a Constant Template**
`item-article`: `"Article metadata exported from JATS (publisher-id: <publisher-id>)"`. `item-reviews`: `"MECA reviews.xml generated from JATS custom-meta and history dates"` (fully constant). `item-transfer`: `"MECA transfer.xml with source/destination info"` (fully constant). Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-080 — Fixed-Item `<publisher-id>` Interpolation Uses the Verbatim `article-id[@pub-id-type=publisher-id]` Field**
Not the DOI-id field; not normalized in any way. Evidence: 3/3 (each package's own publisher-id format is reproduced exactly). Confidence: Confirmed. Priority: High.

**BR-081 — File Item `instance/@media-type` Follows the Extension Lookup Table (§C)**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-082 — File Item `instance/@xlink:href` Is the Package-Relative Path `files/<Round>/<filename>`**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-083 — Item Ordering: Latest Round First, Earlier Round(s) Appended**
Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-084 — Item `item-description` for File Items Should NOT Be a Naive Field-Concatenation**
The observed pattern (concatenating type+name+path with missing separators, then truncating unpredictably) is a defect (see human-mistakes catalogue), not a rule to replicate. Recommended replacement: a clean, deterministic template, e.g. `"<category> — <original filename> (<size> bytes)"`. Confidence: Requires Business Confirmation (exact wording), but Confirmed that the observed pattern must NOT be replicated. Priority: High.

**BR-085 — Item `@id` Values Must Be Deterministically Generated, Not Copied From Any Broken Source Pattern**
Observed ids (`file-1`..`file-17`, then `file-111`..`file-1119` with unexplained gaps) are a clerical artifact, not a formula. Recommended: `file-<sequence>` incrementing across the whole document in the defined round-then-file order (BR-083), or `file-<round>-<sequence>` if per-round grouping in the id itself is desired. Confidence: Requires Business Confirmation (exact scheme); Confirmed that the observed scheme is broken. Priority: High.

**BR-086 — manifest.xml Encoding Declared Upper-Case `UTF-8`**
Evidence: 3/3. Confidence: Confirmed. Priority: Low.

**BR-087 — manifest.xml `manifest-version` Attribute Fixed at `"1"`**
Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-088 — manifest.xml Filename Pattern: `<ArticleID>_manifest.xml`**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-089 — Every File Copied Into `files/` Must Have Exactly One Corresponding manifest.xml Item, and Vice Versa**
Purpose: Cross-file integrity — this is the single most important package-level invariant. Evidence: 3/3 (verified by diff). Confidence: Confirmed. Priority: Critical.

**BR-090 — manifest.xml `xlink:href` Values Must Be URL-Safe / Correctly Escaped for Filenames Containing Spaces or Special Characters**
Not observed to require escaping in the 3 samples (hrefs contain raw spaces, e.g. `files/R1/Figure 1.jpg`, unescaped). Confirms the samples use raw (non-percent-encoded) relative paths.
Confidence: Confirmed (as observed — no escaping applied); Requires Business Confirmation (whether this is spec-correct for MECA `xlink:href` or should be percent-encoded). Priority: High.

**BR-091 — No Sample Includes a File Extension Requiring a media-type Not Already in the Lookup Table**
See BR-031. Confidence: Requires Business Confirmation. Priority: High.

**BR-092 — manifest.xml Must Always List the 3 Fixed Items Even for the Simplest Possible Package**
Inferred logically — not falsifiable from the samples (all 3 have those items) but foundational. Confidence: Confirmed. Priority: Critical.

**BR-093 — A Round With Zero Qualifying Files Contributes Zero manifest.xml Items**
Consistent with BR-024. Confidence: Strongly Inferred. Priority: Low.

**BR-094 — manifest.xml Item Count = 3 (fixed) + Σ(qualifying files across all rounds)**
Basic arithmetic invariant useful as an automated package-completeness check. Confidence: Confirmed. Priority: High.

**BR-095 — DOCTYPE System Identifier Path (`./schema/manifest-1.0.dtd`) Is a Relative Reference, Not a Resolvable URL**
The converter is not expected to embed or fetch the actual DTD file; the DOCTYPE is declarative/documentary. Confidence: Confirmed (present verbatim in all 3, never resolved/validated against an actual local DTD file in the sample packages). Priority: Medium.

---

## G. `reviews.xml` Generation Rules (BR-096 – BR-125)

**BR-096 — reviews.xml Uses NISO MECA Reviews DTD v1.0**
DOCTYPE: `-//MECA//DTD Reviews v1.0//en`, root `xmlns="https://manuscriptexchange.org/schema/reviews"`. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-097 — reviews.xml Root Declares `content-version="1.0"`**
Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-098 — Canonical Attribute Schema: `review-version`, `blinding`, `permission-to-publish`, `permission-to-transfer` on Every `<review>`**
Established by pkg2+pkg3 agreement; pkg1 omits all four (superseded pattern — see human-mistakes catalogue). Confidence: Confirmed (as the target schema, 2/3 agreement + DTD-completeness argument). Priority: Critical.

**BR-099 — `review-type` Enum Is Exactly `{"review", "decision"}`**
pkg1's third value `"CDATA"` is an illegal literal copied from the DTD's own attribute-declaration syntax and must never be produced. Confidence: Confirmed. Priority: Critical.

**BR-100 — `blinding` Is Always `"single"` (as observed)**
No sample shows open or double-blind review. Confidence: Strongly Inferred. Priority: Medium.

**BR-101 — `permission-to-publish` / `permission-to-transfer` Are Always `"yes"` (as observed)**
No sample shows a reviewer/editor withholding either permission. Confidence: Strongly Inferred. Priority: Medium.

**BR-102 — One `<review review-type="review">` Block Per (Reviewer × Round)**
Emitted regardless of outcome (completed, declined, terminated/auto-unassigned). Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-103 — A Completed Review Always Has a `recommendation` Review-Item**
Data = the reviewer's overall recommendation text (e.g. "Send for major revisions", "Accept", "Send for minor revisions"). Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-104 — A Completed Review's Free-Text Comments Split Into Author-Facing and Editor-Confidential Channels**
`attended-for="authors"`/`is-confidential="no"` vs. `attended-for="editor"`/`is-confidential="yes"`. Evidence: 3/3 (pkg2/pkg3 attribute-tagged; pkg1 undifferentiated single block — superseded pattern). Confidence: Confirmed. Priority: High.

**BR-105 — Confidential-to-Editor Comments Frequently Equal `"Same as author"`**
When the reviewer didn't separately compose confidential notes, the source system records this literal placeholder — copy it verbatim, do not invent new confidential text. Evidence: pkg3. Confidence: Strongly Inferred (1/3 directly observed, but internally consistent with how the source system works). Priority: Medium.

**BR-106 — A Declined/Terminated/Auto-Unassigned Reviewer Gets a Single Status-Only Review-Item**
No recommendation/comments items are fabricated when none were submitted. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-107 — Status Text Wording Is Derived From Source Status, Not From a Fixed Enum String**
Observed variants: `"Terminated - Auto Unassigned"`, `"Rejected - Declined review"` — exact phrasing may vary; do not hard-code one literal string as "the" status text. Confidence: Confirmed pattern; Strongly Inferred exact wording rule (compose from source status field + reason, don't hard-code). Priority: Medium.

**BR-108 — A Reviewer's Comments Submitted as an Uploaded PDF Produce a `review-item[@review-item-type=file]`**
Containing an `<ext-link>` to the source-hosted URL, not a copy of the file into `files/`. Evidence: pkg3. Confidence: Confirmed pattern; Requires Business Confirmation whether the linked file should instead be fetched and packaged (see ADR list). Priority: Critical (affects package self-containedness).

**BR-109 — One `<review review-type="decision">` Block Per Round's Editorial Decision**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-110 — Decision Review-Item Data Combines a Generated Summary Sentence With the Actual Decision-Letter Text**
Summary references decision outcome, date, editor(s) by name; not a single fixed template string byte-for-byte across packages — compose, don't hard-code. Evidence: 3/3 (shape consistent, exact wording varies). Confidence: Confirmed shape; wording is Strongly Inferred (compositional, not templated). Priority: High.

**BR-111 — A Combined Multi-Point Editor Screening Message Is Split Into One `review-item[correspondence]` Per Point**
Each gets its own generated `<title>` (e.g. `"Screening Check: ORCID (<date>)"`). Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-112 — Reviewer/Editor Identity Always Includes Both Name and Email**
`contrib[@contrib-type=reviewer|editor|associate-editor]/name` + `/email`. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-113 — `contrib-type` Values Observed: `reviewer`, `editor`, `associate-editor`**
No sample shows a `guest-editor` or other role — extendable but unverified beyond these 3. Confidence: Confirmed (as observed). Priority: Medium.

**BR-114 — Every `<review>` Carries `assigned`/`due`/`submitted` Dates Where Applicable**
`submitted` is absent for reviews with no submission event (declined/terminated before ever submitting). Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-115 — Dates in reviews.xml Must Be Internally Consistent With `history` Dates in article.xml/raw.xml**
E.g., a decision's `submitted` date should not postdate the article's own `accepted` history date. Evidence: cross-checked, consistent in pkg3. Confidence: Confirmed as a validation invariant. Priority: High.

**BR-116 — A Reviewer's Formal Scored Review May Be Duplicated as a Raw Correspondence Log Entry**
A second, separate `<review review-type="review">` with near-identical text tagged `review-item-type="correspondence"`, representing the raw "query action" log event distinct from the formal review submission. Evidence: pkg3 (2 instances), pkg1 (extensively, 29 queries). Confidence: Confirmed pattern exists; Requires Business Confirmation on whether it's always wanted (see ADR). Priority: Medium.

**BR-117 — Author-Suggested Reviewers May Be Captured as Their Own Review-Type Entries**
Observed only in pkg1 (`review-item-type` under a "CDATA"-tagged review, itself a defect — see BR-099) representing reviewers the *authors* nominated at submission, not assigned reviewers. Confidence: Requires Business Confirmation whether this category is in scope for standard packages (only 1/3 samples includes it). Priority: Low.

**BR-118 — Editor (Re-)Assignment History May Be Captured as a Correspondence-Type Entry Per Round**
Observed only in pkg1: a running list of which editor was assigned/terminated per round. Confidence: Requires Business Confirmation (scope, per BR-117 reasoning). Priority: Low.

**BR-119 — Post-Acceptance Copyediting/Typesetting/Publisher Queries With Author Replies May Be Captured**
Observed only in pkg1: a detailed production-stage query log (Publisher/Preeditor/Copyeditor queries with dated author responses and publisher resolution notes). Confidence: Requires Business Confirmation (scope). Priority: Low.

**BR-120 — reviews.xml Encoding Declared Upper-Case `UTF-8`**
Evidence: 3/3. Confidence: Confirmed. Priority: Low.

**BR-121 — reviews.xml Must Never Include a Byte-Order Mark (BOM)**
Present in pkg1/pkg3, absent in pkg2 — inconsistency classified as a build-tool artifact, not a rule. Converter output must be BOM-free. Confidence: Confirmed as a defect to avoid. Priority: Medium.

**BR-122 — reviews.xml Filename Pattern: `<ArticleID>_reviews.xml`**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-123 — Reviews and Decisions Are Ordered Chronologically Within the Document, Grouped by Round**
Evidence: 3/3 (comment-annotated block ordering follows Original-round events, then R1-round events). Confidence: Confirmed. Priority: Medium.

**BR-124 — Every `<review>` Must Resolve to Exactly One Round (`review-version`) Except Fixed/Ungrouped Entries**
Applies to the canonical (pkg2/pkg3) schema; some pkg1 entries (author-suggested reviewers) have no round association at all. Confidence: Confirmed for the canonical schema; ambiguous for the pkg1-only categories (BR-117-119). Priority: Medium.

**BR-125 — reviews.xml Must Never Fabricate Reviewer Content That Wasn't Actually Submitted**
A declined/terminated reviewer must never receive a synthesized `recommendation`/`comments` item — status-only, per BR-106. Confidence: Confirmed. Priority: Critical.

---

## H. `transfer.xml` Generation Rules (BR-126 – BR-140)

**BR-126 — transfer.xml Uses NISO MECA Transfer DTD v1.0**
DOCTYPE: `-//MECA//DTD Transfer v1.0//en`. Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-127 — transfer.xml XML Declaration Has No Encoding Attribute**
`<?xml version="1.0"?>` only — the one output file that omits `encoding=`. Evidence: 3/3. Confidence: Confirmed. Priority: Low (but must be replicated exactly).

**BR-128 — `transfer-source/service-provider/provider-name` Is Always `"Portland Press Limited"`**
Must become externally configurable for a multi-publisher deployment. Evidence: 3/3. Confidence: Confirmed (as observed, single publisher). Priority: High.

**BR-129 — `transfer-source` Contact Name Fields Are Always Empty**
`<surname>`/`<given-names>` blank in all 3 samples. Confidence: Strongly Inferred intentional (consistent absence, not a per-sample accident). Priority: Medium.

**BR-130 — `transfer-source`/`publication` Contact Email = Corresponding-Author Email**
Same value populates both the service-provider contact email and the publication contact email. Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-131 — `transfer-source` Contact Phone Is Always Empty**
No sample source XML carries a phone number either. Confidence: Strongly Inferred. Priority: Low.

**BR-132 — `publication/publication-title` = `journal-meta/journal-title`**
Evidence: 3/3. Confidence: Confirmed. Priority: High.

**BR-133 — `publication/acronym` Value Is Ambiguous — Two Candidate Rules Conflict**
2/3 samples use `"CLINSCI"` (not present anywhere in source data); 1/3 uses `"CS"` (matches source `abbrev-journal-title[@abbrev-type=publisher]` exactly). Cannot resolve from evidence alone. Confidence: Requires Business Confirmation. Priority: Critical (wrong acronym could break downstream Silverchair ingestion matching).

**BR-134 — `destination/service-provider/provider-name` Is Always `"Silverchair"`**
Must become externally configurable for a multi-destination deployment. Evidence: 3/3. Confidence: Confirmed (as observed, single destination). Priority: High.

**BR-135 — `destination/publication/publication-title` and `acronym` Mirror the Source Values**
Same acronym-ambiguity caveat as BR-133 applies here too (both source and destination blocks use the same acronym value in every sample). Confidence: Confirmed (mirroring behavior); Requires Business Confirmation (which acronym value). Priority: Critical.

**BR-136 — `security/authentication-code` = `"<publisher-id>|<publisher-id>"`**
Same value repeated, pipe-separated, using the verbatim `article-id[@pub-id-type=publisher-id]` field (not the DOI-id). Evidence: 3/3, resolves what earlier analysis flagged as an inconsistency. Confidence: Confirmed. Priority: Critical.

**BR-137 — `processing-instructions` Always Contains Exactly 2 Fixed Steps**
`"Validate Metadata"` (sequence 1), `"Ingest Article Package"` (sequence 2). Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-138 — `processing-comments` Is a Template Referencing the raw.xml Filename**
`"Generated automatically from source JATS: <ArticleID>_raw.xml"`. Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

**BR-139 — transfer.xml Filename Pattern: `<ArticleID>_transfer.xml`**
Evidence: 3/3. Confidence: Confirmed. Priority: Critical.

**BR-140 — transfer.xml Content Never Varies by Round**
Unlike manifest.xml/reviews.xml, transfer.xml has no round-specific content at all — it is generated once per article regardless of round count. Evidence: 3/3. Confidence: Confirmed. Priority: Medium.

---

## I. Multi-Round Processing Rules (BR-141 – BR-150)

**BR-141 — Round Set = {folder names physically present under the article root} ∩ {rounds referenced by qualifying custom-meta entries}**
Evidence: 3/3 (Original, R1 both present and both referenced). Confidence: Confirmed. Priority: Critical.

**BR-142 — "Latest Round" Is the Round With the Highest `vocab-identifier` Snapshot Number (BR-010), Not Highest Folder-Name String**
Confidence: Strongly Inferred (only 2 rounds ever observed; lexical vs. numeric ordering happen to agree at this scale). Priority: High.

**BR-143 — article.xml custom-meta Uses "Latest Round Wins" for File-Category Collisions**
Per BR-066. Confidence: Confirmed. Priority: High.

**BR-144 — manifest.xml Uses "All Rounds, Latest First" (No Collision Resolution)**
Per BR-083 — manifest.xml is exhaustive across rounds, unlike article.xml. Confidence: Confirmed. Priority: High.

**BR-145 — reviews.xml Tracks Reviewer/Editor Activity Per Round Independently**
The same person can have multiple `<review>` blocks, one per round, each a fully independent record (own dates, own content, own outcome). Confidence: Confirmed. Priority: Critical.

**BR-146 — raw.xml Never Distinguishes Rounds Structurally**
All custom-meta from all rounds sits in one flat `custom-meta-group`; round identity for a given entry must be inferred by developers/consumers from context (which is a raw.xml limitation inherited from source, not a converter defect). Confidence: Confirmed. Priority: Medium.

**BR-147 — A Package With Only One Round (No Revision) Should Still Produce All 5 XML Files**
Not directly observed (all 3 samples have ≥2 rounds) — inferred from general architecture (round count is a cardinality, not a structural branch). Confidence: Strongly Inferred. Priority: High.

**BR-148 — Round Naming Convention `Original`, `R1`, `R2`, ... Is Assumed but Only `Original`/`R1` Are Evidenced**
A source system using a different round-naming convention (e.g. `Revision 1`, `V2`) is unverified. Confidence: Requires Business Confirmation. Priority: Medium.

**BR-149 — The Converter Must Not Assume Exactly 2 Rounds**
Design for N rounds even though only 2 are evidenced, since production volume (6,000–10,000+ articles) will include articles with 0, 1, 3+ rounds. Confidence: Requires Business Confirmation (design principle, not sample-derived). Priority: Critical.

**BR-150 — Round-to-Round File Category Diffing (e.g., Which Figures Changed Between Rounds) Is Not Performed by Any Sample Output**
No output XML flags "this figure replaced that figure" — each round's files are independent entries. Confidence: Confirmed (absence of such a feature). Priority: Low.

---

## J. Cross-File Consistency & Package-Level Invariants (BR-151 – BR-160)

**BR-151 — `<ArticleID>` Prefix Must Be Identical Across All 5 Output Filenames**
Confidence: Confirmed. Priority: Critical.

**BR-152 — manifest.xml `xlink:href` References Must All Resolve to Files That Actually Exist in the Package**
Confidence: Confirmed as invariant. Priority: Critical.

**BR-153 — Every Physical File Under `files/` Must Be Referenced by Exactly One manifest.xml Item**
(Restates BR-089 as a package-level invariant for validation-engine design.) Priority: Critical.

**BR-154 — The DOI in article.xml Must Be Unique Across the Entire Production Batch**
Not testable from 3 unrelated-article samples, but a structural production requirement (duplicate DOIs will break downstream systems). Confidence: Requires Business Confirmation (uniqueness-checking scope: per-batch, per-journal, or global). Priority: Critical.

**BR-155 — history/date Values in article.xml Must Be Chronologically Sane**
`received` ≤ `revision` ≤ `accepted` (when all three are present). Evidence: 3/3 (all chronologically consistent). Confidence: Confirmed as validation rule. Priority: High.

**BR-156 — Every reviews.xml `<review review-type="decision">` Must Correspond to a `history/date` Entry of a Matching Type**
Evidence: pkg3 cross-checked. Confidence: Confirmed. Priority: Medium.

**BR-157 — A Package Must Contain at Least One `manuscript`-Category File**
No sample package lacks a manuscript file. Confidence: Confirmed (as observed); treat absence as a hard validation failure. Priority: Critical.

**BR-158 — A Package With an Open-Access License Must Contain a `licencetopublishform`-Category File (or Equivalent)**
All 3 CC-BY samples include one. Confidence: Strongly Inferred. Priority: Medium.

**BR-159 — The Converter Must Treat the Kriyadocs XML as Read-Only Input**
Never mutate or re-save the source file; all 5 outputs are newly generated documents. Confidence: Confirmed (implicit in every sample — source files are untouched). Priority: Critical.

**BR-160 — All 5 Output XML Files Belong to One Package and Must Be Generated Atomically**
A partial package (e.g. manifest.xml written but reviews.xml generation failed) must never be published as output — see restart/recovery design in the Architecture Decision Records. Confidence: Requires Business Confirmation (operational design principle, not sample-derived). Priority: Critical.

---

## K. Spec-Alignment Business Rules (BR-161 – BR-164)

Approved during the Business Rule Completion milestone
(`Proposed_Business_Rules.md`), following the DTD-compliance
milestone's corpus-wide classification. Each rule is a deterministic,
lossless structural transformation applied to article.xml only — no
value is invented, altered in meaning, or dropped.

**BR-161 — `<p data-type="...">` Is Renamed to `<p content-type="...">` in article.xml**
The source (Kriyadocs export) consistently uses `data-type` as a sub-classification label on `<p>` — never declared by the JATS Archiving DTD, which declares `content-type` (CDATA, `#IMPLIED`) for exactly this purpose. The value is copied unchanged; only the attribute name changes. Evidence: 202 occurrences across 37/37 articles in the DTD-compliance corpus, 100% resolved by this rename. Confidence: Confirmed. Priority: High.

**BR-162 — Comma-Separated `xref/@rid` Values Are Normalized to Whitespace-Separated**
XML's `IDREFS` attribute type is a whitespace-separated token list; a comma is never a valid separator. The source (e.g. `rid="aff1, aff2"`) is confirmed present verbatim in original publisher XML — normalizing the separator to a single space (`rid="aff1 aff2"`) does not add, remove, or reinterpret any reference; both tokens already exist as real ids in the same document. Only applied when the attribute value actually contains a comma — an already-valid whitespace-separated value is never touched. Evidence: 88 findings across 20/37 articles, 100% resolved by this normalization. Confidence: Confirmed. Priority: High.

**BR-163 — reviews.xml Emits a Structured `<name>` Instead of `<string-name>` When a Matching Structured Reviewer Identity Already Exists**
Reuses `transform/contributor_transformer.py`'s existing, already-computed reviewer-identity correlation (built for article.xml's own contrib-group, Milestone 9): when a `ReviewerScorecard`/`DeclineReason`'s flattened name or email exactly matches (case-insensitive) a structured `<contrib contrib-type="reviewer">` record elsewhere in the same source document, reviews.xml emits `<name><surname>/<given-names></name>` instead of the DTD-invalid `<string-name>`; every non-matching reviewer's `<string-name>` is unaffected (no name-splitting heuristic is ever applied). No new correlation logic — an existing, already-evidence-backed match is reused across two generators reading the same ICAM. Evidence: corpus-wide coverage is partial (13/37 articles have any matching structured record; matched articles typically resolve only one of several reviewers) — approved anyway as a net-positive, zero-risk improvement wherever a match exists; the remaining unmatched cases keep their existing, correct `<string-name>` fallback. Confidence: Confirmed (matching logic), Partial coverage acknowledged. Priority: Medium.

**BR-164 — Publisher Abbreviation Journal Title**
Some sources never provide `<abbrev-journal-title abbrev-type="publisher">` in `journal-title-group` — but the publisher abbreviation is fully determined by `journal-id[@journal-id-type="publisher-id"]` (already emitted from `identity.journal_id`) via a fixed, closed lookup table (`config/publisher-abbreviation-mapping.yaml`: cs→CS, bcj→BCJ, bst→BST, bsr→BSR, etls→ETLS, ebc→EBC). When missing, the engine inserts `<abbrev-journal-title abbrev-type="publisher">` immediately after `<journal-title>` and before any existing `<abbrev-journal-title>` elements (e.g. `abbrev-type="pubmed"`); a pre-existing publisher abbreviation is never duplicated. An unrecognized publisher-id is never guessed at — the XML is left unchanged and a Validation Only finding is recorded instead. Evidence: confirmed via real corpus data (e.g. `BCJ-2024-0504`, whose source has no publisher abbreviation at all). Confidence: Confirmed. Priority: Medium.

---

## Rule Count Summary

| Category | Rule Range | Count |
|---|---|---|
| A. Ingestion & Source Structure | BR-001–010 | 10 |
| B. File Inclusion/Copy/Exclusion | BR-011–025 | 15 |
| C. Media-Type & Extension Mapping | BR-026–035 | 10 |
| D. raw.xml Generation | BR-036–050 | 15 |
| E. article.xml Generation | BR-051–075 | 25 |
| F. manifest.xml Generation | BR-076–095 | 20 |
| G. reviews.xml Generation | BR-096–125 | 30 |
| H. transfer.xml Generation | BR-126–140 | 15 |
| I. Multi-Round Processing | BR-141–150 | 10 |
| J. Cross-File Invariants | BR-151–160 | 10 |
| K. Spec-Alignment Business Rules | BR-161–164 | 4 |
| **Total** | | **164** |

Classification totals: **Confirmed 112** · **Strongly Inferred 24** · **Requires Business Confirmation 28**.
Priority totals: **Critical 61** · **High 50** · **Medium 39** · **Low 14**.
