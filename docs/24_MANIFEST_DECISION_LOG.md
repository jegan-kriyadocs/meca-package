# Manifest Decision Log — manifest.xml Generator (Milestone 6D)

Authoritative reference for every file-inclusion/exclusion, ordering,
media-type, identifier, duplicate-handling, checksum-responsibility, and
package-relationship decision this milestone made. Intended for the
**Package Builder / ZIP-assembly milestone**, which will need to
reconcile this generator's manifest.xml against the actual `files/`
directory it writes. See `23_MILESTONE_6D_MANIFEST_XML_GENERATOR_REPORT.md`
for full evidence, test names, and the classified Golden Comparison
differences this log summarizes.

## File inclusion / exclusion

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| One `<item>` per `ArticleModel.resolved_files` entry, no filtering | BR-093/094 | Unlike article.xml (BR-066: latest round only), manifest.xml is exhaustive across every round — it describes the physical package, not a curated metadata view | 3/3: real manifest.xml lists files from every round present |
| No file is ever synthesized or invented when `resolved_files` is incomplete | (Diagnostics-first policy, see report §4) | The ICAM's `resolved_files` only ever contains a `ResolvedFile` for a custom-meta-*declared* `FileEntry` (BR-011) — when a round's files were never declared, this generator has no ICAM route to them and must not reach outside the ICAM (explicit milestone boundary: "Do not access... Source XML") | Confirmed: CS-2025-6808's Original round (16 physical files, real package) has zero declared custom-meta entries, so zero `ResolvedFile`s exist to emit items for — diagnosed as "No resolved files available" only when the *entire* list is empty, not per-round (no per-round emptiness signal exists in the ICAM to diagnose against) |
| A round with zero resolved files contributes zero items | BR-093 | Direct consequence of iterating `resolved_files` — no special-casing needed | Strongly inferred (no sample demonstrates an empty round, but the logic trivially generalizes) |

## Ordering

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| Latest round's files listed first, then earlier rounds, by `RoundInfo.sequence_number` descending | BR-083 | Matches real evidence exactly; generalizes to N rounds via the existing sequence-number ordering authority (BR-010) rather than a 2-round-specific `is_latest` boolean check | 3/3 (2/3 multi-round samples confirm the round-level ordering; synthetic 3-round test per ADR-013 covers the ungeneralized case) |
| Within one round, file order equals `resolved_files`' own stored order (stable sort, not re-sorted) | (Implementation choice, no BR named) | `resolved_files`' order already matches custom-meta's own declaration order, which real evidence confirms matches the real manifest's own within-round item order exactly | Confirmed: CS-2025-6808's 21 R1 items' category/order sequence matches the real manifest's `file-1`..`file-21` sequence exactly |
| A file whose `round_label` is not found in `ArticleModel.rounds` sorts last and is diagnosed | (Defensive design, no real sample exercises this) | Never silently mis-order or drop a file the round-resolution layer mislabeled; surfaces the same already-known `round_resolver.py`/`custom_meta_classifier.py` defect (garbage round labels) instead of hiding it | Unit-tested with a synthetic UUID-style round label matching the real garbage-label pattern already observed in Milestone 6C's investigation |

## Media type resolution

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| Resolved via `MediaTypeConfig.mappings`, keyed on the **physical** filename's extension (via the shared `resolve_media_type`), not by trusting `ResolvedFile.media_type` verbatim | BR-081 | This generator's own responsibility per the task's explicit "Resolve media types using configuration" instruction — makes the resolution self-contained, testable, and diagnosable independent of what a different layer (Milestone 5B) already decided | — |
| Extension lookup logic lives in one shared, foundation-layer function (`utils.media_types.resolve_media_type`), used by both `extraction.file_resolver` and this generator | (Architecture requirement: no duplicated helper logic) | Avoids two independently-maintained MIME tables/lookup implementations drifting apart | `extraction/file_resolver.py` refactored onto it this milestone, 16 pre-existing tests pass unchanged |
| A fallback to `unmapped_extension_default` is diagnosed (`WARNING`) | ADR-009 | "Soft fallback with a WARN, package continues" — this generator's own resolution path now honors that policy explicitly, where it was previously undiagnosed anywhere in the codebase | New: `test_unmapped_extension_defaults_and_is_diagnosed` |
| Fixed items (article/reviews/transfer.xml) always resolve to `application/xml` via the same shared function (not a separate literal) | BR-081 (extended to fixed items) | Consistency — a `.xml` extension resolves the same way everywhere in this generator | 3/3 real samples confirm `application/xml` for all 3 fixed items |
| Exact MIME-type **value** for file items is **not** asserted against real evidence | ADR-008 (legacy vs. modern MIME types), Requires Business Confirmation | All 3 real packages use legacy Office MIME types (`.docx`→`application/msword`); `media-types.yaml` was already configured with modern OOXML types per ADR-008's own recommended default before this milestone — a pre-existing config decision, not revisited here | See ADR-008; flagged for whoever resolves it that manifest.xml is the first generator whose golden test surfaces this concretely |

## Identifier generation

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| `item-article`/`item-reviews`/`item-transfer` — fixed, literal ids | BR-077 | Exact match required for cross-referencing from a future validation engine or Package Builder | 3/3 exact match |
| File items: `f"{file_item_id_prefix}{sequence}"` (default `"file-1"`, `"file-2"`, ...), one flat, globally-incrementing sequence in the already-established round-then-file order | BR-085, ADR-011 Option 1 | The real reference packages' own ids follow no discoverable formula (BR-085's own text: "a clerical artifact, not a formula") — cross-checked against CS-2025-8493_C, which does *not* reproduce the same broken pattern despite an equivalent 2-round structure, confirming it is genuinely non-formulaic, not just under-analyzed. ADR-011's Option 1 (flat sequence) was chosen over Option 2 (round-qualified, e.g. `file-R1-1`) for simplicity, since the round is already fully expressed in the `xlink:href` path — no information is lost. | BR-085/ADR-011 (pre-existing, pre-approved analysis); implemented and unit-tested this milestone (`test_file_item_ids_are_flat_sequential_br_085`) |
| **Pending business confirmation**: whether a destination system needs round-traceable ids (ADR-011 Option 2) instead | ADR-011 | Not yet confirmed either way; low urgency per the ADR's own risk rating | — |

## Duplicate handling

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| Two `ResolvedFile`s sharing an identical checksum are both still listed as separate `<item>`s | (Evidence-based, no BR named) | Confirmed real-world case: `cs-2025-8827` has 2 declared files with byte-identical content under different names/paths, and the real manifest.xml lists both as separate items (`file-9`, `file-10`) — collapsing them would silently lose a legitimately-declared file | Confirmed via direct real-evidence inspection; reproduced in a unit test with a synthetic duplicate-checksum pair |
| A same-checksum pair is diagnosed (`INFO`, not `WARNING`) | (Design choice) | Informational, not necessarily a problem — legitimate duplicate submissions are observed in real data, so this is not treated as an error condition | — |
| No de-duplication by filename, path, or category is performed anywhere in this generator | (Design choice, consistent with BR-011's "every declared entry is authoritative") | Duplication policy belongs to whichever upstream layer decides what counts as "the same file" (out of this milestone's scope) — this generator's job is to faithfully list what the ICAM gives it | — |

## Checksum responsibility

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| No checksum or size attribute is ever emitted on any `<instance>` element | (Evidence-based) | 0/3 real reference packages' manifest.xml carry either attribute — the NISO MECA Manifest DTD v1.0 target does not represent file integrity data here | Direct inspection, 3/3 |
| A `ChecksumAlgorithm` protocol + `Sha256PassthroughChecksum` default implementation exist in `generators/manifest_xml/checksums.py`, but are **never called** from `_generate` | (Explicit task requirement: "implement the framework... clearly separate the interface from the implementation... do not blur generator and packaging responsibilities") | Verifying/recording checksums as files are physically written into the final package zip is the Package Builder milestone's responsibility — this interface exists so that milestone does not need to re-derive "which algorithm, from which ICAM field" from scratch | `ResolvedFile.checksum` is already computed (SHA-256, Milestone 5B, via `utils.hashing.compute_file_checksum`) — `Sha256PassthroughChecksum` simply forwards it, so the Package Builder's default path requires no new hashing work, only wiring |
| A future second algorithm (e.g. MD5) would implement the same `ChecksumAlgorithm` protocol | (Extensibility) | No `ManifestXmlGenerator` code change would be required, since it never references the protocol | — |

## Package relationships

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| The 3 fixed items reference reviews.xml/transfer.xml **by filename only** (`ManifestXmlConfig.reviews_filename_pattern`/`transfer_filename_pattern`), with no dependency on those generators (not yet implemented) | (Explicit milestone scope: "Do not implement any other generator") | manifest.xml's own structure requires referencing these files' names regardless of whether their generators exist yet (BR-077/092: always exactly 3 fixed items) — a config-driven filename pattern is the only construct this milestone can use without violating the "no other generator" boundary | 3/3: real manifest.xml always references these 2 not-yet-built-here documents by name |
| BR-089's "every `files/` entry ↔ exactly one manifest item" invariant is only half-implemented here (the manifest-item half); the physical-file half requires the Package Builder | (Explicit scope boundary) | This generator has no access to an actual `files/` directory — only the ICAM's `resolved_files` list, which is this generator's own single source of truth for "what items exist" | `test_item_count_equals_three_plus_file_count_br_094` verifies the internal half of the invariant (no item is dropped or duplicated relative to `resolved_files`) |
| `article_filename_pattern`/`reviews_filename_pattern`/`transfer_filename_pattern` are config, not derived by calling `RawXmlGenerator.filename`/`ArticleXmlGenerator.filename` at runtime | (Explicit scope boundary: "Do not access... the generator must depend only on ICAM and the Generator Framework") | Avoids a manifest_xml → article_xml dependency the LLD never specifies (unlike article_xml → raw_xml, which BR-051 explicitly mandates) | 11_LLD_02 §4.7's dependency list for `ManifestXmlGenerator` names only `config`, never another generator |

## Notes for the Package Builder milestone

- **Do not expect manifest.xml's file-item count to equal the physical file count** until the `round_resolver.py`/`custom_meta_classifier.py` upstream defect (see the milestone report §4/§8) is fixed — today, some physically-present files in `files/<Round>/` will have no corresponding manifest.xml item, because they were never declared in custom-meta in the first place. BR-089's full invariant cannot be enforced until that upstream gap closes.
- **Wire `checksums.DEFAULT_CHECKSUM_ALGORITHM`** (or a configured alternative) when writing files into the package zip, rather than re-deriving a checksum strategy independently.
- **`item-description` text for file items is this generator's own clean template**, not the real reference packages' broken pattern — do not "fix" the Package Builder to expect the broken pattern if cross-checking against old reference zips.
