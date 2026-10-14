# End-to-End Verification Report — Milestone 8

A complete trace of one real reference package (`CS-2025-6808`) through
every stage of the pipeline, run directly against the current codebase
during this milestone (not copied from a prior report). Every number
below is the actual output of that run.

**Important context established by this trace**: no single production
entry point currently performs this full chain (see
`48_COMPLETE_ARCHITECTURE_AUDIT.md` §7) — this trace was produced by
directly invoking each stage's own real, unmodified code in sequence,
exactly as the golden tests already do internally. The trace therefore
proves the *pipeline's own correctness end-to-end*, while separately
surfacing that the *production wiring* to run it this way automatically
does not yet exist.

## Stage 1 — Input

| Fact | Value |
|---|---|
| Root XML file | `CS-2025-6808/cs-2025-6808.xml` |
| Total physical files under the article root | 74 |

**Preserved**: the exact directory structure and every file, byte for
byte, as extracted from the source zip. Nothing is added, transformed,
or removed at this stage — Input is a pure staging/discovery step.

## Stage 2 — XML Parsing

| Fact | Value |
|---|---|
| Parsed root element | `<article>` |
| Well-formedness | OK — `XmlLoader.load()` raised no exception |

**Added**: an in-memory `ParsedDocument` tree structure.
**Preserved**: every byte of the source XML's content and structure.
**Removed**: nothing.

## Stage 3 — Metadata Extraction

| Fact | Value |
|---|---|
| `article.identifiers` | `(publisher-id='CS20256808', doi='cs-2025-6808')` |
| `article.title` | "FAP deficiency attenuates T2DM-associated HFpEF by suppressing the CaMKIIδ-Calcineurin A-NFATc2 signaling pathway" |
| `journal.journal_title` | "Clinical Science" |
| Contributors extracted | 7 authors, 6 editors, 5 affiliations |
| Custom-meta entries | 395 |
| Workflow events | 46 |
| Assets | 17 |
| Cross-references | 138 |
| Diagnostics emitted | 50 (non-fatal — extraction tolerates unrecognized elements by design, BR-005) |

**Added**: 8 structured metadata records (`ArticleMetadata`,
`ContributorMetadata`, `JournalMetadata`, `WorkflowMetadata`,
`CustomMetadata`, `AssetMetadata`, `CrossReferenceMap`, diagnostics) —
every value here is copied verbatim from the source document's own
text/attributes, never invented.
**Transformed**: the source XML's tree structure becomes flat,
typed, extractor-specific records — a representational change only, no
value alteration.
**Preserved**: every extracted value is the source's own literal text.
**Removed**: nothing extracted is dropped; unrecognized elements are
noted as diagnostics, not silently discarded from awareness.

## Stage 4 — ICAM (Transformation)

| Fact | Value |
|---|---|
| `identity.article_id` | `CS-2025-6808` |
| `identity.doi_article_id_value` | `cs-2025-6808` (verbatim source) |
| `identity.publisher_id_value` | `CS20256808` (verbatim source) |
| `rounds` | `[('Original', seq=20, is_latest=True)]` — single round |
| `resolved_files` | **21 of 74** physical files |
| Contributors (merged) | 12 |
| Corresponding emails | 3 (`yunlongzhang@wnmc.edu.cn`, `yuxiaohong0707@dmu.edu.cn`, `gaoljmd@dmu.edu.cn`) |

**Added**: nothing beyond what extraction already produced — the ICAM
is a re-shaping, not a new-data-source, step.
**Transformed**: 3 contributor role-lists (authors/editors/other) merged
into one unified 12-entry `contributors` tuple with a resolved
`ActorRole`; round information consolidated into a `RoundIndex`.
**Preserved**: every identifier value is copied verbatim (no
normalization of `article_id` casing, no alteration of `doi_article_id_value`).
**Removed / not carried forward**: **53 of the 74 physical files (72%)
never resolve into `resolved_files`.** This is the already-documented
Milestone 6D finding (custom-meta never declares these files) —
re-confirmed here, live, on the current codebase, not merely quoted from
an old report. See `53_TECHNICAL_DEBT_REVIEW.md` (TD-5).

## Stage 5 — Generators

| Fact | Value |
|---|---|
| 5 XML documents produced | `CS-2025-6808_raw.xml`, `_article.xml`, `_manifest.xml`, `_reviews.xml`, `_transfer.xml` |
| DOI in raw.xml | `cs-2025-6808` (verbatim source, BR-039) |
| DOI in article.xml | `10.1042/cs20256808` (generated, BR-058) |

**Added**: 5 complete, DTD/schema-declaring, well-formed XML documents,
each independently generated from the same frozen ICAM.
**Transformed**: the DOI (source verbatim → generated form, an
intentional, documented divergence between raw.xml and article.xml —
not a defect, see `33_CROSS_GENERATOR_CONSISTENCY_MATRIX.md`).
**Preserved**: contributor names, affiliations, title, abstract — copied
through unaltered into article.xml's JATS structure.
**Removed**: nothing from the ICAM is silently dropped; every generator
diagnoses (via `DiagnosticsCollector`) any ICAM field it cannot populate
rather than omitting it silently.

## Stage 6 — Package Builder

| Fact | Value |
|---|---|
| DOI reserved | `10.1042/cs20256808` (via `InMemoryDoiRegistry`) |
| Packaged files (from manifest.xml's own declared hrefs) | 21 — **exactly matches** `resolved_files`' count, confirming BR-152/153 referential integrity end-to-end |

**Added**: the `files/<round>/...` physical copy tree, built exclusively
from manifest.xml's own declared hrefs (never from an independent
directory scan).
**Transformed**: nothing — every copied file's bytes are byte-identical
to its source (verified by the Asset Copy Engine's own post-copy
checksum comparison).
**Preserved**: every XML document's bytes, unmodified, from the
generators.
**Removed**: nothing — atomicity guarantees either the complete 26-entry
package or no package at all (verified: this exact run left zero
partial artifacts).

## Stage 7 — ZIP

| Fact | Value |
|---|---|
| Zip entry count | 26 (5 XML + 21 assets) |
| `zipfile.testzip()` integrity check | `None` (no corrupt member) |

**Added**: zip container framing (headers, central directory) only.
**Preserved**: every entry's bytes, unmodified.

## Stage 8 — Final Output

| Fact | Value |
|---|---|
| Deliverable | `MECA_CS-2025-6808.zip` |
| Staging artifacts remaining after completion | 0 (`.package-staging-*` and `.MECA_*.zip.tmp` both absent) |

**Confirmed**: the final zip is the sole artifact remaining at
`output_root`; no intermediate state leaks into the deliverable location.

## Summary: information flow across all 8 stages

| Category | What happens |
|---|---|
| **Added** | Structural framing only, at every stage (parsed tree → typed metadata records → ICAM shape → XML documents → zip container) — no business fact is ever fabricated |
| **Transformed** | DOI (verbatim → generated, article.xml only), contributor role-lists (merged into one ICAM list), file category → item-type/media-type (config-driven mapping) |
| **Preserved** | Every literal text value from the source (names, titles, identifiers, dates, affiliations) — copied verbatim end-to-end unless a specific, cited Business Rule requires a documented transformation |
| **Removed** | Only the 53/74 unresolved physical files (a source-data/custom-meta gap, not a pipeline decision) — no generator or Package Builder ever discards data on its own initiative |

This end-to-end trace, combined with the 24/24 passing golden tests
across all 3 real samples, is direct, current, empirical evidence that
the pipeline's own correctness (as opposed to its production wiring —
see `48_COMPLETE_ARCHITECTURE_AUDIT.md` §7) is fully verified.
