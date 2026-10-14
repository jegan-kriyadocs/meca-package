# Enterprise QA Test Specification — MECA Package Generation Engine

Baseline: `01_BUSINESS_RULE_BOOK.md`, `02_ARCHITECTURE_DECISION_RECORDS.md`. Every test case below references the Business Rule (BR-xxx) or ADR it validates where applicable. Severity: **Blocker** (package unusable/invalid) · **Major** (materially wrong content) · **Minor** (cosmetic) · **Info** (logging/observability only). Priority: **P0**–**P3** (P0 = must pass before any release).

Column legend: ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation Candidate

---

## 1. XML Well-Formedness & Encoding (TC-001 – TC-010)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-001 | XML Validation | All 5 output XMLs are well-formed | Standard 3-sample article | 5 parseable XML files | XML parser succeeds with zero errors on all 5 | Blocker | P0 | Yes |
| TC-002 | XML Validation | raw.xml declares encoding=UTF-8 (upper-case) | Any article | `<?xml version="1.0" encoding="UTF-8"?>` | Exact-string header match (BR-038) | Minor | P2 | Yes |
| TC-003 | XML Validation | article.xml declares encoding=utf-8 (lower-case) | Any article | `<?xml version="1.0" encoding="utf-8"?>` | Exact-string header match (BR-053) | Minor | P2 | Yes |
| TC-004 | XML Validation | transfer.xml has no encoding attribute | Any article | `<?xml version="1.0"?>` | Exact-string header match (BR-127) | Minor | P2 | Yes |
| TC-005 | XML Validation | No output XML contains a BOM | Any article | 0-byte BOM prefix on all 5 files | Byte-level header check (BR-121) | Minor | P1 | Yes |
| TC-006 | XML Validation | Pretty-printing / indentation applied to raw/article/manifest/reviews | Any article | Multi-line indented XML, not single-line | Line-count > 1, consistent indent | Info | P3 | Yes |
| TC-007 | XML Validation | Source XML with an unterminated tag | Deliberately corrupted `<articleid>.xml` | Article ingestion fails cleanly | Hard error, article marked FAILED, batch continues (BR-159, ADR-009 pattern) | Blocker | P0 | Yes |
| TC-008 | XML Validation | Source XML with invalid entity reference (`&nbsp;` unescaped) | Corrupted source | Ingestion fails cleanly or entity is escaped correctly | Error surfaced with line/column | Blocker | P0 | Yes |
| TC-009 | XML Validation | Empty source XML file (0 bytes) | Corrupted source | Ingestion fails cleanly, no partial output produced | Article marked FAILED, no files written (ADR-017) | Blocker | P0 | Yes |
| TC-010 | XML Validation | Source XML that is valid XML but not the expected Kriyadocs shape (e.g. a random JATS file with no custom-meta-group) | Malformed source | Ingestion fails with a specific "missing custom-meta-group" error, not a generic crash | Structured error, BR-007 | Blocker | P0 | Yes |

## 2. DTD / DOCTYPE Validation (TC-011 – TC-020)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-011 | DTD Validation | raw.xml DOCTYPE matches JATS Publishing v1.3 exactly | Any article | Exact DOCTYPE string (BR-036) | String match | Blocker | P0 | Yes |
| TC-012 | DTD Validation | article.xml DOCTYPE matches JATS Archiving v1.2 exactly | Any article | Exact DOCTYPE string (BR-052) | String match | Blocker | P0 | Yes |
| TC-013 | DTD Validation | manifest.xml DOCTYPE matches MECA Manifest v1.0 | Any article | Exact DOCTYPE string (BR-076) | String match | Blocker | P0 | Yes |
| TC-014 | DTD Validation | reviews.xml DOCTYPE matches MECA Reviews v1.0 | Any article | Exact DOCTYPE string (BR-096) | String match | Blocker | P0 | Yes |
| TC-015 | DTD Validation | transfer.xml DOCTYPE matches MECA Transfer v1.0 | Any article | Exact DOCTYPE string (BR-126) | String match | Blocker | P0 | Yes |
| TC-016 | DTD Validation | manifest.xml validates against actual vendored MECA Manifest DTD (if ADR-025 = Option 1) | Any article | Zero DTD validation errors | Real DTD parse/validate | Blocker | P0 | Yes |
| TC-017 | DTD Validation | reviews.xml validates against actual vendored MECA Reviews DTD | Any article | Zero DTD validation errors | Real DTD parse/validate | Blocker | P0 | Yes |
| TC-018 | DTD Validation | transfer.xml validates against actual vendored MECA Transfer DTD | Any article | Zero DTD validation errors | Real DTD parse/validate | Blocker | P0 | Yes |
| TC-019 | DTD Validation | article.xml validates against actual JATS Archiving 1.2 DTD | Any article | Zero DTD validation errors | Real DTD parse/validate (performance-sensitive at scale, ADR-025) | Blocker | P1 | Yes |
| TC-020 | DTD Validation | `review-type` attribute value is only ever `"review"` or `"decision"`, never an illegal literal like `"CDATA"` | Any article | No illegal enum values in output | Automated enum check (BR-099) | Blocker | P0 | Yes |

## 3. Namespace Errors (TC-021 – TC-028)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-021 | Namespace | article.xml declares `xmlns:xlink` whenever any `xlink:*` attribute is used | Article with CC-BY license (uses xlink in ext-link) | `xmlns:xlink` present on `<article>` | Namespace-prefix-usage cross-check (BR-056) | Blocker | P0 | Yes |
| TC-022 | Namespace | article.xml does NOT declare `xmlns:xlink` when it isn't used anywhere | Article with no xlink usage (hypothetical) | No unused namespace declared | Cross-check | Minor | P2 | Yes |
| TC-023 | Namespace | raw.xml always declares all 4 namespaces (mml/xlink/xsi/ali) | Any article | All 4 present regardless of usage | String presence check (BR-037) | Major | P1 | Yes |
| TC-024 | Namespace | manifest.xml declares default `xmlns` + `xmlns:xlink` | Any article | Both present | String presence check | Blocker | P0 | Yes |
| TC-025 | Namespace | reviews.xml declares default `xmlns` + `xmlns:xlink` + `xmlns:ali` | Any article | All 3 present | String presence check | Blocker | P0 | Yes |
| TC-026 | Namespace | transfer.xml declares default `xmlns` only | Any article | Present, no extraneous namespaces | String presence check | Minor | P2 | Yes |
| TC-027 | Namespace | Undeclared namespace prefix used anywhere in any output (regression guard for the pkg3-style defect) | Any article | Zero occurrences | Automated linter: every `prefix:` usage has a matching `xmlns:prefix` in scope | Blocker | P0 | Yes |
| TC-028 | Namespace | Namespace URIs match exact expected strings (e.g. `https://manuscriptexchange.org/schema/manifest`) | Any article | Exact URI match | String match | Blocker | P0 | Yes |

## 4. Unicode / Unexpected Characters (TC-029 – TC-036)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-029 | Unicode | Author name with non-Latin characters (e.g. CJK, Cyrillic) | Synthetic source XML | Correctly rendered in all output XMLs, no mojibake | Round-trip UTF-8 byte comparison | Blocker | P0 | Yes |
| TC-030 | Unicode | Special Greek/math symbols in abstract (e.g. α, β, κ, ×) as seen in pkg3's "TNF-α&IFN-γ" | Real pkg3 abstract text | Symbols preserved exactly | Byte comparison against source | Major | P0 | Yes |
| TC-031 | Unicode | Full-width/CJK punctuation embedded in Latin text (e.g. "；" seen in pkg3 author list) | Real pkg3 data | Preserved exactly, not corrupted or stripped | Byte comparison | Major | P1 | Yes |
| TC-032 | Unicode | Filename containing non-ASCII characters | Synthetic file | Copied byte-identical, referenced correctly in manifest.xml href | Checksum + href resolution | Major | P1 | Yes |
| TC-033 | Unexpected Characters | XML-illegal control characters (e.g. NULL, vertical tab) present in source text | Synthetic corrupted source | Either escaped/stripped safely or ingestion fails cleanly — must not produce invalid XML output | Output re-parses as valid XML | Blocker | P0 | Yes |
| TC-034 | Unexpected Characters | Ampersand / less-than / greater-than characters in free text (reviewer comments, titles) | Synthetic + real samples (reviewer comments contain "<", ">" style clinical notation) | Properly escaped as `&amp;`/`&lt;`/`&gt;` in all output XML | Output re-parses as valid XML | Blocker | P0 | Yes |
| TC-035 | Unicode | Smart quotes / em-dashes / non-breaking spaces in author-supplied text | Real samples (em dash "—" used in manifest description) | Preserved exactly, valid UTF-8 | Byte comparison | Minor | P2 | Yes |
| TC-036 | Unicode | Emoji or other 4-byte UTF-8 characters in free text (edge case, not in samples but plausible in author-submitted correspondence) | Synthetic source | Preserved without corruption, no truncation mid-codepoint | Byte comparison | Minor | P3 | Yes |

## 5. Missing / Corrupted Input Files (TC-037 – TC-048)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-037 | Missing Files | custom-meta references a manuscript file that is physically absent | Modified pkg3 input (file deleted) | Article ingestion fails with a specific "referenced file missing" error naming the file | Structured error, article FAILED not silently skipped (BR-011) | Blocker | P0 | Yes |
| TC-038 | Missing Files | Physical file present but not referenced by any custom-meta entry | pkg1 as-is (36 junk files) | File excluded from `files/`, WARN logged (ADR-016) | Log line present per unmatched file | Major | P1 | Yes |
| TC-039 | Missing Files | Entire round folder missing though referenced by custom-meta | Modified input | Ingestion fails with specific error | Structured error | Blocker | P0 | Yes |
| TC-040 | Missing Files | No manuscript-category file present at all in the whole article | Modified input | Package generation blocked (BR-157) | Validation rule enforced | Blocker | P0 | Yes |
| TC-041 | Broken Images | Figure file is 0 bytes (corrupted/truncated upload) | Synthetic zero-byte JPG | Detected and flagged before packaging, not silently copied through | Pre-copy integrity check (file size > 0) | Major | P1 | Yes |
| TC-042 | Broken Images | Figure file has a `.jpg` extension but is not actually a valid JPEG (magic-byte mismatch) | Synthetic mislabeled file | Flagged as a warning (media-type mismatch); package still generated per ADR-009's non-blocking philosophy, unless business confirms otherwise | Magic-byte vs. extension cross-check | Major | P1 | Yes |
| TC-043 | Broken Images | Declared file size (custom-meta) does not match actual copied file size | Synthetic mismatch | WARN logged (BR-021) | Size comparison | Minor | P2 | Yes |
| TC-044 | Corrupted XML | Source XML with mismatched/unclosed custom-meta-group tags | Synthetic corrupted source | Ingestion fails cleanly with line/column | Structured parse error | Blocker | P0 | Yes |
| TC-045 | Corrupted XML | Source XML truncated mid-file (simulating an interrupted S3 upload) | Synthetic truncated source | Ingestion fails cleanly, retried per ADR-023 if classified transient | Structured error + retry-eligibility flag | Blocker | P0 | Yes |
| TC-046 | Missing Files | Zip/package with zero round folders at all | Synthetic empty package | Ingestion fails with specific error | Structured error (BR-002) | Blocker | P0 | Yes |
| TC-047 | Missing Files | Duplicate filenames within the same round (two different custom-meta entries resolve to the same physical filename) | Synthetic collision | Flagged as a conflict, not silently overwritten | Collision detection + error | Major | P1 | Yes |
| TC-048 | Missing Files | A custom-meta file entry with an empty/blank `name` field | Synthetic corrupted source | Flagged as a data-quality error, article FAILED | Structured error | Major | P1 | Yes |

## 6. DOI Validation (TC-049 – TC-058)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-049 | Missing DOI | Source XML has no `article-id[@pub-id-type=doi]` element at all | Synthetic corrupted source | Package generation blocked; DOI is mandatory (BR-058) | Validation rule: DOI field required | Blocker | P0 | Yes |
| TC-050 | Missing DOI | `article-id[@pub-id-type=doi]` present but empty string | Synthetic corrupted source | Package generation blocked | Validation rule | Blocker | P0 | Yes |
| TC-051 | Duplicate DOI | Two articles in the same batch resolve to the same generated DOI | Two synthetic articles with colliding doi-ids after normalization | Batch-level duplicate detection flags both, does not silently publish either | Cross-article uniqueness check against DOI registry (ADR-015) | Blocker | P0 | Yes |
| TC-052 | Duplicate DOI | An article's DOI collides with a DOI from a previous run (persistent registry) | Synthetic re-submission scenario | Flagged before publish | Registry lookup (ADR-015) | Blocker | P0 | Yes |
| TC-053 | DOI Formula | DOI construction correctly strips all dashes | pkg1/2/3 real data | Matches exactly `10.1042/cs20256808`, `10.1042/cs20258493C`, `10.1042/cs20258827` | Exact string match against known samples | Blocker | P0 | Yes |
| TC-054 | DOI Formula | DOI construction preserves mixed-case suffix (the "_C" → "C" case) | pkg2 real data | `10.1042/cs20258493C` (capital C preserved) | Exact string match | Blocker | P0 | Yes |
| TC-055 | DOI Formula | doi-article-id containing unexpected characters (e.g. a space, a second underscore) | Synthetic edge case | Defined, documented stripping behavior (not just `-`/`_`) — flag for business confirmation if untested char appears | Explicit rule for each stripped character class | Major | P1 | Yes |
| TC-056 | DOI Formula | DOI prefix is correctly sourced from journal-level config (not hard-coded), supporting ADR-028 multi-tenancy | Synthetic second-journal article | Different DOI prefix applied correctly per journal | Config-driven prefix lookup | Major | P1 | Yes |
| TC-057 | DOI Formula | Generated DOI is syntactically valid per DOI spec (`10.\d+/.+`) | All articles | Regex validation passes | Automated regex check | Blocker | P0 | Yes |
| TC-058 | DOI Formula | Generated DOI does not contain any XML-illegal characters | All articles | Valid within `<article-id>` element | XML validity check | Blocker | P0 | Yes |

## 7. Invalid Cross-References (TC-059 – TC-064)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-059 | Invalid Cross-Refs | A `<xref rid="X">` in contrib-group references an `id` that does not exist elsewhere in the same document | Synthetic corrupted source (note: article.xml strips ids — cross-ref integrity must be checked against raw.xml, pre-stripping) | Flagged as a validation warning against raw.xml, since article.xml removes ids entirely by design (BR-054) | rid/id resolution check on raw.xml only | Major | P1 | Yes |
| TC-060 | Invalid Cross-Refs | A dangling `xref` after id-stripping in article.xml (verify BR-054 doesn't silently break internal references that matter) | Any real sample | Confirm article.xml's dropped-id design doesn't orphan any semantically required link (e.g. author-to-affiliation, currently carried structurally, not by id, in article.xml — confirm) | Structural (not id-based) affiliation-linking verified intact | Major | P1 | Yes |
| TC-061 | Invalid Cross-Refs | Manifest `xlink:href` pointing to a file not present under `files/` | Synthetic corrupted manifest | Package validation fails (BR-152) | Path-existence check | Blocker | P0 | Yes |
| TC-062 | Invalid Cross-Refs | A `files/` file with no corresponding manifest.xml item | Synthetic corrupted package | Package validation fails (BR-153) | Reverse existence check | Blocker | P0 | Yes |
| TC-063 | Invalid Cross-Refs | reviews.xml decision date postdates the article's `history/accepted` date inconsistently | Synthetic corrupted data | Flagged as a warning (BR-115) | Cross-file date consistency check | Minor | P2 | Yes |
| TC-064 | Invalid Cross-Refs | `ext-link` in reviews.xml pointing to a malformed/non-HTTPS URL | Synthetic corrupted data | Flagged as a warning | URL-format validation | Minor | P2 | Yes |

## 8. Invalid Affiliations (TC-065 – TC-070)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-065 | Invalid Affiliations | Author with no affiliation linkage at all | Synthetic corrupted source | Flagged as a warning, package still generated (affiliation is not currently proven mandatory) | Structural presence check | Minor | P2 | Yes |
| TC-066 | Invalid Affiliations | Affiliation `institution` element empty string | Synthetic corrupted source | Flagged as a warning | Content-non-empty check | Minor | P2 | Yes |
| TC-067 | Invalid Affiliations | Multiple authors sharing one affiliation (as in real pkg3 data — 2 authors at "Lequn Branch...") | Real pkg3 data | Correctly represented, shared aff not duplicated incorrectly | Structural verification against known-good sample | Major | P1 | Yes |
| TC-068 | Invalid Affiliations | Affiliation with country attribute present vs. absent | Real samples (funding-source has `country`; aff does not, in samples) | Preserved exactly as sourced, not fabricated | Byte-level field check | Minor | P2 | Yes |
| TC-069 | Invalid Affiliations | Non-Latin-script institution name | Synthetic | Preserved without corruption | Unicode round-trip check | Major | P1 | Yes |
| TC-070 | Invalid Affiliations | Author affiliation linkage after article.xml id-stripping still resolves correctly for a human reader (no `xref rid` left dangling to a stripped id) | Real samples | Confirm article.xml's affiliation representation doesn't rely on stripped ids to link author↔institution | Structural verification | Major | P1 | Yes |

## 9. Missing ORCID (TC-071 – TC-076)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-071 | Missing ORCID | Author with no `contrib-id[@contrib-id-type=orcid]` at all | Real sample (some pkg3 authors have no ORCID) | Package still generated; ORCID is optional per observed evidence | No blocking validation | Info | P2 | Yes |
| TC-072 | Missing ORCID | Corresponding author specifically missing ORCID | Real pkg1 data (a "Query" explicitly asks author to provide ORCID — shows this is a known real-world gap, not a converter bug) | Package still generated; matches observed editorial-query behavior of asking author to fix later, not blocking production | No blocking validation, but flagged per editorial-query content already present in reviews.xml | Info | P2 | Yes |
| TC-073 | Invalid ORCID | ORCID present but malformed (not the `0000-0000-0000-0000` pattern) | Synthetic corrupted source | Flagged as a warning | Regex format validation | Minor | P2 | Yes |
| TC-074 | Invalid ORCID | ORCID with invalid checksum digit (per ISO 7064) | Synthetic corrupted source | Flagged as a warning | Checksum validation | Minor | P3 | Yes |
| TC-075 | Missing ORCID | ORCID present in source but stripped along with other ids in article.xml — confirm it's the *value* not the *element id* that's preserved | Real samples | ORCID value preserved in `contrib-id`, only the `id="uuid"` wrapper attribute removed | Field-level check distinguishing element-id vs. content | Major | P0 | Yes |
| TC-076 | Missing ORCID | Two different authors sharing the same ORCID (data-entry error at source) | Synthetic corrupted source | Flagged as a warning, not silently accepted | Duplicate-ORCID-within-article check | Minor | P2 | Yes |

## 10. Invalid Emails (TC-077 – TC-082)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-077 | Invalid Emails | Corresponding-author email malformed (no `@`) | Synthetic corrupted source | Flagged as a warning; still copied verbatim into transfer.xml per BR-130 (never fabricate a corrected value) | Regex format validation, non-blocking | Major | P1 | Yes |
| TC-078 | Invalid Emails | Corresponding-author email missing entirely | Synthetic corrupted source | transfer.xml contact/email fields left empty, matching BR-129's "never fabricate" principle; flagged as a warning | Presence check, non-blocking | Major | P1 | Yes |
| TC-079 | Invalid Emails | Reviewer email malformed | Synthetic corrupted source | Flagged as a warning in reviews.xml generation | Regex format validation | Minor | P2 | Yes |
| TC-080 | Invalid Emails | Multiple corresponding authors with different emails (real pkg3 case: 3 corresp emails) | Real pkg3 data | Correctly picks the primary/first corresp email for transfer.xml per BR-130 — confirm which one via business rule | Deterministic selection rule verified | Major | P0 | Yes |
| TC-081 | Invalid Emails | Email containing a non-ASCII domain (IDN) | Synthetic | Preserved correctly, not corrupted | Unicode round-trip | Minor | P3 | Yes |
| TC-082 | Invalid Emails | Email field containing HTML-escaped characters (`&amp;` inside an email — data-quality artifact from a poorly-escaped source) | Synthetic corrupted source | Correctly unescaped/handled, not double-escaped in output | Escaping round-trip check | Minor | P2 | Yes |

## 11. Review History Issues (TC-083 – TC-098)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-083 | Review History | Reviewer with full completed review (comments + recommendation) | Real pkg3 data | `<review>` with both review-items present, correctly split confidential/non-confidential | Structural + content match against known sample | Blocker | P0 | Yes |
| TC-084 | Review History | Reviewer who declined | Real pkg3 data | Status-only review-item, no fabricated content (BR-106, BR-125) | Structural match | Blocker | P0 | Yes |
| TC-085 | Review History | Reviewer auto-unassigned/terminated | Real pkg3 data | Status-only review-item | Structural match | Blocker | P0 | Yes |
| TC-086 | Review History | Reviewer comments submitted as file attachment | Real pkg3 data | `review-item[type=file]` with correct `ext-link` | Structural + URL check | Major | P1 | Yes |
| TC-087 | Review History | Editorial decision block per round | Real samples | `review-type="decision"` block present per round with correct editor/associate-editor identity | Structural match | Blocker | P0 | Yes |
| TC-088 | Review History | Multi-point screening checklist correctly split into separate review-items | Real pkg1/pkg3 data | One review-item per checklist point, each with own generated title | Count + content match | Major | P1 | Yes |
| TC-089 | Review History | Same reviewer appears in both Original and R1 rounds as separate `<review>` blocks | Real pkg1/pkg3 data | Two distinct blocks, correct `review-version` each | Structural match | Blocker | P0 | Yes |
| TC-090 | Review History | Zero reviewers assigned at all (desk decision, no peer review) | Synthetic edge case | reviews.xml still generated, containing only decision block(s), no review blocks | Structural — file still valid with zero `review-type=review` elements | Major | P1 | Yes |
| TC-091 | Review History | `review-type` never emits the illegal `"CDATA"` literal (regression test tied to TC-020) | All articles | Only `"review"`/`"decision"` present | Enum check | Blocker | P0 | Yes |
| TC-092 | Review History | All required attributes (`review-version`, `blinding`, `permission-to-publish`, `permission-to-transfer`) present on every `<review>` | All articles | 100% attribute coverage | Attribute-presence check across every review element | Blocker | P0 | Yes |
| TC-093 | Review History | Confidential-to-editor comment defaults appropriately when reviewer supplied none separately | Real pkg3 data (`"Same as author"`) | Matches observed source-system placeholder text exactly | String match | Minor | P2 | Yes |
| TC-094 | Review History | Duplicate correspondence-log entries included/excluded per ADR-004 configuration | Real pkg1/pkg3 data, both config modes | Correct behavior per configured mode | Config-driven structural check | Medium | P1 | Yes |
| TC-095 | Review History | reviews.xml scope (author-suggested reviewers, editor reassignment, copyediting queries) included/excluded per ADR-005 configuration | Real pkg1 data, both config modes | Correct behavior per configured mode | Config-driven structural check | Medium | P1 | Yes |
| TC-096 | Review History | Review dates internally consistent (assigned ≤ due, assigned ≤ submitted where present) | All real samples | No inversions | Date-ordering check | Minor | P1 | Yes |
| TC-097 | Review History | Reviewer/editor name with a hyphenated or multi-part surname (e.g. "Jandeleit-Dahm") preserved exactly | Real pkg3 data | Exact string match | Byte comparison | Minor | P2 | Yes |
| TC-098 | Review History | Zero rounds of review at all (immediate desk rejection, hypothetical) | Synthetic edge case | Defined behavior confirmed with business (ADR-005 scope question), not silently producing an empty/invalid file | Structural validity even in degenerate case | Major | P1 | Yes |

## 12. Supplementary Files (TC-099 – TC-104)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-099 | Supplementary Files | Large supplementary dataset file (xlsx, tens of MB, as in pkg3's RNA-seq data) | Real pkg3 data | Copied byte-identical, correctly categorized `supplemental`, correct media-type per ADR-008 | Checksum + manifest cross-check | Major | P0 | Yes |
| TC-100 | Supplementary Files | Multiple supplementary PDFs in one round (e.g. pkg3's two "Supplementary Figures" PDFs) | Real pkg3 data | Each gets its own distinct manifest item, no collision | Count + href uniqueness check | Major | P0 | Yes |
| TC-101 | Supplementary Files | Supplementary file present in `Original` round only, not carried into `R1` | Real pkg3 data (RNA-seq file appears in both, but pattern generalizes to "R1 only" files too) | Correctly appears only under its actual round(s), no phantom duplication | Structural round-mapping check | Major | P1 | Yes |
| TC-102 | Supplementary Files | Very large single supplementary file (hypothetical, GB-scale) stresses working-folder staging strategy | Synthetic large file | Processed successfully or fails gracefully with a clear "file too large" error, per ADR-020 | Resource-limit behavior defined and tested | Major | P1 | Yes |
| TC-103 | Supplementary Files | Supplementary file with an unusual/unmapped extension (`.csv`, `.zip`) | Synthetic | Handled per ADR-009 fallback policy (flagged, not blocking) | Config-driven fallback behavior | Major | P1 | Yes |
| TC-104 | Supplementary Files | Supplementary file categorized under a never-before-seen custom-meta key (not `manuscript`/`figure`/`supplement`/etc.) | Synthetic new category key | Defaults to `supplemental` item-type per BR-019/BR-078 | Fallback-mapping check | Major | P1 | Yes |

## 13. Manifest Validation (TC-105 – TC-114)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-105 | Manifest Validation | Manifest always lists exactly 3 fixed metadata items first, in fixed order | All articles | Structural match | Order + content check (BR-077) | Blocker | P0 | Yes |
| TC-106 | Manifest Validation | Every `files/` entry has exactly one manifest item and vice versa | All articles | 1:1 correspondence | Bidirectional existence check (BR-089) | Blocker | P0 | Yes |
| TC-107 | Manifest Validation | item-type mapping table applied correctly for every observed category key | All 3 real samples | Matches BR-078 table exactly | Lookup-table verification | Blocker | P0 | Yes |
| TC-108 | Manifest Validation | Unrecognized category key falls back to `supplemental` | Synthetic new key | `item-type="supplemental"` | Fallback check | Major | P1 | Yes |
| TC-109 | Manifest Validation | Item ordering: latest round first, earlier round(s) after | All 3 real samples | Structural order match | Sequence check (BR-083) | Major | P1 | Yes |
| TC-110 | Manifest Validation | item/@id values are unique within the document | All articles | No duplicate ids | Uniqueness check | Blocker | P0 | Yes |
| TC-111 | Manifest Validation | item/@id values follow the clean deterministic scheme chosen in ADR-011 (not the broken sample pattern) | All articles | Matches chosen scheme exactly | Format regex check | Major | P1 | Yes |
| TC-112 | Manifest Validation | item-description follows the clean format chosen in ADR-010 (not the broken sample pattern) | All articles | Matches chosen format exactly | Format regex/template check | Minor | P1 | Yes |
| TC-113 | Manifest Validation | media-type for every file matches the extension-lookup table | All articles | 100% match | Lookup-table verification | Blocker | P0 | Yes |
| TC-114 | Manifest Validation | manifest.xml item count = 3 + Σ(qualifying files) | All articles | Arithmetic match | Automated count check (BR-094) | Blocker | P0 | Yes |

## 14. Package-Level Validation (TC-115 – TC-122)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-115 | Package Validation | Final zip contains exactly 5 XML files + `files/` tree, no stray files | All articles | Structural match | Directory-listing diff | Blocker | P0 | Yes |
| TC-116 | Package Validation | All 5 XML filenames share the identical `<ArticleID>` prefix | All articles | 100% match | String-prefix check (BR-151) | Blocker | P0 | Yes |
| TC-117 | Package Validation | Zip file opens without corruption / is a valid zip archive | All articles | Passes zip-integrity check | Standard archive validation | Blocker | P0 | Yes |
| TC-118 | Package Validation | Package generation for an article that fails partway through never produces a partial/incomplete zip (ADR-017) | Synthetic mid-failure injection | No zip artifact exists until all 5 XMLs + files succeed | Atomicity test — kill process mid-generation, verify no partial output | Blocker | P0 | Yes |
| TC-119 | Package Validation | Re-running the converter on the same article twice produces byte-identical output (determinism) | Any article, run twice | Identical output both times | Full-package checksum comparison | Major | P0 | Yes |
| TC-120 | Package Validation | Package output validated end-to-end against all 3 known sample packages (strict-replication mode, per ADR-031) | pkg1, pkg2, pkg3 inputs | Output diff against known-good samples is limited to only the explicitly-approved corrections (broken ids/descriptions etc.) | Full diff report, manually reviewed once, then locked as regression baseline | Blocker | P0 | Yes |
| TC-121 | Package Validation | Package size stays within any defined maximum (if Silverchair enforces one) | Large synthetic article | Handled per defined policy | Size-limit check (needs business confirmation of the limit) | Major | P2 | Yes |
| TC-122 | Package Validation | Package naming convention (`MECA_<ArticleID>.zip`) applied consistently | All articles | 100% match | String-pattern check | Major | P1 | Yes |

## 15. Transfer Metadata Validation (TC-123 – TC-129)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-123 | Transfer Metadata | Source provider always "Portland Press Limited" (or config value per ADR-028) | All articles | Match | Config-driven string check (BR-128) | Blocker | P0 | Yes |
| TC-124 | Transfer Metadata | Destination provider always "Silverchair" (or config value) | All articles | Match | Config-driven string check (BR-134) | Blocker | P0 | Yes |
| TC-125 | Transfer Metadata | Journal acronym resolved per ADR-007's confirmed answer | All articles | Match confirmed value | Config-driven string check | Blocker | P0 | Yes |
| TC-126 | Transfer Metadata | authentication-code = publisher-id repeated pipe-separated | All 3 real samples | Exact match | String-format check (BR-136) | Blocker | P0 | Yes |
| TC-127 | Transfer Metadata | processing-instructions always exactly 2 fixed steps in fixed order | All articles | Match | Structural check (BR-137) | Major | P1 | Yes |
| TC-128 | Transfer Metadata | processing-comments correctly references the article's own raw.xml filename | All articles | Match | Template-fill check (BR-138) | Minor | P2 | Yes |
| TC-129 | Transfer Metadata | Contact email correctly resolves when multiple corresponding authors exist (per TC-080's resolution rule) | Real pkg3 data | Deterministic, correct selection | Cross-check against BR-130 resolution rule | Major | P0 | Yes |

## 16. Multi-Round Processing (TC-130 – TC-137)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-130 | Multi-Round | Article with only 1 round (no revision at all) | Synthetic fixture | All 5 XMLs still generated correctly, no R1-specific logic errors | Structural validity in degenerate case (BR-147) | Blocker | P0 | Yes |
| TC-131 | Multi-Round | Article with 3 rounds (Original, R1, R2) — synthetic fixture required (no real sample exists, ADR-013) | Synthetic fixture | "Latest round wins" and "all rounds listed" rules correctly generalize | Full structural validation against expected synthetic output | Blocker | P0 | Yes |
| TC-132 | Multi-Round | Article with 10 rounds (stress-test round-ordering logic, esp. lexical "R10" vs "R2" pitfall) | Synthetic fixture | Correct ordering via `vocab-identifier` numeric key, not string comparison (BR-010, BR-142) | Ordering correctness check | Major | P1 | Yes |
| TC-133 | Multi-Round | A file category present in Original but absent in R1 (e.g. cover letter only submitted once) | Real pkg3-style data | Appears only in the round(s) it actually exists in | Structural round-mapping check | Major | P0 | Yes |
| TC-134 | Multi-Round | A file category present in R1 but never in Original (e.g. response-to-reviewers, only exists post-review) | Real pkg3 data | Appears only under R1 | Structural round-mapping check | Major | P0 | Yes |
| TC-135 | Multi-Round | Round-folder naming variant (e.g. "Revision 1" instead of "R1") per ADR-014's generic-handling decision | Synthetic fixture | Correctly processed regardless of exact label | Generic round-handling check | Major | P1 | Yes |
| TC-136 | Multi-Round | article.xml custom-meta correctly drops only superseded-round file entries, keeps all non-file-manifest fields regardless of round | Real pkg3 data | Matches BR-066/BR-071 deny-list logic exactly | Field-level diff against known sample | Blocker | P0 | Yes |
| TC-137 | Multi-Round | reviews.xml correctly attributes each `<review>` to its actual round via `review-version` | Real pkg1/pkg3 data | 100% correct round attribution | Structural + content match | Blocker | P0 | Yes |

## 17. Performance Testing (TC-138 – TC-143)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-138 | Performance | Single-article end-to-end processing time (parse → generate → validate → package) | One typical article (~10 files, ~50MB) | Under an agreed per-article SLA (needs business confirmation of target, e.g. <30s) | Timed benchmark | Major | P1 | Yes |
| TC-139 | Performance | Large source XML (2MB+, matching pkg1's actual size) parse time | Real pkg1 XML | Parses within acceptable time, no quadratic-blowup behavior | Timed benchmark | Major | P1 | Yes |
| TC-140 | Performance | DTD validation overhead per article (ADR-025) | One article, DTD validation on vs off | Overhead quantified and reported to inform ADR-025's final decision | Comparative timed benchmark | Medium | P1 | Yes |
| TC-141 | Performance | Full batch of 10,000 synthetic articles — total wall-clock time | Synthetic batch | Meets an agreed batch-completion SLA (needs business confirmation) | Timed benchmark at scale | Major | P0 | Yes |
| TC-142 | Performance | Per-article processing time does not degrade as batch size grows (no shared-resource contention bug) | Batches of 100 / 1,000 / 10,000 | Roughly constant per-article time across batch sizes | Comparative timed benchmark | Major | P1 | Yes |
| TC-143 | Performance | S3 read/write throughput does not become the bottleneck at target concurrency | Synthetic batch against real/test S3 | Throughput meets target; identifies whether S3 or CPU/parse is the bottleneck | Profiling + benchmark | Medium | P1 | Yes |

## 18. Memory Testing (TC-144 – TC-147)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-144 | Memory Testing | Peak memory usage per article stays within the per-worker resource budget | Real + synthetic large articles | No OOM, memory within budget | Memory-profiled run | Major | P0 | Yes |
| TC-145 | Memory Testing | No memory leak across a long-running batch (memory returns to baseline between articles) | 10,000-article synthetic batch | Flat memory profile over time, not monotonically increasing | Long-run memory profiling | Blocker | P0 | Yes |
| TC-146 | Memory Testing | Large binary attachment (GB-scale supplementary file) does not require full in-memory buffering | Synthetic large file | Streamed, not fully buffered (validates ADR-020's staging decision) | Memory-profiled run with large file | Major | P1 | Yes |
| TC-147 | Memory Testing | Parallel workers (ADR-021) collectively stay within host memory limits at target concurrency | Synthetic parallel batch | No cross-worker memory exhaustion | Memory-profiled parallel run | Major | P0 | Yes |

## 19. Large Batch Testing (TC-148 – TC-153)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-148 | Large Batch | Full 10,000-article synthetic batch completes with 0 unhandled crashes | Synthetic batch | 100% of articles reach a terminal state (SUCCESS or FAILED), none stuck | End-to-end batch run | Blocker | P0 | Yes |
| TC-149 | Large Batch | A single malformed article in a 10,000-article batch does not block or crash the rest of the batch | Synthetic batch with 1 poison-pill article | 9,999 succeed, 1 fails and is clearly flagged | Isolation-of-failure test (ADR-009 principle) | Blocker | P0 | Yes |
| TC-150 | Large Batch | Batch-level summary report accurately reflects success/failure/warning counts | Synthetic batch | Report totals match actual outcomes exactly | Report-vs-ground-truth reconciliation | Major | P0 | Yes |
| TC-151 | Large Batch | Batch processing scales near-linearly with added worker capacity | Same batch, 1x vs 4x workers | Near-4x throughput improvement | Scaling benchmark | Medium | P1 | Yes |
| TC-152 | Large Batch | DOI-uniqueness registry check (ADR-015) performs correctly at full batch scale without becoming a bottleneck or race condition | Synthetic batch with intentional near-duplicate DOIs | All duplicates correctly caught, no false negatives from concurrent registry writes | Concurrency-safe registry test | Blocker | P0 | Yes |
| TC-153 | Large Batch | Full batch archival/output-storage step (ADR-029) completes for all articles without silent omission | Synthetic batch | 100% of successful articles have a corresponding archived package | Output-count reconciliation | Blocker | P0 | Yes |

## 20. Recovery / Restart Testing (TC-154 – TC-159)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-154 | Recovery Testing | Process killed mid-batch (simulated crash at 50% completion), then restarted | Synthetic batch + forced kill | Already-completed articles are not reprocessed; remaining articles complete correctly | Checkpoint-based resume verification (ADR-022) | Blocker | P0 | Yes |
| TC-155 | Recovery Testing | Process killed mid-article (during XML generation for one specific article) | Synthetic forced kill mid-article | That one article is retried cleanly from the start on restart, not resumed from a corrupt partial state (consistent with ADR-017's atomicity) | Partial-state-absence verification | Blocker | P0 | Yes |
| TC-156 | Recovery Testing | Checkpoint store itself is temporarily unavailable during a run | Synthetic checkpoint-store outage | Run pauses/retries gracefully, does not silently lose checkpoint state or double-process | Checkpoint-store failure-injection test | Blocker | P0 | Yes |
| TC-157 | Recovery Testing | Restarting a fully-completed batch is a safe no-op | Completed batch, restart triggered | 0 articles reprocessed, run reports "0 remaining" | Idempotency check | Major | P1 | Yes |
| TC-158 | Recovery Testing | Restart after a partial output-storage failure (article generated, archival step failed) | Synthetic forced failure at archival step only | Article correctly identified as "generated but not archived," retried at the archival step only, not fully reprocessed | Fine-grained state verification | Major | P1 | Yes |
| TC-159 | Recovery Testing | Restart correctly re-reads updated configuration (e.g. a corrected media-type mapping) without requiring a full redeploy | Config change between runs | New config applied to not-yet-processed articles | Config-hot-reload verification | Medium | P2 | Yes |

## 21. Retry Testing (TC-160 – TC-165)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-160 | Retry Testing | Transient S3 read failure (simulated throttling error) | Synthetic S3 fault injection | Automatic retry per ADR-023 policy, eventual success | Fault-injection test | Blocker | P0 | Yes |
| TC-161 | Retry Testing | Permanent data-quality failure (malformed source XML) is never retried | Synthetic malformed article | Zero retry attempts, immediate FAILED status | Retry-classification verification | Major | P0 | Yes |
| TC-162 | Retry Testing | Retry count exhausted (all attempts fail) | Synthetic persistent fault | Article marked FAILED after exact configured max-retry count, not retried indefinitely | Retry-count verification | Major | P0 | Yes |
| TC-163 | Retry Testing | Exponential backoff timing between retry attempts matches configuration | Synthetic fault injection | Timing matches configured backoff curve | Timed retry-interval verification | Minor | P2 | Yes |
| TC-164 | Retry Testing | A retried article produces identical output to a first-attempt success (no side effects from the failed attempt linger) | Synthetic fault-then-succeed scenario | Output identical to a clean-run baseline | Output diff comparison | Blocker | P0 | Yes |
| TC-165 | Retry Testing | Retrying an article does not create duplicate entries in the DOI registry or checkpoint store | Synthetic fault-then-succeed scenario | Exactly one registry/checkpoint entry per article regardless of retry count | Idempotency verification | Blocker | P0 | Yes |

## 22. Parallel Processing (TC-166 – TC-170)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-166 | Parallel Processing | N articles processed concurrently produce N independent, correct outputs with no cross-contamination | Synthetic parallel batch | Each article's output depends only on its own input | Isolation verification (diff each output against its own expected result) | Blocker | P0 | Yes |
| TC-167 | Parallel Processing | Concurrent writes to the shared DOI registry/checkpoint store are correctly synchronized | Synthetic parallel batch with likely-colliding DOIs | No race-condition-induced false negatives/positives | Concurrency stress test | Blocker | P0 | Yes |
| TC-168 | Parallel Processing | Worker crash affecting one article does not affect concurrently-running articles on other workers | Synthetic forced single-worker crash | Other workers' articles unaffected, complete normally | Fault-isolation test | Blocker | P0 | Yes |
| TC-169 | Parallel Processing | Logging output from concurrent workers remains correctly attributed per-article (no interleaved/corrupted log lines) | Synthetic parallel batch | Every log line correctly tagged with its owning `articleId` | Log-integrity verification | Major | P1 | Yes |
| TC-170 | Parallel Processing | System behaves correctly at minimum (1 worker) and maximum (target production) concurrency | Same batch at both concurrency levels | Identical correctness, only throughput differs | Comparative correctness test | Major | P1 | Yes |

## 23. S3 Failure Scenarios (TC-171 – TC-177)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-171 | S3 Failure | S3 object does not exist at expected key (input never uploaded / wrong path) | Synthetic missing-key scenario | Clean, specific "source not found" error, article FAILED, no crash | Fault-injection test | Blocker | P0 | Yes |
| TC-172 | S3 Failure | S3 read throttled (503 SlowDown) | Synthetic fault injection | Retried per ADR-023, eventual success | Fault-injection test | Major | P0 | Yes |
| TC-173 | S3 Failure | S3 write (output/archival) fails after successful generation | Synthetic fault injection at write step | Article correctly marked as "generated, not yet archived," retried at that step only (ties to TC-158) | Fine-grained failure-state test | Blocker | P0 | Yes |
| TC-174 | S3 Failure | S3 credentials/permissions revoked mid-run | Synthetic permission-denial injection | Run fails loudly with a clear permissions error, does not silently skip articles | Fault-injection test | Blocker | P0 | Yes |
| TC-175 | S3 Failure | Partial/corrupted download from S3 (network interruption mid-transfer) | Synthetic truncated-download injection | Checksum/size validation catches the corruption before processing proceeds, retried | Integrity-check + retry verification | Blocker | P0 | Yes |
| TC-176 | S3 Failure | S3 bucket/prefix listing returns an unexpectedly large or empty result (batch-pull model, ADR-019) | Synthetic listing edge cases | Handled gracefully — empty batch is not treated as an error; unexpectedly large batch is chunked, not OOM'd | Edge-case listing test | Major | P1 | Yes |
| TC-177 | S3 Failure | Region/endpoint failover (if multi-region is in scope) | Synthetic regional-outage injection | Defined failover behavior (needs business confirmation of whether multi-region is required) | Fault-injection test | Medium | P2 | Yes |

## 24. Packaging Errors (TC-178 – TC-183)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-178 | Packaging Errors | Zip creation fails due to disk-space exhaustion on the worker | Synthetic disk-full injection | Clean failure, article retried elsewhere/later, no corrupted partial zip left behind | Fault-injection test | Blocker | P0 | Yes |
| TC-179 | Packaging Errors | Filename collision when writing into the zip (two different source files mapping to the same output path) | Synthetic collision (ties to TC-047) | Detected before zip creation, not silently overwritten inside the archive | Pre-zip collision check | Major | P0 | Yes |
| TC-180 | Packaging Errors | Path length exceeds filesystem/zip-format limits (very long original filename + nested path) | Synthetic long-filename fixture | Defined behavior (truncate with warning, or fail with clear error — needs business confirmation) | Edge-case length test | Medium | P2 | Yes |
| TC-181 | Packaging Errors | Zip contains correct relative paths (no absolute paths or path-traversal `../` sequences leaked from source data) | Synthetic malicious-path-injection fixture | All paths sanitized/relative, no traversal possible | Security-oriented path-sanitization test | Blocker | P0 | Yes |
| TC-182 | Packaging Errors | Archival write succeeds but produces a different checksum than the just-generated local package (silent corruption in transit) | Synthetic corruption-in-transit injection | Detected via checksum verification post-upload, triggers retry | Post-write integrity verification | Blocker | P0 | Yes |
| TC-183 | Packaging Errors | Two concurrent workers attempt to package the same article simultaneously (duplicate-dispatch bug) | Synthetic duplicate-dispatch injection | Detected and prevented via checkpoint/locking (ties to ADR-022), only one package produced | Concurrency-safety test | Blocker | P0 | Yes |

## 25. Configuration & Multi-Journal (TC-184 – TC-187)

| ID | Category | Description | Input | Expected Output | Expected Validation | Severity | Priority | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-184 | Configuration | A second synthetic journal/publisher config (different DOI prefix, destination provider, acronym) processes correctly alongside Clinical Science articles in the same batch | Synthetic second-journal fixture | Correct per-journal values applied, no cross-journal contamination | Multi-tenant correctness test (ADR-028) | Major | P1 | Yes |
| TC-185 | Configuration | Missing configuration for an encountered journal-id (onboarding gap) | Synthetic unknown-journal fixture | Clean, specific "unconfigured journal" error, not a generic crash or silent wrong-default | Config-completeness check | Major | P1 | Yes |
| TC-186 | Configuration | Media-type mapping table updated between runs without redeploy | Config change + rerun | New mapping applied correctly | Config-hot-reload verification (ties to TC-159) | Medium | P2 | Yes |
| TC-187 | Configuration | Article-type lookup table (ADR-001) correctly handles a newly-added mapping for a previously-unmapped `display-channel` value | Synthetic new article-type fixture | Correct mapped value applied, no fallback-to-default when a specific mapping exists | Lookup-table verification | Major | P1 | Yes |

---

## Test Case Count Summary

| Section | Count |
|---|---|
| 1. XML Well-Formedness & Encoding | 10 |
| 2. DTD / DOCTYPE Validation | 10 |
| 3. Namespace Errors | 8 |
| 4. Unicode / Unexpected Characters | 8 |
| 5. Missing / Corrupted Input Files | 12 |
| 6. DOI Validation | 10 |
| 7. Invalid Cross-References | 6 |
| 8. Invalid Affiliations | 6 |
| 9. Missing ORCID | 6 |
| 10. Invalid Emails | 6 |
| 11. Review History Issues | 16 |
| 12. Supplementary Files | 6 |
| 13. Manifest Validation | 10 |
| 14. Package-Level Validation | 8 |
| 15. Transfer Metadata Validation | 7 |
| 16. Multi-Round Processing | 8 |
| 17. Performance Testing | 6 |
| 18. Memory Testing | 4 |
| 19. Large Batch Testing | 6 |
| 20. Recovery / Restart Testing | 6 |
| 21. Retry Testing | 6 |
| 22. Parallel Processing | 5 |
| 23. S3 Failure Scenarios | 7 |
| 24. Packaging Errors | 6 |
| 25. Configuration & Multi-Journal | 4 |
| **Total** | **187** |

P0 (must pass before any release): **~95 test cases** — concentrated in XML/DTD/namespace validity, DOI uniqueness, package atomicity, review-history correctness, and every recovery/retry/parallel-processing scenario.
