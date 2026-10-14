# MECA Converter — Functional Specification

Baseline: `REVERSE_ENGINEERING_REPORT.md`. This document goes field-by-field, classifies every rule, and is meant to be sufficient on its own — a developer should not need to open the sample packages to implement the converter.

## 0. Legend & evidence base

Every rule below is tagged:

- **CONFIRMED** — identical behavior observed in all 3 samples (pkg1=`cs-2025-6808`, pkg2=`CS-2025-8493_C`, pkg3=`cs-2025-8827`).
- **STRONGLY INFERRED** — consistent in 2/3, or 3/3 but only one value ever observed (e.g. a constant that could theoretically vary).
- **ASSUMPTION — NEEDS CONFIRMATION** — samples disagree, or the sample base is too narrow (e.g. only "Research"/"Review" article types seen, no Correction/Editorial).

Where samples disagree, this spec also states whether the disagreement looks like a genuine **business-rule difference** or a **human/clerical mistake** in one of the manually-built packages — see §14.

Source note: the input root XML (`<articleid>.xml`) is a **Kriyadocs platform export**, not pure JATS. It embeds JATS front-matter + a `custom-meta-group` audit log covering the whole editorial/production lifecycle. This is called "the Kriyadocs XML" throughout.

---

## 1. Source data model (Kriyadocs XML) — field inventory

| Path | Contents | Used downstream? |
|---|---|---|
| `journal-meta/*` | journal-id (publisher-id, nlm-ta), title-group, issn×2, publisher-name | → raw.xml, article.xml (verbatim) |
| `article-meta/article-id[@pub-id-type=publisher-id]` | e.g. `CS20256808` or `cs-2025-8827` (format varies per submission) | → DOI construction is from the **doi** id, not this one; this one → manifest description, transfer authentication-code (§6, §12) |
| `article-meta/article-id[@pub-id-type=doi]` | manuscript id, e.g. `cs-2025-8493_C` | → DOI generation (§3) |
| `article-meta/article-categories/subj-group[@display-channel]/subject` | e.g. "Research Article", "Review Article" | **NOT** used for output `article-type` (§3) — confirm intended use, see §15 |
| `article-meta/article-categories/subj-group[@heading]/subject` (×3 in samples) | topical subjects | copied through unchanged as `subj-group[@heading]` |
| `title-group/article-title` | manuscript title | copied verbatim |
| `contrib-group/contrib` | authors: name, email, `contrib-id[@contrib-id-type=orcid]`, `xref[@ref-type=aff]` | copied verbatim (ids stripped in article.xml) |
| `aff` / `institution-wrap` | affiliations | copied verbatim |
| `author-notes/corresp` | corresponding-author email(s), with `xlink:href`/`xlink:type` on `<email>` | copied, xlink attrs stripped in article.xml |
| `permissions/copyright-statement`, `copyright-year` | copyright line | copied (wording differs slightly across samples, §14) |
| `funding-group/award-group` | funding-source (institution, country), award-id, principal-award-recipient | copied verbatim |
| `kwd-group/kwd` | keywords | copied verbatim |
| `counts` (word-count, ref-count, fig-count) | manuscript stats | copied verbatim |
| `history/date[@date-type=received\|revision\|accepted]` | lifecycle dates | copied verbatim into both raw.xml and article.xml; cross-checked against `reviews.xml` decision dates (consistent) |
| `body` | **title page + abstract + keywords only** — never the full manuscript text | copied verbatim into raw.xml `body`; **absent** from article.xml (article.xml has no `<body>`) |
| `custom-meta-group/custom-meta` (specific-use="form-files") | one entry per **submitted file**, each with `named-content[@content-type]` = type/name/path/file/size/ppi | drives `files/` inclusion + `manifest.xml` (§5, §9) |
| `custom-meta-group/custom-meta` (form answers) | Authorship, Third party consent, Ethical Research Statement, Clinical perspective, License Type, Conflict of interest, Dual publication, Submitting Author Details, Article Summary, plagiarism-report, etc. | copied into raw.xml (all) and article.xml (all except a small deny-list, §4) |
| `custom-meta-group/custom-meta` (reviewer scorecard, keys `QN_01`.."QN_17") | per-reviewer numeric/Y-N answers | → raw.xml only (kept); **excluded** from article.xml; source data for `reviews.xml` recommendation items |
| `custom-meta-group/custom-meta` keys `Decision Draft`, `reviewer-decline-reasons`, `submission-decision` (repeated per round) | editorial decision text / reviewer decline reasons | → raw.xml (kept); **excluded** from article.xml (except the final `submission-decision` value); → reconstructed into `reviews.xml` |
| `workflow`/`stage`/`time-log`/`log`/correspondence (`mail-subject`/`mail-body`/`from`/`to`/`cc`/`assigned`/`user`/`useremail`/`div`/`span`/styling wrappers) | raw editorial-system audit trail (reviewer assignment history, internal email log, per-stage timing) | **never copied into raw.xml or article.xml** (stripped); this is the **source material** `reviews.xml` is built from (dates, reviewer identity, correspondence text) |

---

## 2. Output package structure (recap)

```
<ArticleID>_article.xml     JATS Archiving & Interchange v1.2 record (public)
<ArticleID>_manifest.xml    NISO MECA manifest v1.0
<ArticleID>_raw.xml         JATS Journal Publishing v1.3 record (full internal metadata)
<ArticleID>_reviews.xml     MECA reviews v1.0 (peer-review + decision history)
<ArticleID>_transfer.xml    MECA transfer v1.0 (source/destination handshake)
files/<Round>/<original filename>   verbatim copies, one subfolder per submission round
```

`<ArticleID>` in the 5 filenames = the exact string used for the **input zip's folder/base name** (i.e. whatever casing/format the source folder had — `cs-2025-6808`, `CS-2025-8493_C`, `cs-2025-8827` — **CONFIRMED**, not normalized).

---

## 3. Field-by-field mapping — `<id>_raw.xml`

| Output field | Source | Rule | Class |
|---|---|---|---|
| XML declaration | fixed | `<?xml version="1.0" encoding="UTF-8"?>` — encoding always **upper-case** `UTF-8` | CONFIRMED (3/3) |
| DOCTYPE | fixed | `<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.3 20210610//EN" "JATS-journalpublishing1-3.dtd">` | CONFIRMED (3/3) |
| `<article>` attrs | fixed + copy | `dtd-version="1.3"`, `xml:lang="en"`, `article-type="research-article"` (constant, not the display-channel subject), namespaces `xmlns:mml`,`xmlns:xlink`,`xmlns:xsi`,`xmlns:ali` all present | CONFIRMED (3/3) |
| `journal-meta`, `article-meta` (ids, categories, title-group, contrib-group, aff, author-notes, permissions[no license], funding-group, kwd-group, counts, custom-meta-group) | Kriyadocs XML, same sub-tree | **Copied verbatim, including every `id="uuid"` attribute** | CONFIRMED (3/3) |
| `body` | Kriyadocs XML `body` | Copied verbatim (title page/authors/affiliations/abstract/keywords only — same UUIDs) | CONFIRMED (3/3) |
| `custom-meta-group` | Kriyadocs XML | **All** entries kept, from **every round**, including QN_* scorecards, decline reasons, decision drafts, duplicate `submission-decision` values | CONFIRMED (3/3) |
| Everything else (`workflow`,`stage`,`time-log`,`log`,`mail-*`,`assigned`,`user`,`useremail`,`object`,`variable`, internal `div`/`span` styling wrappers) | Kriyadocs XML | **Removed entirely** | CONFIRMED (3/3) |
| Whitespace | — | Pretty-printed / indented (unlike the source, which is single-line) | CONFIRMED (3/3) |

---

## 4. Field-by-field mapping — `<id>_article.xml`

Built **from `_raw.xml`**, not re-derived from the Kriyadocs XML directly (confirmed by the fact that its `custom-meta` values and JATS content are byte-identical to raw.xml minus the pruning below — no independent re-extraction artifacts).

| Output field | Source | Rule | Class |
|---|---|---|---|
| XML declaration | fixed | `<?xml version="1.0" encoding="utf-8"?>` — encoding **lower-case** `utf-8` (deliberately different casing from raw.xml) | CONFIRMED (3/3) |
| DOCTYPE | fixed | `<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2 20190208//EN" "https://jats.nlm.nih.gov/archiving/1.2/JATS-archivearticle1.dtd">` (note: DOCTYPE line-wrapped after "DTD" in all 3 samples — cosmetic, not required) | CONFIRMED (3/3) |
| `<article>` attrs | fixed + generated | `dtd-version="1.2"`, `article-type="Original Study"` **always**, regardless of source `display-channel` subject (pkg1 source="Research Article", pkg2 source="**Review Article**", pkg3 source="Research" — all three still output "Original Study") | STRONGLY INFERRED — value is constant across all observed inputs, including a genuine Review-type paper, but only one output value has ever been observed. **Needs business confirmation** whether other article types (Editorial, Correction, Review) should map to a different `article-type`, see §15-Q1 |
| `<article>` namespaces | — | `xml:lang`, `xmlns:mml`, `xmlns:xsi`, `xmlns:ali` **removed**. `xmlns:xlink` kept in pkg1 & pkg2 (both **use** `xlink:href` inside `<email>`/`<ext-link>`); **missing** in pkg3 even though pkg3's `<ext-link xlink:href=...>` (in the license block) requires it | CONFIRMED that xlink-dependent namespace is required whenever `xlink:href` is used; pkg3's omission is a **defect**, not a rule (§14) |
| `article-id[@pub-id-type=publisher-id]` | raw.xml, unchanged | copied verbatim, ids stripped | CONFIRMED |
| `article-id[@pub-id-type=doi]` | **generated** | `"10.1042/" + doi_article_id.replace("-","").replace("_","")`, original character casing preserved (e.g. `cs-2025-8493_C` → `10.1042/cs20258493C`) | CONFIRMED (3/3 — formula reproduces all 3 observed DOIs exactly) |
| `article-categories`, `title-group`, `contrib-group`, `aff`, `kwd-group`, `funding-group`, `history`, `counts` | raw.xml | copied, **all `id="uuid"` attributes stripped** | CONFIRMED (3/3) |
| `author-notes/corresp/email` | raw.xml | `xlink:href`/`xlink:type` attributes on `<email>` **stripped**, plain `<email>address</email>` | CONFIRMED (3/3) |
| `permissions/copyright-statement` | raw.xml | copied, but exact wording differs: pkg1/pkg2 = `"© 2025 The Author(s)."`, pkg3 = `"© 2025 The Authors."` | Content is CONFIRMED copy-through; the **wording variance itself is a source-data difference** (each Kriyadocs XML has its own copyright-statement string) not a converter rule — verify the source before assuming one canonical string, see §14 |
| `permissions/license` | **newly generated — absent from raw.xml entirely** | When `custom-meta[meta-name="License Type"]` contains "CC BY": generate `<license license-type="open-access" xmlns:xlink="..." xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>This is an open access article published by Portland Press Limited on behalf of the Biochemical Society and distributed under the <ext-link xlink:href="https://creativecommons.org/licenses/by/4.0/" ext-link-type="uri">Creative Commons Attribution License 4.0 (CC BY)</ext-link>.</license-p></license>` | CONFIRMED text/logic in all 3 (`license-p` text byte-identical in all 3); the `license-type`/`xmlns:xlink` **attributes on `<license>` are missing in pkg1** — inconsistency, see §14. **No sample has a non-CC-BY License Type**, so the "else" branch (e.g. subscription/all-rights-reserved license text) is unobserved — §15-Q2 |
| `custom-meta-group` | raw.xml, filtered | **Deny-list filter, not an allow-list** (see evidence below): drop (a) all `QN_*` reviewer-scorecard keys, (b) `reviewer-decline-reasons`, (c) `Decision Draft` (full decision-letter text), (d) file-manifest entries (`manuscript`/`figure`/`supplement`/`coverletter`/`responsetoreviewer`/`trackchanges`/`licencetopublishform`/`tables`/etc.) belonging to a **superseded (non-latest) round**, (e) duplicate/earlier `submission-decision` values, keeping only the final one(s). Everything else — including form-answer fields unique to one package only (`Ethical Research Statement`, `Clinical perspective`, `Submitting Author Details`, `ccc-integration-status`, `pdf-job-id`, `copyeditor information`, `Article Language`, `tables`, `High risk`, `Author Resubmission`, etc.) — **passes through unchanged**. | CONFIRMED as a deny-list (not an allow-list): pkg1 and pkg3 each retain several custom-meta keys the *other* package doesn't have, proving the rule can't be "keep only these N known keys" — it must be "drop these known internal keys, keep everything else" |
| `body` | — | **absent** — article.xml has no `<body>` element at all | CONFIRMED (3/3) |

---

## 5. Field-by-field mapping — `<id>_manifest.xml`

DOCTYPE: `<!DOCTYPE manifest PUBLIC "-//MECA//DTD Manifest v1.0//en" "./schema/manifest-1.0.dtd">`, root `<manifest xmlns="https://manuscriptexchange.org/schema/manifest" xmlns:xlink="..." manifest-version="1">` — **CONFIRMED identical in all 3**.

| Output field | Source | Rule | Class |
|---|---|---|---|
| `item[@id=item-article]` | fixed | `item-type="article-metadata"`, `item-description="Article metadata exported from JATS (publisher-id: <publisher-id value>)"`, `instance media-type="application/xml" xlink:href="<id>_article.xml"` | CONFIRMED — `<publisher-id value>` is the **verbatim `article-id[@pub-id-type=publisher-id]` string**, whatever format it has in source (explains why pkg1/2 show `CS20256808`/`CS20258493` and pkg3 shows `cs-2025-8827` — those are literally each package's own publisher-id field, **not an inconsistency**) |
| `item[@id=item-reviews]` | fixed | `item-type="review-metadata"`, description = `"MECA reviews.xml generated from JATS custom-meta and history dates"` (constant), href = `<id>_reviews.xml` | CONFIRMED (byte-identical description in all 3) |
| `item[@id=item-transfer]` | fixed | `item-type="transfer-metadata"`, description = `"MECA transfer.xml with source/destination info"` (constant), href = `<id>_transfer.xml` | CONFIRMED |
| one `item` per file custom-meta entry | Kriyadocs `custom-meta` (specific-use=form-files) | `item-type` = lookup table below; `instance/@media-type` = extension lookup (§8); `instance/@xlink:href` = `files/<Round>/<original filename>` | CONFIRMED |
| `item-description` | Kriyadocs `named-content` fields | **Garbled/truncated text** — see §14 (classified as a human/tooling defect, not a rule to replicate) | Pattern present in all 3 → CONFIRMED to be a defect, **not** CONFIRMED as an intended format |
| item ordering | — | Items for the **current/latest round are listed first**, items for the **earlier round(s) are appended after** | CONFIRMED (3/3) |
| `item/@id` values | — | No discoverable deterministic formula — see §14 (human/clerical numbering, **do not replicate**) | Pattern of breakage CONFIRMED, underlying "rule" is NOT a rule |

**Item-type lookup table** (CONFIRMED — every key observed across all 3 samples maps consistently):

| custom-meta `meta-name` (file category) | manifest `item-type` |
|---|---|
| `manuscript` | `manuscript` |
| `figure` | `figure` |
| `licencetopublishform` | `author agreement` |
| `coverletter`, `supplement`, `responsetoreviewer`, `trackchanges`, `tables`, *(any other file-category key not listed above)* | `supplemental` |

---

## 6. Field-by-field mapping — `<id>_reviews.xml`

DOCTYPE: `<!DOCTYPE review-group PUBLIC "-//MECA//DTD Reviews v1.0//en" "../DTD/reviews-1.0.dtd">`, root `<review-group content-version="1.0" xmlns="https://manuscriptexchange.org/schema/reviews" xmlns:xlink="..." xmlns:ali="...">` — **CONFIRMED identical in all 3.**

⚠ **This is the least standardized file.** Package 1 uses a visibly simpler/incomplete attribute set than packages 2 and 3 (see §14). Packages 2 and 3 agree with each other on the fuller schema and are treated here as the **canonical target pattern**; package 1's *structure* is treated as superseded, while its *content coverage* (see below) is the most complete of the three and should inform the converter's scope.

| Output field | Source | Rule | Class |
|---|---|---|---|
| `review/@review-version` | round name (`Original`/`R1`/...) | present in pkg2/pkg3; **absent in pkg1** | STRONGLY INFERRED to be required (pkg2+pkg3 agree); pkg1's omission = defect |
| `review/@review-type` | — | `"review"` (a reviewer's evaluation) or `"decision"` (an editor/associate-editor decision). Pkg1 additionally uses a **literal string `"CDATA"`** for anything that doesn't fit those two — this is not a legal DTD-enumerated value, it is a mistaken literal copy of the DTD's attribute-declaration keyword `CDATA` — **do not replicate**, see §14 | CONFIRMED valid values = `review`/`decision` only (pkg2, pkg3); pkg1's 3rd value is a defect |
| `review/@blinding` | fixed | `"single"` in every review in pkg2/pkg3 | STRONGLY INFERRED constant (only "single" observed — no sample has open/double-blind review) |
| `review/@permission-to-publish`, `@permission-to-transfer` | fixed | `"yes"`/`"yes"` on every review in pkg2/pkg3 | STRONGLY INFERRED constant (no sample shows a "no") |
| One `<review review-type="review">` per **(reviewer × round)** | Kriyadocs workflow log (reviewer assignment/status/scorecard per round) | Emit one block per reviewer who was invited in a given round, regardless of outcome | CONFIRMED (3/3 — every invited reviewer appears, including declined/terminated ones) |
| `review-item[@review-item-type=recommendation]` | scorecard overall recommendation | title = "Overall Recommendation" (pkg3) or "Recommendation" (pkg1); data = the recommendation text (e.g. "Send for major revisions", "Accept") | CONFIRMED concept; exact `<title>` wording differs pkg1 vs pkg2/3 — cosmetic |
| `review-item[@review-item-type=comments]`, split `attended-for="authors"` (`is-confidential="no"`) vs `attended-for="editor"` (`is-confidential="yes"`) | reviewer's free-text comments (from correspondence/mail-body log), separated into the "to author" and "to editor confidential" channels the source system tracks separately | CONFIRMED split logic (3/3); `sequence-number`/`attended-for`/`is-confidential` attributes present in pkg2/pkg3, **absent** in pkg1 (single undifferentiated `comments` item) |
| Reviewer with **no scorecard** (declined / auto-unassigned / terminated) | workflow status log | Single `review-item[type=recommendation or correspondence]` with a status string, e.g. `"Terminated - Auto Unassigned"`, `"Rejected - Declined review"` | CONFIRMED (3/3) — wording of the status string is copied/paraphrased from the source status, not from a fixed enum; exact phrase varies (see §14 minor) |
| Reviewer comments submitted as an **uploaded PDF** rather than scored fields | correspondence log entry with a file attachment | `review-item[@review-item-type=file]` containing `<ext-link xlink:href="https://ppl.kriyadocs.com/resources/...">` pointing at the **live Kriyadocs-hosted URL** | CONFIRMED pattern (present in pkg3); the file is **linked, not copied into `files/`** — flag for business confirmation, §15-Q3 |
| `<review review-type="decision">` | editor/associate-editor "Decision Draft" custom-meta text, one per round | `review-item[type=decision]`, `attended-for="authors"`, data = a **generated summary sentence** ("Send for major revisions. Decision letter issued <date> by Editor <name> and Associate Editor <name>. <screening queries...>") followed by/incorporating the actual decision-letter text | CONFIRMED shape (3/3); exact summary-sentence wording is free-text composition, not templated identically pkg-to-pkg — treat as "compose a summary + full text", not "fill this exact template string" |
| Editor screening/query checklist (ORCID, reference format, DOIs, etc.) | one combined correspondence log message containing several bullet points | **Split into one `review-item[type=correspondence]` per bullet point**, each with its own generated `<title>` (e.g. "Screening Check: ORCID (...)") | CONFIRMED (3/3, pkg1 has 3 separate query items too) |
| Reviewer/editor identity | Kriyadocs `contrib`/`useremail` in the log | `contrib-group/contrib[@contrib-type=reviewer\|editor\|associate-editor]`, `name`, `email` | CONFIRMED |
| Dates | Kriyadocs `time-log`/`history`/`stage` (assign/due/submit) | `<date date-type="assigned\|due\|submitted">` | CONFIRMED — cross-checked against `history` dates in article.xml, consistent |
| Duplicate correspondence log of an already-scored review | same reviewer's comments, logged again as a raw "query action" | A **second, separate** `<review review-type="review">` with `review-item[type=correspondence]`, nearly-duplicate text of the formal scored review | CONFIRMED present in pkg3 (2 reviewers) and in pkg1 (as the extensive Query 1-29 list) — appears deliberate (full audit trail of every correspondence event, not just the formal review), see §15-Q4 for confirmation on scope |
| Author-suggested reviewers, editor re-assignment history, copyediting/typesetting/publisher queries with author replies | present **only in pkg1** | pkg1's reviews.xml goes considerably further than pkg2/pkg3, capturing: author-suggested-reviewer list, full editor re-assignment chain per round, and a full post-acceptance **copyediting/proofing query log** (publisher queries with author replies, up to "PUBLISHER RESPONSE: Resolved") | Only 1/3 samples show this depth → STRONGLY INFERRED that this is *desirable* content (it exists and is clearly derived the same way as everything else) but **not proven required** since pkg2/pkg3 omit it entirely — §15-Q5 |

---

## 7. Field-by-field mapping — `<id>_transfer.xml`

DOCTYPE: `<!DOCTYPE transfer PUBLIC "-//MECA//DTD Transfer v1.0//en" "./schema/transfer-1.0.dtd">`, root `<transfer xmlns="https://manuscriptexchange.org/schema/transfer" transfer-version="1.0">`, **XML declaration has NO encoding attribute** (`<?xml version="1.0"?>` only) — **CONFIRMED identical in all 3.**

| Output field | Source | Rule | Class |
|---|---|---|---|
| `transfer-source/service-provider/provider-name` | fixed | `"Portland Press Limited"` | CONFIRMED (3/3) |
| `transfer-source/service-provider/contact/contact-name/surname`, `given-names` | — | **always empty** in all 3 | STRONGLY INFERRED intentional (3/3 consistently blank — not an editing accident since it's blank in every sample); confirm whether this should ever be populated, §15-Q6 |
| `transfer-source/service-provider/contact/email`, `publication/contact/email` | corresponding-author email (`author-notes/corresp`, first/primary corresp) | copied — same email used for both fields | CONFIRMED (3/3) |
| `transfer-source/service-provider/contact/phone` | — | always empty | STRONGLY INFERRED (no sample ever has a phone number in source data either) |
| `publication/publication-title` | `journal-meta/journal-title` | `"Clinical Science"` copied | CONFIRMED |
| `publication/acronym` (source **and** destination) | — | pkg1 = `"CLINSCI"`, pkg2 = `"CLINSCI"`, pkg3 = `"CS"`. Neither string is a byte-identical copy of any *single* source field consistently: pkg3's `"CS"` **does** match `journal-id[@journal-id-type=publisher-id]`/`abbrev-journal-title[@abbrev-type=publisher]`; `"CLINSCI"` **appears nowhere** in any of the 3 source XMLs (confirmed by full-text search) | **ASSUMPTION — NEEDS CONFIRMATION** (§15-Q7): is "CLINSCI" a fixed, externally-known Silverchair/Portland-Press system code that should always be used (majority 2/3), or is `"CS"` (derivable straight from source) the correct rule and pkg1/pkg2 are wrong? Cannot be resolved from samples alone. |
| `destination/service-provider/provider-name` | fixed | `"Silverchair"` | CONFIRMED (3/3) — Silverchair is Portland Press's hosting platform for every sample; if the converter must ever support a different destination platform this needs to become configuration, not a hard-coded constant |
| `destination/security/authentication-code` | `article-id[@pub-id-type=publisher-id]` value | Format = `"<publisher-id>|<publisher-id>"` (same value repeated, pipe-separated) | CONFIRMED **once you use publisher-id consistently**: pkg1=`CS20256808\|CS20256808`, pkg2=`CS20258493\|CS20258493`, pkg3=`cs-2025-8827\|cs-2025-8827` — each is that package's own publisher-id field verbatim. (Earlier draft of this analysis flagged this as "inconsistent format" — re-verified: it is **not** inconsistent, it is a straight copy of a source field whose own format happens to vary per submission.) |
| `processing-instructions/processing-instruction[@processing-sequence=1]` | fixed | `"Validate Metadata"` | CONFIRMED |
| `processing-instructions/processing-instruction[@processing-sequence=2]` | fixed | `"Ingest Article Package"` | CONFIRMED |
| `processing-instructions/processing-comments` | filename | `"Generated automatically from source JATS: <id>_raw.xml"` | CONFIRMED |

---

## 8. Generated vs. copied — consolidated inventory

**Copied verbatim from the Kriyadocs XML (no transformation of the value itself, only of surrounding XML structure/ids/namespaces):**
journal title/ISSN/publisher name; article title; contrib-group (names, emails, ORCIDs); affiliations; corresponding-author email(s); copyright-statement/year; funding-group; keywords; subject headings; counts; history dates; custom-meta form-answers (Article Summary, Ethical Statement, Clinical perspective, License Type, COI, Dual publication, Submitting Author Details, plagiarism-report, etc.); custom-meta file-manifest entries (type/name/path/size); all physical files under `files/`.

**Generated / synthesized (value did not exist as-is in the Kriyadocs XML):**
- `article.xml` real DOI (`10.1042/` + stripped doi-id)
- `article.xml` `<license>` block (from `License Type` custom-meta value)
- `article.xml` `article-type="Original Study"` constant
- `manifest.xml`: all 3 fixed metadata items, item-type per file (via lookup table), item-description text (though defectively, §14), media-type per extension
- `reviews.xml`: entire file — every `<review>`, `<date>`, `<review-item>`, decision summary sentences, split correspondence items
- `transfer.xml`: entire file except the 2 copied email fields, publication-title, and authentication-code value (destination provider, acronym-if-CLINSCI, processing-instructions are fixed/generated)
- raw.xml / article.xml DOCTYPEs, namespaces, pretty-printing

---

## 9. File processing rules

1. **CONFIRMED** — The authoritative file list is the set of `custom-meta[@specific-use="form-files"]` entries in the Kriyadocs XML, **not** a directory listing of `Original/`/`R1/`. Verified in pkg1: a 36-file browser-cache artifact (`*.docx.html` + `*_files/`) physically present in `R1/` has **no** matching custom-meta entry and is excluded from `files/` entirely.
2. **CONFIRMED** — Every file that *is* referenced is copied **byte-identical** (md5-verified) into `files/<Round>/<original filename>` — no re-encoding, no renaming, no re-compression.
3. **CONFIRMED** — Original filename (with spaces, mixed case, parentheses, etc.) is preserved exactly as submitted; no slugification.
4. **STRONGLY INFERRED** — If a custom-meta file entry has no matching physical file (not observed in the 3 samples, but structurally possible), the converter must treat this as a hard validation error, not a silent skip, per the general principle in §11 of the reverse-engineering report.
5. **ASSUMPTION — NEEDS CONFIRMATION** — Whether a physical file present in the input folder but *not* referenced by custom-meta should ever be flagged/logged as a warning (vs. silently ignored as today). §15-Q8.
6. Media-type mapping by file extension — **CONFIRMED** (all values observed across all 3 packages, every distinct extension present in the samples):

   | Extension | `media-type` |
   |---|---|
   | `.doc`, `.docx` | `application/msword` *(both extensions map to the same legacy MIME type — confirmed 3/3, but technically non-standard for `.docx`; flag for business confirmation whether the modern OOXML MIME type should be used instead, §15-Q9)* |
   | `.pdf` | `application/pdf` |
   | `.xlsx` | `application/vnd.ms-excel` *(legacy Excel MIME type; same flag as above, §15-Q9)* |
   | `.jpg`/`.jpeg` | `image/jpeg` |
   | `_article.xml` (the generated item only) | `application/xml` |

   No `.png`, `.tif`, `.zip`, or other extension appears in any of the 3 samples — behavior for unmapped extensions is **unresolved**, §15-Q10.

---

## 10. Folder processing rules

1. **CONFIRMED** — Each round in the input (`Original`, `R1`) becomes an identically-named subfolder under `files/` in the output (`files/Original/`, `files/R1/`).
2. **CONFIRMED** — Folder names are copied verbatim from the input; the converter does not rename/normalize round-folder names.
3. **STRONGLY INFERRED** — A round folder that doesn't exist in the input (e.g., a package with no revision at all) simply doesn't appear in the output; this is inferred from general structural logic, not directly observed (all 3 samples have both `Original` and `R1`).

---

## 11. Multi-round (Original, R1, R2, …) processing rules

1. **STRONGLY INFERRED** — Round identity = the custom-meta file entries are grouped by which "generation" of the Kriyadocs snapshot/workflow-log they belong to; in practice this aligns 1:1 with the `Original`/`R1` folder split already present in the input. No sample exceeds R1, so the generalization to R2/R3/... is **untested** — §15-Q11.
2. **CONFIRMED** (article.xml) — When a file category (e.g. `manuscript`) has an entry in more than one round, **only the latest round's entry** survives the custom-meta pruning into `article.xml`; **raw.xml keeps all rounds' entries**.
3. **CONFIRMED** (manifest.xml) — All rounds' files are listed, latest round first, earlier round(s) appended after.
4. **CONFIRMED** (reviews.xml) — Reviewer/editor activity is tracked **per round** (`review-version="Original"` vs `"R1"`); the same human reviewer can appear multiple times, once per round they were involved in, each a separate `<review>` block.
5. **ASSUMPTION — NEEDS CONFIRMATION** — Whether "latest round" is always resolvable purely from folder name lexical order (`R1` < `R2` < `R10`? needs care), or must be resolved from an explicit sequence/snapshot number in the Kriyadocs XML (`vocab-identifier="snapshots/19_authorrevision/..."` — the leading integer looks like the authoritative round-order key). **Recommendation: use the `snapshots/<N>_...` integer prefix as the ordering key, not the folder name string**, since it's the one integer sequence actually present in source data — but this is inferred, not directly tested against a package with ≥3 rounds. §15-Q12.

---

## 12. Namespaces, DTDs, and formatting requirements (consolidated)

| File | XML decl. | DOCTYPE | Root namespaces | Encoding attr casing | BOM |
|---|---|---|---|---|---|
| `_raw.xml` | `version="1.0" encoding="UTF-8"` | JATS Publishing DTD v1.3 | `xmlns:mml`, `xmlns:xlink`, `xmlns:xsi`, `xmlns:ali` | **UTF-8** (upper) | none observed |
| `_article.xml` | `version="1.0" encoding="utf-8"` | JATS Archiving DTD v1.2 | `xmlns:xlink` only, and only if the document uses `xlink:href` anywhere (pkg1/pkg2 have it; pkg3 omits it despite needing it — defect, §14) | **utf-8** (lower) | none observed |
| `_manifest.xml` | `version="1.0" encoding="UTF-8"` | MECA Manifest v1.0 | `xmlns` (default, manifest schema) + `xmlns:xlink` | UTF-8 (upper) | none observed |
| `_reviews.xml` | `version="1.0" encoding="UTF-8"` | MECA Reviews v1.0 | `xmlns` (default, reviews schema) + `xmlns:xlink` + `xmlns:ali` | UTF-8 (upper) | **present in pkg1 & pkg3, absent in pkg2** — inconsistency, treat as a defect; converter output should **not** include a BOM, §14 |
| `_transfer.xml` | `version="1.0"` **(no encoding attribute at all)** | MECA Transfer v1.0 | `xmlns` (default, transfer schema) | n/a | none observed |

General formatting: raw.xml/article.xml/manifest.xml/reviews.xml are all pretty-printed (indented, one element family per line); transfer.xml is pretty-printed with blank lines between major sections and HTML-style `<!-- ======== -->` section-divider comments (cosmetic, not schema-required).

---

## 13. Business rules — master numbered list

1. Input is one Kriyadocs-export XML per article + `Original/`(+`R1`,...) file folders. **CONFIRMED**
2. File inclusion is driven by custom-meta references, not directory scan. **CONFIRMED**
3. Files are copied byte-identical, original names preserved. **CONFIRMED**
4. `raw.xml` = JATS-Publishing-DTD reformat of the full source record (all custom-meta, all rounds, minus internal workflow/log tags). **CONFIRMED**
5. `article.xml` = JATS-Archiving-DTD derivative of `raw.xml`: ids stripped, DOI generated, license synthesized from License Type, custom-meta pruned by deny-list (QN_*, decline-reasons, decision-draft text, superseded-round file entries). **CONFIRMED**
6. `article-type` in article.xml is a constant `"Original Study"`, independent of source subject classification. **STRONGLY INFERRED / needs confirmation for non-Research types**
7. DOI formula: `10.1042/` + doi-article-id with `-`/`_` stripped, case preserved. **CONFIRMED**
8. `manifest.xml` lists 3 fixed metadata items + one item per submitted file; item-type from a small fixed lookup table; media-type from extension; latest-round items first. **CONFIRMED**
9. `reviews.xml` reconstructs the full peer-review/decision/correspondence history from the workflow log: one `<review>` per reviewer per round (scored or status-only), decisions as separate `review-type="decision"` blocks, multi-point editor checklists split into individual items, raw correspondence optionally duplicated alongside the formal review. **CONFIRMED shape / STRONGLY INFERRED completeness scope**
10. `transfer.xml` is a mostly-fixed template: source=Portland Press Limited, destination=Silverchair, corresponding-author email plugged in twice, authentication-code = publisher-id repeated pipe-separated, fixed 2-step processing instructions. **CONFIRMED**
11. Round folders map 1:1 by name; multi-round file-category collision resolves to "latest round wins" for article.xml, "all rounds, latest first" for manifest.xml. **CONFIRMED for Original/R1; untested beyond**

---

## 14. Inconsistencies identified as human/tooling mistakes (not business rules)

| # | Observation | Evidence | Verdict |
|---|---|---|---|
| M1 | `manifest.xml` `item-description` text is visibly truncated mid-word / mid-UUID, with stray leftover characters (e.g. `"coverletter – coverletterx_temp/98ae--45fd-b9e1-ef201b39c5eb/x"`) | Traced against the underlying custom-meta `type`/`name`/`path` fields in pkg3: the description is a naive concatenation of those fields with missing separators, then something truncates it inconsistently — no fixed target length, no clean field boundaries. Present in all 3 packages in the same broken shape. | **Tooling/formatting defect.** Converter should generate a clean description instead (e.g. `"<category> — <original filename> (<size> bytes)"`), not attempt to replicate the corruption. |
| M2 | `manifest.xml` `item/@id` values are not a clean sequence (`file-1`..`file-17`, then jump to `file-111`, `file-1110`, `file-1111`..., **skipping** `file-115`/`file-1116` in pkg1) | pkg1 and pkg3 both show gaps inconsistent with any simple per-round counter | **Clerical/copy-paste defect** (packages were hand-built). Converter should generate a clean, deterministic id scheme (e.g. `file-<round-index>-<sequence>` or a flat `file-1..N` across all rounds in a defined order) rather than reproduce this. |
| M3 | `reviews.xml` structural richness differs sharply: pkg1 omits `review-version`/`blinding`/`permission-to-publish`/`permission-to-transfer`/`sequence-number`/`attended-for`/`is-confidential` entirely and uses the literal (illegal) value `review-type="CDATA"` for uncategorized entries; pkg2/pkg3 use the fuller attribute set and never use `"CDATA"` | Full-file comparison, §6 | `"CDATA"` is almost certainly a misreading of the DTD's own attribute-declaration syntax (`review-type CDATA #REQUIRED`) as if it were a legal value. **Treat pkg1 as an early/incomplete build; pkg2+pkg3's schema usage is canonical.** Pkg1's broader *content coverage* (queries, editor-reassignment history, post-acceptance copyediting log) is still valuable evidence of scope, just not of correct tag usage. |
| M4 | `permissions/license` has `license-type="open-access"` + `xmlns:xlink` attributes in pkg2/pkg3 but **no attributes at all** on the same element in pkg1 | §4 | Omission in pkg1, not a business variant — pkg1 built before the fuller pattern was adopted. |
| M5 | `article.xml` root `<article>` element declares `xmlns:xlink` in pkg1/pkg2 but **not** in pkg3, even though pkg3 uses `xlink:href` inside its `<ext-link>` (license) — technically invalid XML (undeclared namespace prefix in use) | §4 | Defect in pkg3. Converter must always declare `xmlns:xlink` on `<article>` whenever any `xlink:*` attribute is used anywhere in the document. |
| M6 | `permissions/copyright-statement` text: pkg1/pkg2 = `"© 2025 The Author(s)."`, pkg3 = `"© 2025 The Authors."` | §4 | Likely reflects genuine per-submission source-data differences (each Kriyadocs export carries its own copyright-statement string) rather than a converter defect — **copy the source value verbatim; do not standardize wording.** Flagged here only so it isn't mistaken for a bug when implementing. |
| M7 | `transfer.xml`/`reviews.xml` BOM (byte-order mark) present in pkg1 & pkg3, absent in pkg2 | Raw byte inspection of file headers | Artifact of whichever text editor/save path was used to hand-build each package. **Converter output should never include a BOM.** |
| M8 | `transfer.xml` `publication/acronym`: `"CLINSCI"` (pkg1, pkg2) vs `"CS"` (pkg3) — neither is obviously "the bug", see §15-Q7 | §7 | Cannot be classified as a mistake with confidence — kept as an open business question rather than declared a defect. |

---

## 15. Ambiguities requiring business confirmation (cannot be resolved from the 3 samples)

1. **`article-type` mapping** — Is `"Original Study"` truly constant for every article type Silverchair/Portland Press might send (Research, Review, Correction, Editorial, Case Report...), or is there a lookup table that happens to collapse to the same value for the 2 types seen (Research, Review)? Need at least one sample of a different `display-channel` value with a different expected output, or the actual lookup table from Silverchair/Portland Press.
2. **Non-CC-BY license text** — All 3 samples are CC-BY open access. What `<license>` block should be generated when `License Type` is something else (e.g. a subscription/all-rights-reserved article)?
3. **Reviewer PDF attachments** — Should a reviewer's uploaded PDF review (currently linked via `ext-link` to a live `ppl.kriyadocs.com` URL) instead be fetched and copied into `files/` and listed in the manifest, so the MECA package is self-contained? The live-link approach was observed but may not be acceptable for archival/transfer purposes.
4. **Duplicate correspondence entries in reviews.xml** — Confirm whether logging the same reviewer's comments twice (once as the formal scored `review`, once as a raw "query action" `correspondence`) is intentional full-audit-trail behavior to always replicate, or should be de-duplicated by the converter.
5. **Scope of reviews.xml content** — Pkg1 includes author-suggested reviewers, full editor-reassignment history, and post-acceptance copyediting/proofing query logs; pkg2/pkg3 don't. Should the converter always attempt to extract and include all of these categories when present in source data, or is pkg1's extra depth out of scope for a standard package?
6. **`transfer-source` contact name** — Always blank in all 3 samples. Confirm this is intentional (no named contact captured by the source system) rather than a field the converter should be populating from some other source-system field not yet identified.
7. **`transfer.xml` journal acronym** — `"CLINSCI"` (2/3 samples) vs `"CS"` (1/3, matches source `abbrev-journal-title[@abbrev-type=publisher]`/`journal-id[@journal-id-type=publisher-id]` exactly). Which is correct? If `"CLINSCI"` is a fixed Silverchair-side code unrelated to anything in the Kriyadocs XML, it must be supplied as external configuration (e.g. a journal-code lookup table), not derived from source.
8. **Unreferenced physical files** — Should the converter warn/log when a physical file exists in the input folder but has no matching custom-meta entry (today: silently excluded), to help catch cases where a real submission file was mistakenly not tagged in the source system?
9. **Media-type mapping standard** — Should `.docx`→`application/msword` and `.xlsx`→`application/vnd.ms-excel` (legacy MIME types, as consistently used in all 3 samples) be kept as-is, or corrected to the modern OOXML MIME types (`application/vnd.openxmlformats-officedocument.wordprocessingml.document` / `...spreadsheetml.sheet`)? The samples are 3/3 consistent on the legacy mapping, but it may not be MECA/Silverchair-compliant.
10. **Unmapped file extensions** — No sample contains `.png`, `.tif`/`.tiff`, `.zip`, `.mp4`, `.csv`, etc. What should the converter do for an extension with no defined media-type (reject the package, fall back to a generic `application/octet-stream`, or maintain an extensible config table)?
11. **R2 and beyond** — All 3 samples stop at `R1`. Multi-round rules (§11) are extrapolated from the Original/R1 pattern and are unverified for 3+ rounds.
12. **Round ordering key** — Recommend using the Kriyadocs `vocab-identifier="snapshots/<N>_..."` integer as the authoritative "latest round" ordering key rather than lexical folder-name comparison, but this hasn't been tested against a package with non-trivial round counts (e.g. `R2` vs `R10`).
13. **Zero-round packages** — No sample represents a desk-accepted paper with no revision round at all (i.e., only `Original/`, no `R1/`). Behavior (does `reviews.xml` still get a `decision` block? does manifest still order correctly with just one round?) is unverified but should follow trivially from the rules above.
14. **Rejected/withdrawn packages** — No sample represents a manuscript that was ultimately rejected (as opposed to accepted). Whether a MECA package would even be generated for such a case, and if so what `reviews.xml`'s final decision block would contain, is unknown.

---

## 16. Confidence summary

- Source-data model & file-inclusion rule: **~95%** (directly verified, md5 + diff).
- `raw.xml` construction: **~95%** (3/3 confirmed, mechanical tag-strip + DOCTYPE swap).
- `article.xml` construction: **~85%** (DOI formula, id-stripping, license synthesis all 3/3 confirmed; the `article-type` constant and exact custom-meta deny-list boundary are pattern-inferred, not exhaustively enumerable from 3 samples — §15-Q1).
- `manifest.xml` construction: **~85%** (item-type lookup table and 3 fixed items are 3/3 confirmed; item-id numbering and item-description text are confirmed **defects**, not rules — meaning the converter's *correct* behavior here is a clean-room design choice, not a replication task, which paradoxically raises confidence once you stop trying to replicate the bugs).
- `reviews.xml` construction: **~65%** (overall shape confirmed 3/3; the canonical attribute schema is only 2/3-confirmed since pkg1 differs; scope of "how much correspondence/history to include" is genuinely open, §15-Q4/Q5).
- `transfer.xml` construction: **~80%** (nearly all fields confirmed 3/3 once the publisher-id-format non-issue was resolved; the acronym field remains a real, unresolved 2-vs-1 disagreement, §15-Q7).

**Overall: ~85%** of the converter's behavior is now backed by direct 3-sample evidence with a clear CONFIRMED/INFERRED/ASSUMPTION trail; the remaining ~15% is enumerated exhaustively in §15 as specific, answerable questions rather than open-ended unknowns.
