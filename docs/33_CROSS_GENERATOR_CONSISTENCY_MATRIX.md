# Cross-Generator Consistency Matrix — Milestone 6H

Every field two or more of the 5 generators (raw.xml, article.xml,
manifest.xml, reviews.xml, transfer.xml) independently derive or
reference, cross-checked from one shared `ArticleModel`/`GeneratorContext`
per real sample. "Consistent" means no generator contradicts another —
it does not mean the fields are byte-identical where a documented
business rule requires them to differ (those are marked "Expected
difference").

| Field | raw.xml | article.xml | manifest.xml | reviews.xml | transfer.xml | Status | Evidence |
|---|---|---|---|---|---|---|---|
| Article filename prefix (`<ArticleID>`) | ✓ | ✓ | ✓ | ✓ | ✓ | **Consistent, 3/3** | Identical `model.identity.article_id`-derived prefix across all 5 filenames (BR-151) |
| Publisher ID value | ✓ | ✓ | — | — | ✓ (via authentication-code) | **Consistent, 3/3** | `publisher_id_value` identical in raw.xml, article.xml, and embedded in transfer.xml's authentication-code |
| DOI | ✓ (verbatim source) | ✓ (generated) | — | — | — | **Expected difference** | BR-039 (raw.xml copies source DOI verbatim) vs. BR-058 (article.xml generates); different layers, different confirmed rules |
| Journal title | ✓ | ✓ | — | — | ✓ | **Consistent, 3/3** | `journal_title` identical between raw.xml and transfer.xml (article.xml embeds it in journal-meta) |
| Journal acronym | — | — | — | — | ✓ | N/A (only transfer.xml uses it) | Config-driven (`JournalConfig.acronym`), ADR-007 open ambiguity |
| DTD version | 1.3 | 1.2 | (schema, not DTD) | (schema, not DTD) | (schema, not DTD) | **Expected difference** | Different DTD families (JATS Publishing vs. Archiving), BR-036/052 |
| Encoding declaration | `UTF-8` | `utf-8` | `UTF-8` | `UTF-8` | none | **Expected difference (per-document confirmed)** | Each independently confirmed 3/3 (BR-038/053/086/120/127) |
| Default namespace | mml/xlink/xsi/ali (unconditional) | xlink (conditional) | default+xlink | default+xlink+ali | default only | **Expected difference (per-document confirmed)** | Each generator declares exactly what its own content requires; no missing/unregistered namespace found |
| Contributor identity (names/affiliations) | ✓ (source) | ✓ (derived) | — | — | — | **Consistent** | article.xml's contributor list traces 1:1 to raw.xml's source contrib-group, no fabricated contributor found |
| Corresponding-author email | — | ✓ (index 0) | — | — | ✓ (index 0) | **Consistent, 3/3** | article.xml and transfer.xml both use `corresponding_emails[0]`; **externally** differs from real evidence on 1/3 samples (CS-2025-8493_C uses index 1) — an open Milestone 5B ambiguity, not a cross-generator inconsistency |
| Affiliation `xref`/`aff` cross-reference | ✓ | ✓ | — | — | — | **Consistent, 3/3** | Every `xref[@ref-type=aff]/@rid` ⊆ `aff/@id` set, both documents, all samples |
| File hrefs (physical files) | — | ✓ (source refs) | ✓ (authoritative) | — | — | **Consistent, within ICAM scope** | manifest.xml's hrefs == `resolved_files` hrefs exactly, 1:1 (BR-152) |
| Sibling-file references (article/reviews/transfer filenames) | — | — | ✓ (3 fixed items) | — | — | **Consistent, 3/3** | manifest.xml's fixed-item hrefs exactly match what article.xml/reviews.xml/transfer.xml actually produce as filenames |
| Manifest round file order | — | — | `Original`, `R1` | — | — | **VIOLATION — see below** | Real evidence: `R1`, `Original` (latest first). Root cause: `RoundInfo.label` semantic mismatch (§5.3 of Suite Review Report) |
| Round-scoped review records | — | (latest-round filter) | — | ✓ (per-round, independent) | — | **Consistent by design** | article.xml intentionally shows only the latest round's content (BR-062/143); reviews.xml intentionally shows every round independently (BR-096/145); not a contradiction — different, confirmed rules for different documents |
| Authentication code | — | — | — | — | ✓ | N/A (only transfer.xml) | Derived from `publisher_id_value`, consistent with raw.xml/article.xml's own value, 3/3 |
| License type / boilerplate | — | ✓ | — | — | — | N/A (only article.xml emits full license text) | Config-driven (`LicenseTemplatesConfig`), BR-063–065 |
| `manuscript`-category file presence | — | — | ✓ (exactly 1) | — | — | **Consistent, 3/3** | BR-157 — confirmed exactly one manuscript item per sample |
| `licencetopublishform`-category file presence | — | — | ✓ (present) | — | — | **Consistent, 3/3** | BR-158 — present for all 3 (all open-access) |
| History dates (received/revision/accepted) | ✓ | ✓ | — | (per-round dates) | — | **Consistent, chronologically sane 3/3** | BR-155 — strictly ascending on all 3 samples, a direct benefit of the Milestone 6E fix |

## Summary

- **19 shared/cross-referenced fields checked.**
- **17 consistent** (either byte-identical where required, or confirmed-correct-and-independently-evidenced where a documented rule requires a difference).
- **1 confirmed violation**: manifest.xml round ordering (BR-083/144) — see the Generator Suite Review Report §5.3 and Technical Debt Register TD-1.
- **1 external-only discrepancy** (not a cross-generator inconsistency): corresponding-email index, where article.xml and transfer.xml agree with *each other* but both differ from the real reference package on 1/3 samples.

**No generator contradicts another generator.** The one confirmed defect is a single generator's (manifest.xml's) output contradicting the *real reference evidence*, not contradicting any of the other 4 generators.
