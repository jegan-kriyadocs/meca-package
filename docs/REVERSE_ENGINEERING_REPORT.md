# MECA Package Reverse-Engineering Report

Scope: 3 input/output pairs analyzed byte-for-byte.

| # | Article | Input zip | Output zip |
|---|---|---|---|
| 1 | cs-2025-6808 | Input/CS-2025-6808.zip | Output/MECA_cs-2025-6808.zip |
| 2 | cs-2025-8493_C | Input/CS-2025-8493_C.zip | Output/MECA_CS-2025-8493_C.zip |
| 3 | cs-2025-8827 | Input/cs-2025-8827.zip | Output/MECA_cs-2025-8827.zip |

Journal: **Clinical Science** (Portland Press Limited, ISSN 0143-5221/1470-8736). Source platform is clearly **Kriyadocs** (`data-project="cs"`, `vocab-identifier="snapshots/..."`, review-PDF links hosted at `ppl.kriyadocs.com/resources/ppl/cs/...`, `proofingEngine: InDesignSetterCC`). Destination platform is **Silverchair** (hard-coded in every `transfer.xml`).

---

## Phase 1 — Input structure

Each input zip is a single top-level folder named after the article ID (case varies: `CS-2025-6808`, `CS-2025-8493`, `cs-2025-8827`), containing:

- **`<articleid>.xml`** — one huge (0.9–2.1 MB), single-source-of-truth XML. It is **not** pure JATS — it's a Kriyadocs export that interleaves:
  - Standard JATS front-matter (`journal-meta`, `article-meta`: ids, categories/subjects, title-group, contrib-group w/ ORCID, affiliations, author-notes/corresp, permissions, funding-group, kwd-group, counts, `history`)
  - A `body` containing only the **title-page + abstract + keywords** (not the full manuscript text — that lives in the .docx files)
  - `custom-meta-group`: a flat key/value audit log combining (a) submission-form answers (Authorship, Third party consents, COI, Dual publication, Ethical statement, Clinical perspective, License Type, Submitting Author Details), (b) a **file manifest** — one custom-meta per submitted file (`manuscript`, `figure`, `supplement`, `coverletter`, `responsetoreviewer`, `trackchanges`, `licencetopublishform`) each carrying original filename + internal temp path + size, (c) reviewer scorecards (`QN_01…QN_17`), decision drafts, decline reasons — **duplicated once per submission round** (Original, then R1, ...)
  - Internal-only workflow noise not used downstream: `workflow`/`stage`/`time-log`/`log`/correspondence (`mail-body`/`mail-subject`/`from`/`to`/`cc`/`assigned`/`user`/`useremail`) — this is the raw editorial-system audit trail.
- **`Original/`** — files as first submitted: manuscript.docx, cover letter, figures (`figN.jpg`/`Fig N.jpg`), tables (.docx), supplements (PDF/xlsx).
- **`R1/`** (only present if the paper went through a revision round) — the resubmission set: revised manuscript, tracked-changes copy, response-to-reviewers, revised figures, revised cover letter, licence-to-publish/CRediT forms, plus **incidental browser-cache junk** in package 1 (a `*.docx.html` + `*_files/` folder — an Office-Online "saved webpage" artifact, entirely unrelated to the submission).

Naming is inconsistent across the three real-world submissions (`fig1.jpg` vs `Fig 1.jpg` vs `Figure 1.jpg`; `Cover letter.doc` vs `.docx`) — this is author-supplied variance, not a system rule.

---

## Phase 2 — Output (MECA) structure

Every output package is flat at the root plus one `files/` tree:

```
<ArticleID>_article.xml     — JATS "Archiving & Interchange" record (public/clean)
<ArticleID>_manifest.xml    — MECA manifest (NISO MECA 1.0 DTD)
<ArticleID>_raw.xml         — JATS "Journal Publishing" record (full internal metadata)
<ArticleID>_reviews.xml     — MECA reviews.xml (peer-review + decision history)
<ArticleID>_transfer.xml    — MECA transfer.xml (source/destination handshake)
files/Original/...          — verbatim copy of input Original/ (byte-identical, confirmed via md5)
files/R1/...                — verbatim copy of input R1/ (byte-identical), junk excluded
```

No new binary content is ever created — every file under `files/` is an untouched copy of an input file. All the "authored" work is in the 5 XML files.

---

## Phase 3 & 4 — Transformation rules / mapping matrix

### 3.1 File payload (`files/`)

| Input Source | Output Location | Transformation | Notes |
|---|---|---|---|
| `<ArticleID>/Original/*`, `/R1/*` | `files/Original/*`, `files/R1/*` | **Copied**, byte-identical, filename unchanged | Confirmed via md5 on multiple files across packages |
| Any file in `Original/`/`R1/` **not** referenced by a `custom-meta` file-entry in the root XML | *(excluded)* | **Removed** | Confirmed in pkg.1: a 36-file browser-cache dump (`*.docx.html` + `_files/`) has no matching custom-meta entry and is dropped entirely. **Rule: the custom-meta file-manifest is authoritative, not the directory listing.** |
| Round-folder names (`Original`, `R1`) | same | **Copied as-is** | Folder = submission round name from source system |

### 3.2 `<id>_raw.xml` ← root `<articleid>.xml`

| Input Source | Output Location | Transformation | Notes |
|---|---|---|---|
| `<article>` root, no DOCTYPE, JATS-ish but non-standard | `<article>` with `<!DOCTYPE article PUBLIC "...JATS...Journal Publishing DTD v1.3...">`, `dtd-version="1.3"`, adds `xmlns:ali` | **Reformatted** | Pretty-printed (indented), DOCTYPE + dtd-version + ali namespace added for JATS-Publishing conformance |
| `journal-meta`, `article-meta` (ids, categories, title, contrib-group, author-notes, permissions, funding-group, kwd-group, counts) | same, **with all `id="uuid"` attributes preserved** | **Copied verbatim** | Every element keeps its Kriyadocs UUID `id` |
| `body` (title-page/authors/affiliations/abstract/keywords only) | `body` | **Copied verbatim** (same UUIDs) | Full manuscript text is *not* here — it stays in the .docx |
| `custom-meta-group` (ALL rounds, ALL keys incl. QN_* scorecards, decision drafts, decline reasons) | `custom-meta-group` | **Copied verbatim, nothing dropped** | `raw.xml` = complete historical record |
| `workflow`, `stage`, `time-log`, `log`, `mail-*`, `assigned`, `user`, `useremail`, `object`, `variable`, internal `div`/`span`/styling wrappers | *(removed)* | **Stripped** | Internal editorial-system plumbing, not part of JATS and not needed downstream |

### 3.3 `<id>_article.xml` ← `<id>_raw.xml` (not the root input directly)

| Input Source | Output Location | Transformation | Notes |
|---|---|---|---|
| DOCTYPE "Journal Publishing DTD v1.3" | DOCTYPE **"Journal Archiving and Interchange DTD v1.2"** | **Reformatted** | Deliberately different JATS tag-set/DTD than raw.xml |
| all element `id="uuid"` attributes | *(removed)* | **Stripped** | article.xml has no internal ids anywhere |
| `xmlns:mml/xlink/xsi/ali`, `xml:lang` on `<article>` | mostly **removed**; `xmlns:xlink` kept only in pkg 1 & 2, **missing in pkg 3** even though pkg 3 uses an `xlink:href` on its license `ext-link` | **Stripped, inconsistently** | ⚠ Pkg 3's `article.xml` is not valid XML per its own usage (undeclared `xlink` prefix) — looks like a slip in the manual build, see Phase 6 |
| `article-type="research-article"` (raw) | `article-type="Original Study"` | **Replaced with a fixed value** | Identical across all 3 packages even though the source `display-channel` subject differs (pkg1 "Research Article", pkg2 **"Review Article"**, pkg3 "Research") → the value is **not derived** from source subject; looks like a constant. Needs confirmation (Phase 6). |
| `article-id[@pub-id-type=doi]` (raw, still just the manuscript ID, e.g. `cs-2025-8493_C`) | `article-id[@pub-id-type=doi]` = **real DOI** `10.1042/cs20258493C` | **Generated** | Rule (3/3 confirmed): `DOI = "10.1042/" + doi-article-id.replace("-","").replace("_","")`, case preserved as-is (only the "C" suffix stays upper-case because it already was) |
| `permissions/copyright-*` | same | **Copied** | |
| `permissions` — **no `<license>` in raw.xml at all** | `permissions/license` **newly added**: `license-type="open-access"`, CC-BY boilerplate paragraph + `ext-link` to `creativecommons.org/licenses/by/4.0/` | **Newly generated** | Driven by custom-meta `License Type = CC BY`; raw JATS never carried a machine-readable license block |
| `author-notes/corresp/email` with `xlink:href`/`xlink:type` | plain `<email>address</email>`, xlink attrs dropped | **Simplified/stripped** | Consistent with xlink-namespace removal above |
| `contrib-group`, `funding-group`, `kwd-group`, `history` (received/revision/accepted dates) | same content, ids stripped | **Copied (ids stripped)** | `history` dates line up with `reviews.xml` decision dates (cross-checked) |
| `custom-meta-group` (raw, ~90 entries, both rounds + QN_* + decision drafts) | `custom-meta-group` (~43 entries) | **Filtered** | Keeps: Article Summary, Ethical/consent/COI/Dual-pub statements, Clinical perspective, License Type, Submitting Author Details, plagiarism-report, **only the latest-round file-manifest entries** (manuscript/figure/supplement/coverletter/responsetoreviewer/trackchanges/licencetopublishform), and the final `submission-decision` chain. **Drops**: QN_* reviewer scorecards, `reviewer-decline-reasons`, `Decision Draft` full text (→ moved into `reviews.xml` instead), and the *first-round* file-manifest entries (Original-round files still appear in `files/Original`, they're just not re-listed in article.xml's custom-meta). |

### 3.4 `<id>_manifest.xml` ← `<id>_raw.xml` custom-meta file entries + fixed items

DTD: `-//MECA//DTD Manifest v1.0//en`.

| Input Source | Output Location | Transformation | Notes |
|---|---|---|---|
| (fixed) | `item id="item-article"` → `<ArticleID>_article.xml`, item-type `article-metadata` | **Generated boilerplate** | Always present, same wording pattern (`Article metadata exported from JATS (publisher-id: ...)`) |
| (fixed) | `item id="item-reviews"` → `<ArticleID>_reviews.xml`, item-type `review-metadata` | **Generated boilerplate** | |
| (fixed) | `item id="item-transfer"` → `<ArticleID>_transfer.xml`, item-type `transfer-metadata` | **Generated boilerplate** | |
| custom-meta `key="figure"` → filename | `item item-type="figure"` → `files/<round>/<filename>` | **Generated** | media-type inferred from extension (`.jpg`→`image/jpeg`) |
| custom-meta `key="manuscript"` | `item item-type="manuscript"` | **Generated** | |
| custom-meta `key="coverletter"`, `supplement`, `responsetoreviewer`, `trackchanges` | `item item-type="supplemental"` | **Generated** | All of these collapse to the single MECA type `supplemental` |
| custom-meta `key="licencetopublishform"` | `item item-type="author agreement"` | **Generated** | The one custom-meta key that gets its own distinct MECA item-type |
| custom-meta description/temp-path text | `item-description` | **Copied, garbled** | ⚠ Description text is truncated/mangled (mid-word cuts, stray literal `x` characters) in all 3 packages — looks like an artifact of a lossy string-truncation step in the manual build, not an intentional format (Phase 6) |
| — | `item id="file-1".."file-17"` (R1 round), then `"file-111".."file-1114"` (Original round) | **Generated, id scheme inconsistent** | id numbering isn't a clean sequence (`file-1110`, `file-1111`... look like string concatenation `"file-11"+index` bugs). Needs confirmation whether a specific id scheme is intended (Phase 6) |
| Original-round files always listed **after** R1-round files | — | **Ordering rule** | R1 (latest) items first, Original items appended at the end |

### 3.5 `<id>_reviews.xml` ← root XML's `custom-meta` (Decision Draft, QN_*, correspondence) + workflow log

DTD: `-//MECA//DTD Reviews v1.0//en`. This is the **most reconstructed / interpreted** file.

| Input Source | Output Location | Transformation | Notes |
|---|---|---|---|
| One reviewer's QN_01..17 scorecard + assign/due/submit dates + decline/terminate status (from `time-log`/`history`/`stage` per-reviewer) | `<review review-type="review">` block, one per reviewer **per round** | **Reconstructed/interpreted** | `review-version` = round name (`Original`/`R1`); `blinding="single"` constant in all samples; `permission-to-publish/transfer="yes"` constant |
| Reviewer overall score/recommendation text | `review-item[type=recommendation]` | **Mapped** | e.g. "Send for major revisions" |
| Full free-text review body (from correspondence/mail-body log) | `review-item[type=comments]`, split "to authors" (`is-confidential=no`) vs "to editor" (`is-confidential=yes`) | **Split & reconstructed** | Confidential-to-editor content often literally `"Same as author"` when the reviewer didn't add separate confidential notes |
| Reviewer who declined/was auto-unassigned (no scorecard) | `<review>` with a single `review-item[type=recommendation]` = "Terminated - Auto Unassigned" / "Rejected - Declined review" | **Reconstructed from status log** | No full review content because none was submitted |
| A reviewer's comments submitted as an uploaded PDF (not scored fields) | `review-item[type=file]` → `<ext-link>` to the Kriyadocs-hosted PDF URL | **Mapped, external link preserved** | Points at `ppl.kriyadocs.com/resources/...` — **this is a live/internal URL, not a packaged file** — flag for Phase 6 (does the receiving system need this file physically included instead of linked?) |
| Editor's "Decision Draft" custom-meta full text, per round | `<review review-type="decision">`, `review-item[type=decision]` | **Reconstructed** | Decision letter text re-used almost verbatim, prefixed with a generated summary line ("Send for major revisions. Decision letter issued ... by Editor ... and Associate Editor ...") |
| Editor screening/query checklist items (ORCID, reference format, DOIs, etc., from correspondence log) | Additional `<review review-type="decision">` with multiple `review-item[type=correspondence]`, one per checklist item | **Split into discrete items** | Each bullet of a combined checklist message becomes its own `review-item` with its own generated `<title>` |
| Query-action correspondence duplicating an already-scored review (e.g. reviewer's comments also logged as a "query action") | A **second, separate** `<review review-type="review">` block, `review-item[type=correspondence]` | **Duplicated deliberately** | The same reviewer's comments appear twice in reviews.xml: once as the formal scored review, once as the raw correspondence log entry — this looks intentional (audit-trail completeness) but should be confirmed (Phase 6) |
| Reviewer/editor name+email (from `contrib`/`useremail` in log) | `contrib-group/contrib[type=reviewer\|editor\|associate-editor]` | **Copied/mapped** | |
| assign/due/submit dates (`start-date`,`end-date`,`planned-*`) | `<date date-type="assigned\|due\|submitted">` | **Mapped 1:1** | |

### 3.6 `<id>_transfer.xml` — mostly fixed template

DTD: `-//MECA//DTD Transfer v1.0//en`.

| Input Source | Output Location | Transformation | Notes |
|---|---|---|---|
| (fixed) | `transfer-source/service-provider/provider-name` = "Portland Press Limited" | **Constant** | Same in all 3 |
| Corresponding-author email (`author-notes/corresp`) | `transfer-source/.../contact/email`, `publication/contact/email` | **Copied** | Same author email used twice |
| `transfer-source/contact/contact-name` | *(always empty)* | **Never populated** | Surname/given-names left blank in all 3 samples — either intentionally omitted or an unfinished field (Phase 6) |
| (fixed) | `destination/service-provider/provider-name` = "Silverchair" | **Constant** | Always the same hosting destination |
| `publication-title`/`acronym` (journal-meta) | `publication/publication-title`, `acronym` | **Copied**, both source & destination | |
| `article-id[doi]` value | `security/authentication-code` = `"<id>\|<id>"` | **Generated, but inconsistent format** | pkg1/pkg2 use the **publisher-id form** (`CS20256808`, no dashes, uppercase), pkg3 uses the **raw dashed doi-id form** (`cs-2025-8827`) — same info, different casing/format rule, needs a single confirmed convention (Phase 6) |
| (fixed) | `processing-instructions` (2 fixed steps: "Validate Metadata", "Ingest Article Package") + `processing-comments` = `"Generated automatically from source JATS: <id>_raw.xml"` | **Constant boilerplate**, only the filename varies | |

---

## Phase 5 — Consolidated rule list (to recreate the output)

1. **Unzip** input; treat the single root `<articleid>.xml` as the sole source of truth for metadata (never re-derive metadata by parsing the .docx/.pdf files themselves).
2. **File inclusion** = driven by `custom-meta` file entries in that XML, not by directory scan. Any file physically present but *not* referenced in custom-meta is excluded (kills browser-cache/junk).
3. **Copy** every referenced file byte-identical into `files/<round>/<original-filename>`, preserving the round folder name from the source (`Original`, `R1`, `R2`, ...).
4. Build **`_raw.xml`**: reformat/pretty-print the source XML into valid JATS-Publishing-DTD form (DOCTYPE + `dtd-version="1.3"` + `ali` namespace), keep all `id` UUIDs, keep the full (all-rounds) `custom-meta-group`, strip everything that isn't JATS (workflow/stage/log/mail-*/user/etc.), keep `body` as-is (title page + abstract only).
5. Build **`_article.xml`** from `_raw.xml`: switch to JATS-Archiving-DTD v1.2, strip all `id` attributes and most xlink/mml namespace usage, replace `article-type` with the fixed value `"Original Study"`, generate a real DOI (`10.1042/` + doi-id with `-`/`_` removed), synthesize a CC-BY `<license>` block from the `License Type` custom-meta value, and prune `custom-meta-group` down to public/final-round-only entries (drop QN_* scorecards, decline reasons, decision-draft full text, prior-round file entries).
6. Build **`_manifest.xml`**: 3 fixed metadata items (article/reviews/transfer) + one `<item>` per file, `item-type` mapped from the custom-meta key (`manuscript`→manuscript, `figure`→figure, `licencetopublishform`→"author agreement", everything else→supplemental), media-type from file extension, R1-round items listed before Original-round items.
7. Build **`_reviews.xml`**: for every distinct reviewer/editor + round found in the workflow log, emit a `<review>`; scored reviews get `recommendation`+`comments` items (split confidential/non-confidential); unscored/declined/terminated reviewers get a single status item; editor decisions become `review-type="decision"`; multi-point screening messages get split into one `review-item` per point; correspondence/query-action log entries get their own duplicate `<review>` block distinct from the formal scored review.
8. Build **`_transfer.xml`** from a fixed template: source=Portland Press Limited, destination=Silverchair (constant), corresponding-author email plugged into both source contact fields, `authentication-code` = doi-id repeated twice pipe-separated, fixed 2-step processing-instructions referencing `_raw.xml`.

---

## Phase 6 — Cannot be determined from 3 samples / needs confirmation

1. **`article-type="Original Study"` constant** — held even when source `display-channel` differs ("Research Article" vs **"Review Article"**). Is this truly always constant, or is there a lookup table (Research→"Original Study", Review→ something else) that just happens to collapse to the same value in these 3 samples? **Need more sample article types (e.g. an actual Review, Editorial, Correction) to confirm.**
2. **`authentication-code` format inconsistency** in `transfer.xml` — pkg1/2 use bare uppercase publisher-id (`CS20256808`), pkg3 uses the dashed doi-id (`cs-2025-8827`). Which is the intended standard?
3. **`transfer-source/contact/contact-name`** always blank — intentional (no named contact captured) or an incomplete field in the manual builds?
4. **`manifest.xml` item `id` numbering** (`file-1`..`file-17`, then jumping to `file-111`, `file-1110`, `file-1111`...) looks like a string-concatenation artifact rather than a designed scheme. Is there an intended id convention (sequential `file-1..N`, or `file-<round>-<n>`)?
5. **`item-description` text in manifest.xml** is visibly truncated/garbled (mid-word cuts, stray "x" characters) in all 3 samples — is this the intended description format, or should the converter generate a clean description (e.g. "Figure 3 — submitted as Figure 3.jpg")?
6. **Reviews submitted as an uploaded PDF** are referenced via `ext-link` to a live Kriyadocs URL (`ppl.kriyadocs.com/resources/...`) rather than being copied into `files/`. Should the converter fetch and package that file, or is an external link acceptable/expected for review attachments in the final MECA package?
7. **Duplicate correspondence review blocks** — some reviewer comments appear twice in `reviews.xml` (once as a scored `review`, once as a `correspondence` "query action" log entry with nearly identical text). Confirm whether this duplication is deliberate (full audit trail) or should be de-duplicated.
8. **Rule for choosing which custom-meta file entries are "current round"** vs. carried-over/superseded when the same category (e.g. `manuscript`) appears once per round — is "latest round only" always correct, or are there cases (e.g. R2, R3) where more history must be retained in `article.xml`?
9. **No 4th package with a `research-article` where the manuscript was rejected, or a package with 0 rounds (desk-accepted)** — behavior for edge cases (no R1 at all, or a rejected/withdrawn paper) is unobserved.
10. **DOI prefix `10.1042`** — confirmed constant across all 3 Clinical Science samples; presumably a Portland-Press-wide constant, but not verified against a different Portland Press journal.

**These will be asked to you directly before/while approving this report — nothing above has been guessed into the rules in Phase 5.**

---

## Phase 7 — Converter architecture (conceptual only, no code)

```
Input zip
   │
   ▼
[1] Ingest & Validate
   - Unzip, locate root <articleid>.xml
   - Parse & validate against expected Kriyadocs export shape
   - Fail fast with a clear error if the root XML is missing/malformed
   │
   ▼
[2] Metadata Extraction Layer
   - Parse root XML into an internal model:
     JournalMeta, ArticleMeta, Contributors, Funding, Permissions,
     History, CustomMetaEntries (typed: form-answers, file-entries, review-log, decision-log)
   - Group file-entries by round; group review-log entries by reviewer+round
   │
   ▼
[3] File Resolution Layer
   - Match each CustomMeta file-entry to a physical file in Original/R1/...
   - Report (not silently ignore) any custom-meta entry with no matching
     physical file, and any physical file with no matching custom-meta entry
   │
   ▼
[4] Generators (one per output XML, independent, all read the same internal model)
   ├── RawXmlGenerator       → <id>_raw.xml
   ├── ArticleXmlGenerator   → <id>_article.xml   (depends on RawXml's model, not its file)
   ├── ManifestGenerator     → <id>_manifest.xml
   ├── ReviewsGenerator      → <id>_reviews.xml
   └── TransferGenerator     → <id>_transfer.xml
   │
   ▼
[5] Validation Layer
   - XML well-formedness + DOCTYPE/DTD validation for all 5 files
   - Manifest cross-check: every file listed in manifest.xml exists under files/,
     and every file under files/ is listed in manifest.xml
   - Required-field checks (DOI resolvable, license present if open-access, etc.)
   │
   ▼
[6] Packaging Layer
   - Assemble files/ tree + 5 XML files
   - Zip with the MECA-conventional naming (MECA_<ArticleID>.zip)
   │
   ▼
[7] Logging & Reporting
   - Per-package structured log: files copied/excluded (with reason),
     custom-meta fields dropped/kept, any Phase-6-style ambiguity encountered
   - A human-readable summary report per conversion run, separate from the package itself
```

Cross-cutting:
- **Configuration**: DOI prefix, destination provider name (Silverchair), fixed article-type mapping table, item-type mapping table (custom-meta key → MECA item-type), license boilerplate text per license-type — all as external config, not hard-coded, since Phase 6 items suggest some of these need confirmation/adjustment per journal.
- **Error handling**: distinguish *hard failures* (root XML missing/unparseable, a manifest-referenced file physically absent) from *warnings* (unmatched junk file present, missing optional field) — never silently drop something without logging it.
- **Future DB sourcing** (see below): the extraction layer should treat "read from XML custom-meta" and "read from a metadata service/DB" as interchangeable data sources behind the same internal model, so swapping the source later doesn't touch the generators.

### Fields that could move to a database instead of the input XML

| Likely DB-sourced in production | Stays file-derived |
|---|---|
| Journal-level constants: journal title/ISSN/publisher name, DOI prefix, destination provider (Silverchair), MECA DTD boilerplate | Article title, abstract, keywords, author list/affiliations (author-supplied, round-specific) |
| Reviewer/editor identity + role (could resolve from a people/roles DB rather than embedded in the export) | Actual review/decision **text content** (free-text, round-specific) |
| Article-type classification mapping table (subject → MECA article-type) | The physical submitted files themselves |
| License-type → boilerplate license text mapping | Funding statement / award numbers (author-supplied) |
| `authentication-code`/transfer security convention | File → item-type mapping *values* could be DB config, but which files exist is always file-derived |

---

## Phase 8 — Confidence report

- **File-payload rules** (copy verbatim, custom-meta-driven inclusion): **~95% confident** — directly verified via md5 + diff across all 3 packages.
- **`raw.xml` construction** (DTD/namespace changes, strip workflow tags, keep full custom-meta): **~90% confident** — consistent across all 3 packages, tag-count-diffed.
- **`article.xml` construction** (DOI generation, id stripping, custom-meta pruning, license synthesis): **~80% confident** — core rules (DOI formula, DTD switch, id stripping) are 3/3 confirmed; the `article-type` constant and the exact custom-meta pruning boundary are inferred from pattern, not fully proven (see Phase 6 #1, #8).
- **`manifest.xml` construction** (item-type mapping, fixed items): **~75% confident** — item-type mapping table is 3/3 confirmed; the id-numbering scheme and description-text format are visibly buggy/inconsistent in the samples, so "faithfully reproducing" vs. "fixing" them is an open question (Phase 6 #4, #5).
- **`reviews.xml` construction**: **~60% confident** — the overall shape (per-reviewer, per-round, decision vs. review vs. correspondence) is consistent and well-evidenced, but this file involves the most judgment calls (splitting checklists into items, duplicating correspondence, choosing which log entries become a `<review>` at all) and has the fewest hard, mechanically-verifiable rules.
- **`transfer.xml` construction**: **~70% confident** — mostly fixed boilerplate (high confidence) except `authentication-code` format, which is inconsistent across the 3 samples (Phase 6 #2).

**Overall confidence: ~78%** of the transformation is understood with direct 3/3 evidence; the remainder (mainly inside `reviews.xml` and the manifest's cosmetic fields) is pattern-inferred and flagged in Phase 6 for your confirmation before implementation begins.
