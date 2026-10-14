# Business Transformation Decision Log — article.xml Generator (Milestone 6C)

Authoritative reference for every ICAM → article.xml transformation this
milestone implemented. Intended to remove re-analysis for manifest.xml,
reviews.xml, and transfer.xml wherever they read the same ICAM fields
(DOI, license, custom-meta categories, round data). See
`21_MILESTONE_6C_ARTICLE_XML_GENERATOR_REPORT.md` for full evidence,
test names, and the classified Golden Comparison differences this table
summarizes.

| Source ICAM Field | Output article.xml Field | Transformation Applied | Business Rule | Reason | Golden Evidence |
|---|---|---|---|---|---|
| `ArticleIdentity.identity` (whole model, via composed `RawXmlGenerator`) | entire document base | Generate raw.xml first, reparse its serialized output, transform that tree | BR-051 | article.xml is a derived view of raw.xml, not an independent extraction | 3/3: no content in any real article.xml traces to a source field raw.xml itself doesn't already carry |
| — (constant) | DOCTYPE | JATS Archiving & Interchange DTD v1.2 | BR-052 | Different DTD family from raw.xml's Publishing DTD v1.3 | 3/3 exact DOCTYPE match |
| — (constant) | XML declaration `encoding` | Lower-case `utf-8` | BR-053 | Deliberately different casing from raw.xml's upper-case `UTF-8` | 3/3 exact match |
| every element's `id` attribute (raw.xml) | (attribute removed) | Strip iff the value fully matches a bare `8-4-4-4-12` hex UUID | BR-054 | Internal Kriyadocs ids never survive; semantic/cross-reference ids (`aff1`, `cor1`) and UUID-*prefixed* ids (`aff72cc01a2-...`) are load-bearing and must survive | 3/3: 0 bare-UUID ids in any real output; 2/3 samples' prefixed `aff<uuid>` ids confirmed unstripped in both this generator's output and the real reference |
| raw.xml's `xmlns:mml`/`xsi`/`ali`, `xml:lang` | (omitted) | Never declared on article.xml's fresh root | BR-055 | Only `xlink` may ever appear | 3/3 exact match |
| — (derived from tree content) | `xmlns:xlink` | Declared iff any `xlink:*` name exists anywhere in the built tree (`uses_prefix`); resolved via `NamespaceManager.uri_for`, omitted (not raised) if unregistered | BR-056 | Avoids invalid XML (undeclared prefix) without ever hard-coding the URI | 3/3 exact match |
| `ArticleMeta.display_channel_subject` | `/article/@article-type` | Config-driven lookup (`article-type-mapping.yaml`), falling back to a configured default for an unmapped value | BR-057 | Always `"Original Study"` in evidence, but the lookup itself must be externally configurable, not a hard-coded constant | 3/3 exact match across differing source display-channels |
| `ArticleIdentity.doi_article_id_value` | `article-id[@pub-id-type=doi]` | `journal_config.doi_prefix + "/" + value` with every `-`/`_` stripped, casing preserved | BR-058 | DOI is generated, never copied from any source DOI-shaped field | 3/3 exact match, incl. `CS-2025-8493_C`'s retained `_C`→`C` suffix casing |
| `JournalConfig.doi_prefix` | (DOI prefix segment) | Read from journal config, never a literal in generator code | BR-059 | Same value (`10.1042`) observed in all 3 samples, but must be per-journal/publisher configurable | 3/3 same value; config-driven, never hard-coded (`grep`-verified) |
| raw.xml's `article-categories`, `title-group`, `contrib-group`, `aff`, `kwd-group`, `funding-group`, `history`, `counts`, `abstract` | same tags, ids stripped | `import_subtree` deep-copy + `strip_attribute_matching` (BR-054) | BR-060 | Structural content identical to raw.xml aside from id removal | 3/3: title/history/counts/abstract text exact match; contrib-group/aff inherit raw.xml's own already-documented structural gaps (Milestone 6B), unchanged here |
| raw.xml's `author-notes/corresp/email/@xlink:href,@xlink:type` | (attributes removed) | Explicit strip of exactly those two attribute names, only inside `corresp/email` | BR-061 | Plain `<email>address</email>` is the target shape; a `corresp` with no `email` child is left untouched (defensive, unit-tested directly) | 3/3 exact match where present |
| raw.xml's `permissions/copyright-statement`,`copyright-year` | same tags | Copied verbatim (`add_optional_element`) | BR-062 | No wording transformation; same verbatim-copy caveat as raw.xml's own BR-045 | 3/3 exact match |
| `CustomMetaStore.form_answers` (License Type key) | `permissions/license/license-p` + `ext-link` | Synthesize the configured CC-BY boilerplate text and link when the resolved license type is CC-BY | BR-063 | Fixed, publisher-specific legal text — must come from `license-templates.yaml`, never inlined | 3/3 exact identical `license-p` text and `ext-link/@xlink:href` |
| — (derived, from the same synthesis) | `license/@license-type`, `license/@xlink:href` | Applied unconditionally whenever a license is synthesized | BR-064 | Config-driven target shape (`license_type_attr`, `ext_link_href`) | 2/3 exact match; CS-2025-6808's own reference package omits both attributes on the outer `<license>` element — classified as that one package's inconsistency (§4 of the milestone report), not a code defect |
| `CustomMetaStore.form_answers` ("license type"/"License Type" key, case-variant) | (license-type resolution input) | Normalize casing/spacing, match for a `"CC-BY"`-shaped substring; **default to CC-BY when the key is absent entirely** | BR-065 | No sample demonstrates non-CC-BY handling; the absent-key case still receives CC-BY in 1/3 real samples | Evidence-based default, explicitly flagged pending business confirmation (per BR-065's own "Requires Business Confirmation" flag) |
| `CustomMetaStore.file_entries` + `ArticleModel.rounds` | `custom-meta[meta-name="file"]` | Filter to entries whose `round_label` equals the `RoundInfo` marked `is_latest` | BR-066 | Only the latest round's file-manifest entry survives per category; raw.xml keeps all | Filter logic verified correct in isolation (unit tests); **starved to 0 real entries on all 3 samples** by an upstream round-label/round-resolution defect (§4 of the milestone report) — flagged, not silently patched or worked around with a different heuristic |
| `CustomMetaStore.reviewer_scorecards` | (never read) | Category entirely excluded — no code path touches it | BR-067/BR-075 | Every `QN_*`-prefixed reviewer-scorecard key must be excluded, regardless of suffix, without enumerating known keys | 3/3: confirmed absent from all real outputs |
| `CustomMetaStore.decline_reasons` | (never read) | Category entirely excluded | BR-068 | Reviewer decline reasons never reach article.xml | 3/3: confirmed absent |
| `CustomMetaStore.decision_drafts` | (never read) | Category entirely excluded | BR-069 | Full decision-draft text is reviews.xml's concern, not duplicated here | 3/3: confirmed absent |
| `CustomMetaStore.form_answers` ("submission-decision" key) | `custom-meta[meta-name="submission-decision"]` ×N | Passed through unfiltered — **no** BR-070-specific "keep only final value" filter implemented | BR-070 (text) vs. evidence | Business Rule Book's literal text claims only the final decision survives; all 3 real samples' article.xml carry every round's value unfiltered — evidence trusted over the documented rule text | 3/3: CS-2025-6808's real output carries all 4 decision values across rounds, byte-identical to this generator's own (unfiltered) output |
| `CustomMetaStore.form_answers` (every other key) | `custom-meta[meta-name=<key>]` ×N | Copied unconditionally, one `custom-meta` entry per value | BR-071 | Deny-list, not allow-list — package-unique keys must never be silently dropped | 3/3: each real package retains keys the others don't have, all reproduced |
| raw.xml's `body` | (never copied) | `_generate` never reads `raw_root.find("body")` | BR-072 | article.xml never includes a `<body>` element | 3/3: confirmed absent from every real sample |
| `ArticleIdentity.article_id` | output filename | `f"{article_id}_article.xml"` | BR-073 | Fixed filename pattern | 3/3 pattern match |
| — (constant) | `/article/@dtd-version` | `"1.2"`, from config | BR-074 | Fixed DTD version attribute, distinct from raw.xml's `"1.3"` | 3/3 exact match |

## Cross-cutting addendum (Milestone 10, ADR-032)

Not a Milestone 6C/article.xml-specific decision — recorded here as the
project's general-purpose decision log since no dedicated
extraction/file-resolution decision log exists. `extraction/file_resolver.py`
now derives a missing `FileEntry.original_filename` from
`declared_path_hint` (`Path(declared_path_hint).name`), when doing so
can succeed safely, instead of unconditionally raising
`FileReferenceMissingError` — a configurable (`allow_filename_fallback`,
default `true`) **product decision**, not a correction of BR-013/016/017
(both remain the correct description of default/strict behavior — see
their own cross-reference notes in the Business Rule Book). Every
recovered entry is recorded as a `BR013_FALLBACK_FILENAME_FROM_PATH`
warning on `ArticleModel.warnings`, which every downstream generator
(including `manifest_xml`/`reviews_xml`/`transfer_xml`, not just
`article_xml`) inherits via `ArticleModel.resolved_files`/`.custom_meta`
unchanged — this decision sits upstream of every generator, not inside
one. Full decision record: `02_ARCHITECTURE_DECISION_RECORDS.md` ADR-032;
full implementation detail: `56_MILESTONE_10_WARNING_BASED_FALLBACK_IMPLEMENTATION_REPORT.md`.

## Notes for the next generator author

- **DOI/license/round-filtering logic is centralized** in `article_xml/generator.py`'s private functions (`_build_doi`, `_resolve_license_type`, `_add_latest_round_file_entries`) — if manifest.xml or transfer.xml need the same DOI string or the same "latest round" concept, prefer calling `ArticleXmlGenerator`'s output (or extracting these into a shared helper at that point) rather than re-deriving them independently.
- **Do not re-attempt BR-066's file filtering with a different heuristic** to "make it work" against real data — the filter is correct; the input data (`RoundInfo`/`FileEntry.round_label`) is the confirmed defect. Fix `round_resolver.py`/`custom_meta_classifier.py` first.
- **`FormAnswerBag` currently has no "workflow change-tracking" exclusion category** — if manifest.xml/reviews.xml also read `form_answers` directly, they will inherit the same `"<X> was changed"` leakage confirmed on CS-2025-6808 (§4 of the milestone report) until the extraction layer adds that classification.
