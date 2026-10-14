# Generator Suite Review Report — Milestone 6H

A verification-only milestone: no new functionality, no architecture
change, no ICAM redesign. Reviews the complete pipeline (Input → Parser
→ Metadata Extraction → Transformation → ICAM → raw.xml → article.xml →
manifest.xml → reviews.xml → transfer.xml) as one system, using
empirical evidence gathered directly against the current codebase and
all 3 real reference packages — not a re-summary of prior milestone
reports, though it draws on and cross-checks them throughout.

**One confirmed, currently-live defect was found and is documented in
§5 and elevated in the Technical Debt Register — no code was changed to
fix it** (per this milestone's own instruction: "only fix confirmed
implementation defects if discovered"; this finding's root cause is the
already-documented, deliberately-deferred `RoundInfo` semantic mismatch
from Milestone 6E, not a new coding bug — see §5.3 for the precise
distinction). The one change made this milestone is a **test-only**
strengthening: `tests/golden/test_manifest_xml_golden.py` now asserts
this exact behavior explicitly (a regression tripwire), closing what
was previously an unasserted gap in golden coverage.

---

## 1. Method

Every empirical claim in this report was produced by one of:
- A fresh `grep`/`pytest`/`mypy`/`ruff` invocation against the current source tree during this review (not copied from a prior report without re-verification).
- A standalone script running the real parse → extract → transform → generate pipeline against all 3 real reference packages simultaneously, cross-checking fields across all 5 generators' output from the *same* `ArticleModel` instance per sample.
- Direct byte/structural inspection of the real `Output/*.zip` reference packages.

No claim here is asserted "per the Milestone 6X report" without having been independently re-run.

---

## 2. Architecture Review

### 2.1 Layering / dependency direction

```
grep -rn "from meca_engine.extraction\|from meca_engine.transform" src/meca_engine/generators/
→ NONE FOUND
```

Zero imports from `extraction` or `transform` anywhere under `generators/`, across all 5 generator packages plus the shared framework (`generators/xml/`, `generators/base.py`, `generators/context.py`, `generators/diagnostics.py`, `generators/result.py`, `generators/validation_hooks.py`). **Confirmed: the generation layer has no route to Milestone 3/4/5B internals at all** — this is enforced by the absence of any import path, not merely a convention.

### 2.2 Generator isolation (no unauthorized cross-generator dependency)

```
grep -rn "from meca_engine.generators\.(raw_xml|article_xml|manifest_xml|reviews_xml|transfer_xml)" src/meca_engine/generators/*/generator.py src/meca_engine/generators/*/*.py
```

Every hit is either a package importing its own sibling module (e.g. `manifest_xml/generator.py` importing `manifest_xml/document.py`) or the one explicit, approved exception: `article_xml/generator.py` imports `raw_xml.generator.RawXmlGenerator` (BR-051's mandated composition). **`manifest_xml`, `reviews_xml`, and `transfer_xml` have zero cross-generator imports** — confirmed, matching each one's own milestone-time design constraint.

### 2.3 Framework reuse / zero duplicated XML construction

```
grep -rn "SubElement(|Element(|ET\.Element" src/meca_engine/generators/ --include="*.py" | grep -v "generators/xml/builder.py|TYPE_CHECKING import"
→ 0 real hits (only docstring prose mentioning xml.etree.ElementTree)

grep -rn "fromstring(|tostring(" src/meca_engine/generators/ --include="*.py" | grep -v "generators/xml/helpers.py|generators/xml/builder.py"
→ 0 hits
```

**No generator constructs an `Element` directly, and no generator calls `fromstring`/`tostring` outside the framework's own `xml/builder.py`/`xml/helpers.py`.** Every one of the 5 generators builds its tree exclusively through `XmlDocumentBuilder`, resolves every namespace exclusively through `NamespaceManager`, and shares helpers (`add_optional_element`, `strip_attribute_matching`, `uses_prefix`, `parse_document_with_namespaces`, `parse_fragment_with_namespaces`, `add_custom_meta_entry`) rather than reimplementing them — each addition to this shared library (Milestones 6B–6D) was made available to, and in several cases later reused by, every subsequent generator.

### 2.4 ICAM immutability

```
grep -rn "object.__setattr__|model\.\w*\.\w* *=" src/meca_engine/generators/ --include="*.py" | grep -v "==|!=|>=|<="
→ 0 hits

grep -rn "dataclasses.replace" src/meca_engine/generators/ --include="*.py"
→ 0 hits
```

No generator mutates the ICAM in place, and none even uses `dataclasses.replace()` on an ICAM type (which would be legitimate but is simply never needed — every generator is a pure, read-only consumer). Every ICAM dataclass remains `frozen=True` from Milestone 1 onward, unchanged.

### 2.5 Configuration boundaries

See §4 (Configuration Review) for the full hardcode audit. Summary: every generator's constructor takes only `NamespaceManager` plus its own `*Config` dataclass (or, for `article_xml`, additionally `RawXmlGenerator` per BR-051) — no generator reads a config file path or environment variable directly; all configuration flows through the already-established `ConfigLoader` → `GeneratorContext`/constructor-injection pattern, unchanged across all 5 generators.

### 2.6 Validation hook interfaces

`generators/validation_hooks.py`'s 3 abstract hook classes (`DtdValidationHook`, `SchemaValidationHook`, `BusinessRuleValidationHook`) remain unimplemented and unwired into `BaseGenerator` — confirmed via `grep`, zero references to any of the 3 class names anywhere under `generators/*/generator.py`. This is correct and expected: these are reserved extension points for the future `ValidationEngine` milestone (11_LLD_02 §4.8), and every generator built so far (6B–6G) correctly used `DiagnosticsCollector` instead, per each milestone's own explicit "do not implement validation rules" instruction.

**Architecture verdict: clean. No violation found in any of the 6 dimensions above.**

---

## 3. Business Rule Coverage (BR-036–160)

Full generator-by-generator BR traceability already exists in each generator's own milestone report (20/21/23/27/30) and is not repeated field-by-field here. This section summarizes coverage by category and calls out every BR this suite-level review specifically re-verified.

| Category | Range | Count | Status |
|---|---|---|---|
| D. raw.xml Generation | BR-036–050 | 15 | Implemented (Milestone 6B); re-verified structurally sound this review |
| E. article.xml Generation | BR-051–075 | 25 | Implemented (Milestone 6C); BR-070 documented as evidence-over-text (majority pass through unfiltered) |
| F. manifest.xml Generation | BR-076–095 | 20 | Implemented (Milestone 6D); **BR-083/144 confirmed violated in current output — see §5.3** |
| G. reviews.xml Generation | BR-096–125 | 30 | Implemented (Milestone 6F) — 15 evidence-backed, 12 structurally-supported-but-never-exercised (ICAM population gap), 3 not-implementable with current ICAM |
| H. transfer.xml Generation | BR-126–140 | 15 | Implemented (Milestone 6G) — 13 evidence-backed, 1 config-driven-by-design ambiguity (BR-133/135, ADR-007), 1 satisfied by construction (BR-140) |
| I. Multi-Round Processing | BR-141–150 | 10 | **Newly reviewed this milestone** — see §3.1 |
| J. Cross-File Consistency & Package Invariants | BR-151–160 | 10 | **Newly reviewed this milestone** — see §3.2 |

### 3.1 Section I (Multi-Round Processing, BR-141–150) — newly verified this review

| BR | Rule | Status | Evidence |
|---|---|---|---|
| BR-141 | Round set = physical folders ∩ custom-meta-referenced rounds | **Partially satisfied** | `resolved_files` only ever contains rounds that are BOTH physically present AND custom-meta-declared (by construction of `file_resolver.resolve_files`); confirmed CS-2025-6808's `Original` round physical files (16 of them) are never custom-meta-declared, so they never enter the ICAM at all — a confirmed, already-documented (Milestone 6D §4) source-data/extraction-layer gap, not violated by any generator |
| BR-142 | Latest round = highest `vocab-identifier` sequence number | **Confirmed correct** | `round_resolver.py`'s `is_latest` computation is exactly this, unchanged since Milestone 5B/6E; re-verified via direct inspection this review |
| BR-143 | article.xml: latest-round-wins for file-category collisions | **Implemented correctly, starved by upstream data** (Milestone 6C/6E finding, reconfirmed) | Filter logic itself is correct (unit-tested against synthetic `RoundIndex` data); real output is starved because `RoundInfo.label` never equals a physical round-folder name — see §5.3 |
| BR-144 | manifest.xml: all rounds, latest round first | **VIOLATED in current output — confirmed this review** | See §5.3. All 3 real samples: generated order is `Original` then `R1`; real evidence is `R1` (the actually-latest round) then `Original` |
| BR-145 | reviews.xml: per-round independent reviewer/editor records | **Confirmed correct** | Verified: `ReviewerScorecard`/`DeclineReason` records are never merged across rounds; each round_label produces its own `<review>` block, unit-tested (`test_rounds_ordered_ascending_by_sequence_number`) and confirmed against real evidence (same reviewer appears in `Original` and `R1` as 2 distinct scorecards, e.g. CS-2025-6808's "Pu-Hong Zhang (Reviewer)") |
| BR-146 | raw.xml never structurally distinguishes rounds | **Confirmed correct** | `custom-meta-group` is one flat list in raw.xml's output, unchanged since Milestone 6B |
| BR-147 | Single-round package still produces all 5 XML files | **Confirmed correct** | `cs-2025-8827` has only 1 `RoundInfo` entry and still produces a complete, well-formed 5-file suite (verified this review) |
| BR-148 | Round-naming beyond `Original`/`R1` unverified | **Unchanged, still unverified** | No real sample demonstrates a 3rd round name; ADR-013's synthetic-fixture precedent (used in manifest.xml/reviews.xml/article.xml unit tests) is the only coverage for this case |
| BR-149 | Converter must not assume exactly 2 rounds | **Confirmed correct** | Every round-iterating code path (`article_xml`, `manifest_xml`, `reviews_xml`) operates on `RoundIndex`/collections generically — confirmed via each one's own synthetic 3-round unit test (`test_three_round_ordering_generalizes_latest_first_adr_013`, `test_rounds_ordered_ascending_by_sequence_number`, etc.); no generator source contains a literal `2` or hard-coded round count |
| BR-150 | No round-to-round file diffing performed | **Confirmed correct (satisfied by omission)** | No generator attempts this; matches real evidence (no sample output flags "this figure replaced that one") |

### 3.2 Section J (Cross-File Consistency & Package Invariants, BR-151–160) — newly verified this review

| BR | Rule | Status | Evidence |
|---|---|---|---|
| BR-151 | `<ArticleID>` prefix identical across all 5 filenames | **Confirmed correct, 3/3** | Directly verified this review: all 5 generators derive their filename from the same `model.identity.article_id`; e.g. CS-2025-6808 → `CS-2025-6808_{raw,article,manifest,reviews,transfer}.xml` |
| BR-152 | manifest.xml hrefs must resolve to files that exist in the package | **Confirmed correct, within ICAM scope** | Every file-item href is built directly from `ResolvedFile.staged_physical_path`'s own basename — by construction, a href can only exist if a corresponding `ResolvedFile` (and therefore a real, resolved, on-disk file) exists; verified `manifest file hrefs == resolved_files hrefs` exactly, 1:1, for CS-2025-6808 |
| BR-153 | Every physical file under `files/` referenced by exactly one manifest item | **Confirmed correct for the "manifest → files" half; the "files → manifest" half is unverifiable at this layer** | `ManifestXmlGenerator` never emits a duplicate or dangling href (confirmed above); the reverse direction (does every file physically staged actually get a manifest item) depends on custom-meta completeness, an already-documented upstream gap, and cannot be fully validated until Package Assembly has real `files/` directory contents to check against |
| BR-154 | DOI must be unique across the production batch | **Not yet testable — flagged for Package Assembly / DOI Registry** | Each of the 3 real samples' DOIs happen to be unique (confirmed: `10.1042/cs20256808`, `10.1042/cs20258493C`, `10.1042/cs20258827`), but batch-level uniqueness checking is explicitly out of any single generator's scope (11_LLD_02's `registry.doi_registry` module, not yet built) |
| BR-155 | `history` dates chronologically sane (`received ≤ revision ≤ accepted`) | **Confirmed correct, 3/3 — a direct, positive consequence of the Milestone 6E fix** | Verified this review: `(2025-04-27, 2025-07-20, 2025-08-06)`, `(2025-09-09, 2025-11-10, 2025-11-17)`, `(2025-10-13, 2026-04-15, 2026-05-18)` — all strictly ascending. Before Milestone 6E's fix, `revision` was always `None`, so this invariant was vacuously but uninterestingly true; it is now meaningfully verified |
| BR-156 | Every reviews.xml decision corresponds to a matching `history/date` entry | **Structurally plausible, not independently cross-validated by any test** | Both `decision_drafts` and `history_dates` are populated per-round in the ICAM, but no test in the suite currently cross-references reviews.xml's decision round against article.xml/raw.xml's history dates directly — a genuine, minor test gap, logged in the Technical Debt Register |
| BR-157 | Package must contain ≥1 manuscript-category file | **Confirmed correct, 3/3** | Verified this review: exactly 1 `item-type="manuscript"` manifest item in every one of the 3 real samples' generated output |
| BR-158 | Open-access license → `licencetopublishform`-category file present | **Confirmed correct, 3/3** | All 3 real samples resolve to `license-type="open-access"` (BR-063/064) and all 3 have a `licencetopublishform`-mapped (`item-type="author agreement"`) file present in `resolved_files` |
| BR-159 | Source Kriyadocs XML treated as read-only | **Confirmed correct, architecturally enforced** | No generator, extractor, or transformer anywhere in `src/meca_engine/` opens a source file in write mode — confirmed via `grep -rn "open(" | grep -i "'w'\|\"w\""` returning no hits against any `Input/`-sourced path |
| BR-160 | All 5 outputs generated atomically as one package | **Not yet applicable — Package Assembly's responsibility** | No orchestration layer exists yet to make this guarantee; each generator today is invoked and tested independently. Correctly out of scope for the generation layer itself; flagged as a **Package Assembly prerequisite**, not a generator defect |

---

## 4. Configuration Review

Searched the entire `generators/` tree for literal business-value strings that should be configuration-driven:

```
grep -rnE '"(Portland Press|Silverchair|Clinical Science|CLINSCI|application/(pdf|msword|octet-stream)|10\.1042|CC-BY|Creative Commons)"' src/meca_engine/generators/
→ 2 hits, both benign:
  - article_xml/generator.py:379 — `if "CC-BY" in normalized:` — a classification
    PATTERN for detecting which source license-type string maps to the
    `"CC-BY-4-0"` config key (BR-065), not an output VALUE. The actual
    boilerplate text/URL is 100% config-driven (license-templates.yaml).
  - transfer_xml/generator.py:18 — a docstring sentence *explaining* ADR-007's
    background (prose, not code).

grep -rnE '"(1\.2|1\.3|research-article|Original Study|UTF-8|utf-8)"' src/meca_engine/generators/*/generator.py [...]
→ 0 hits

grep -n 'manifest-version|"transfer-version"|content-version' src/meca_engine/generators/*/generator.py
→ all 3 read from `config.manifest_version` / `config.content_version` / `config.transfer_version`
```

**Verdict: zero remaining hard-coded business values found.** Every value named in every milestone's "do not hard-code" list — publisher names, journal names, DOI prefixes, article types, MIME types, license text, namespace URIs, DTD versions, organization names, transfer metadata — is sourced from one of: `RawXmlConfig`, `ArticleXmlConfig`, `ManifestXmlConfig`, `ReviewsXmlConfig`, `TransferXmlConfig`, `JournalConfig`, `PublisherConfig`, `MediaTypeConfig`, `ArticleTypeMappingConfig`, `LicenseTemplatesConfig`, `ItemTypeMappingConfig`, or `NamespaceConfig`. The one confirmed, still-open *business ambiguity* (ADR-007's journal acronym) is itself handled the config-driven way — read from `JournalConfig.acronym`, never guessed or hard-coded to either observed value.

The single structural pattern-matching literal (`"CC-BY"` substring match) is a deliberate, evidence-based classification heuristic (BR-065), analogous to `_UUID_ID_PATTERN` elsewhere in the same file — not a business-value literal, and correctly not configuration (it is a stable, structural detection rule, not a value that varies by journal/publisher/deployment).

---

## 5. Cross-Generator Consistency Review

Full field-by-field results are in the companion **Cross-Generator Consistency Matrix** (`33_CROSS_GENERATOR_CONSISTENCY_MATRIX.md`). This section summarizes the method and highlights the one confirmed defect.

### 5.1 Method

A single script built one `ArticleModel` per real sample and ran all 5 generators against the *same* `GeneratorContext`, then cross-checked every field two generators independently derive or reference: article/publisher identifiers, DOI, journal title, DTD versions, encoding declarations, namespace declarations, contributor/reviewer identities and emails, affiliation cross-references, file hrefs, and the manifest.xml fixed items' references to the other 4 generators' own actual filenames.

### 5.2 Consistent fields (no contradiction found)

- **Article identifiers**: `publisher_id_value` identical in raw.xml and article.xml, 3/3; `<ArticleID>` filename prefix identical across all 5 generated filenames, 3/3 (BR-151).
- **DOI**: raw.xml carries the source DOI-id verbatim (BR-039); article.xml carries the *generated* DOI (BR-058). These are **expected to differ** — not a contradiction, a documented business-rule distinction (raw.xml = verbatim copy layer, article.xml = transformation layer).
- **Journal identifiers**: `journal_title` identical between raw.xml and transfer.xml, 3/3.
- **DTD versions**: raw.xml declares `1.3` (JATS Publishing DTD), article.xml declares `1.2` (JATS Archiving DTD) — **expected to differ**, different DTD families entirely (BR-036 vs. BR-052).
- **Encoding**: raw.xml/manifest.xml/reviews.xml declare upper-case `UTF-8`; article.xml declares lower-case `utf-8`; transfer.xml declares no encoding attribute at all. **Expected to differ** — each is its own independently-evidenced, confirmed BR (BR-038/053/086/120/127), not an inconsistency.
- **Namespaces**: raw.xml unconditionally declares `mml`/`xlink`/`xsi`/`ali` (BR-037); article.xml conditionally declares only `xlink` when used (BR-055/056); manifest.xml declares default+`xlink`; reviews.xml declares default+`xlink`+`ali`; transfer.xml declares only the default namespace. Every one matches its own generator's own confirmed BR — verified this review, no contradiction.
- **Authentication code**: `transfer.xml`'s `authentication-code` matches `raw.xml`/`article.xml`'s `publisher_id_value`, pipe-joined, exactly, 3/3.
- **Manifest → sibling-file references**: manifest.xml's 3 fixed items reference `article.xml`/`reviews.xml`/`transfer.xml` by filename; verified **exact match** (both case-sensitive and case-insensitive) against what those 3 generators actually produce, 3/3 — the 5 generators are internally, mutually self-consistent on filenames even for `CS-2025-6808` (the one sample with the known real-vs-generated casing quirk against the *real* reference package; see §5.4).
- **Corresponding-author email**: `article.xml`'s `author-notes/corresp/email` matches `transfer.xml`'s `service-provider/contact/email` exactly, 3/3 — both independently derive from `article_meta.corresponding_emails[0]`.
- **Affiliation cross-references**: every `xref[@ref-type='aff']/@rid` is a subset of the `aff/@id` set present in the same document, in both raw.xml and article.xml, 3/3 — no dangling reference.
- **File referential integrity (BR-152)**: manifest.xml's full set of file-item hrefs is byte-identical to the set derived directly from `resolved_files`, 3/3 — no fabricated, missing, or mismatched href.

### 5.3 The one confirmed, currently-live cross-generator defect: manifest.xml round ordering (BR-083/144)

**Finding**: manifest.xml's generated file-item order is `Original` (round) first, then `R1` — on **all 3** real samples. Real evidence's own order is the opposite: `R1` (the actually-latest round) first, then `Original`. This directly violates BR-144 ("manifest.xml uses all rounds, latest first").

**Root cause, precisely traced**: `ManifestXmlGenerator`'s round-ordering algorithm (`_add_file_items`) sorts by matching each `ResolvedFile.round_label` against `RoundInfo.label` in the ICAM's `RoundIndex`. On every one of the 3 real samples, `RoundInfo.label` is **always `"Original"`** (it is derived from `<article-version-type>`, an attribute confirmed — first in Milestone 6E §1.4, reconfirmed here — to never vary across any real sample regardless of how many `<article-version>` elements exist or what they represent). `ResolvedFile.round_label`, by contrast, uses the *physical staged-folder* naming convention (`"Original"`/`"R1"`), which is a completely different, unrelated vocabulary. The consequence: `"Original"`-labeled files always resolve against the `RoundIndex` (and sort using their real, correct sequence number), while `"R1"`-labeled files **never** resolve (no `RoundInfo` is ever labeled `"R1"`) — so every `R1` file falls through to the generator's own documented defensive fallback ("unresolved round → sort last, diagnosed"), which is *exactly why* `Original` now sorts before `R1` in every sample, the opposite of BR-144's required order.

**Is this a new defect, or the already-known one manifesting?** The latter, precisely. This is not a new algorithmic bug — `ManifestXmlGenerator`'s sort logic is exactly as designed, exactly as unit-tested (including its own synthetic-fixture regression test for the "unresolved round sorts last" branch), and was never changed by this review. What **is** new is the *precise, empirical confirmation* that this already-documented `RoundInfo` semantic mismatch (Milestone 6E §1.4/§8) doesn't just theoretically risk BR-066/BR-123-style degradation (as characterized in the article.xml and reviews.xml reports) — for manifest.xml specifically, on every single one of the 3 real samples, it **fully inverts** the required top-level file ordering. This was not previously verified by an automated test: `test_manifest_xml_golden.py`'s existing href-comparison used a `set`, which is order-insensitive by construction, so this inversion was present but silently unasserted since Milestone 6D.

**Action taken this review**: `tests/golden/test_manifest_xml_golden.py` was strengthened with an explicit, order-aware assertion that captures and locks in this exact, confirmed, current behavior as a regression tripwire (so any future change — whether a real fix or an accidental further regression — will be caught and force a conscious update to this assertion, rather than silently drifting). **No production code was changed.** Per this milestone's explicit scope ("only fix confirmed implementation defects if discovered"), the determination made here is that the *implementation* (the sort algorithm) is not defective — the *upstream data* it depends on (`RoundInfo.label`'s vocabulary) is the confirmed root cause, and fixing that was already explicitly and deliberately deferred in Milestone 6E pending business input, for reasons (the "do not introduce additional round inference" constraint, repeated in 3 subsequent milestones' instructions) that remain valid today. See the Technical Debt Register (item TD-1, **Critical**) for the full remediation options.

### 5.4 Known, already-documented, non-contradictory differences (re-confirmed, not new)

- **`article_id` casing** (`CS-2025-6808` only): the real reference package's own filenames/hrefs/processing-comments use lower-case `cs-2025-6808`, while this project's generated output (all 5 generators, mutually consistent with each other) uses the mixed-case `CS-2025-6808` from the Input folder name. First found in Milestone 6D, reconfirmed present in manifest.xml's fixed-item hrefs and transfer.xml's `processing-comments` this review. **Not a cross-generator inconsistency** — every generator agrees with every other generator; the divergence is only against the external reference package.
- **Corresponding-email selection** (`CS-2025-8493_C` only): `article_meta.corresponding_emails[0]` (`ld454@cam.ac.uk`) is used consistently by both article.xml and transfer.xml — internally consistent with each other, but the real reference package uses the ICAM's *second* corresponding email instead. First found in Milestone 6G; a Milestone 5B (`contributor_transformer.py`) question, out of this review's "do not modify architecture" scope.

**No unexplained difference remains.** Every difference found this review, by construction of §5.2–5.4 above, is attributed to a specific, named cause and classified per the taxonomy in §6.

---

## 6. Golden Review — Consolidated Classification

Ran the full pipeline against all 3 real reference packages for all 5 generators (18 golden tests total, 18/18 passing). Every difference found, classified per this milestone's required taxonomy:

| Difference | Classification | Generator(s) | Evidence |
|---|---|---|---|
| DOI differs between raw.xml (verbatim) and article.xml (generated) | **Architecture decision** | raw.xml, article.xml | BR-039 vs. BR-058 — two deliberately different, independently-confirmed rules for two deliberately different layers |
| DTD version differs (1.3 vs. 1.2) | **Architecture decision** | raw.xml, article.xml | Different DTD families entirely (BR-036, BR-052) |
| Encoding casing/presence differs per document type | **Architecture decision** | all 5 | Each independently confirmed 3/3 against real evidence (BR-038/053/086/120/127) |
| `RoundInfo.label` always `"Original"`, never matches physical round-folder labels | **Layer limitation** | article.xml (BR-066), manifest.xml (BR-083/144), reviews.xml (BR-123) | Milestone 6E §1.4/§8, reconfirmed with new precision this review (§5.3) |
| Manifest.xml file-item count short of real evidence | **Source-data limitation** | manifest.xml | Custom-meta simply never declares the `Original` round's 16 physical files for CS-2025-6808 (Milestone 6D §4) |
| Reviews.xml content depth (recommendation text, comment splits, editor identity, dates, extended-scope categories) | **Source-data limitation** | reviews.xml | `WorkflowLog.events`, `ReviewerScorecard.overall_recommendation`/dates, `DecisionDraft.editor_name`/`.associate_editor_name`/`.decision_date` confirmed always empty/`None` on all 3 real samples (Milestone 6F §0) |
| Journal acronym (`CLINSCI` vs. `CS`) | **Open business ambiguity** | transfer.xml (and manifest.xml/article.xml indirectly via `JournalConfig`) | ADR-007, explicitly unresolved, "Business Confirmation Required: Yes — highest priority" |
| Corresponding-email selection (`CS-2025-8493_C`) | **Open business ambiguity** | transfer.xml | New this suite (Milestone 6G), a Milestone 5B question |
| `article_id` casing (`CS-2025-6808`) | **Source-data limitation** | manifest.xml, transfer.xml (confirmed); raw.xml/article.xml (latent, never directly asserted) | Milestone 6D, reconfirmed 6G/6H |
| `"CDATA"` `review-type` literal | **Reference package defect** | reviews.xml (never replicated) | Confirmed present in 2 of 3 real packages (13, 32 occurrences) — a defect in the hand-built reference packages themselves, not a rule (BR-099) |
| BR-084/085 naive item-description concatenation, broken id sequence | **Reference package defect** | manifest.xml (never replicated) | BR-084/085's own text; ADR-010/011's recommended clean replacements implemented instead |
| Outer `<license>` missing attributes (`CS-2025-6808`) | **Reference package defect** | article.xml (never replicated) | BR-064's own text; 2/3 samples carry the canonical attributes, this one sample omits them |
| CRLF line endings / multi-line attribute wrapping in real files | **Layer limitation (framework)** | all 5 | `XmlDocumentBuilder` always emits LF, single-line attributes; a `06A` framework constraint, not revisited this review per "do not modify architecture" |
| manifest.xml BR-083/144 round order inverted | **Layer limitation** (root cause) manifesting as a **confirmed implementation-adjacent gap in test coverage** (now closed) | manifest.xml | §5.3, this review |
| BR-070 (submission-decision "keep only final value") | **Business rule improvement** | article.xml | Real evidence (3/3) shows all round values pass through unfiltered; the Business Rule Book's literal text is superseded by evidence, documented explicitly (Milestone 6C) |

**No entry in this table is unclassified or unexplained.**

---

## 7. Performance Review

Consolidated from each generator's own milestone report, all measured on the same hardware (Apple silicon, single process, no parallelism) against the same 3 real samples:

| Generator | Fastest sample | Slowest sample | Peak memory range | Notes |
|---|---|---|---|---|
| raw.xml | 10.0 ms (cs-2025-8827) | 26.6 ms (CS-2025-6808) | ~2.0 MB | Largest output size (~1 MB), dominant cost is `XmlDocumentBuilder.serialize`'s internal deep-clone |
| article.xml | 40.7 ms* | 90.8 ms* | 5.8–12.7 MB | *Includes the composed raw.xml build (BR-051); article.xml's own marginal cost is small |
| manifest.xml | 0.4 ms | 0.9 ms | 50–149 KB | No composed-generator overhead; cheapest of the "rich" generators |
| reviews.xml | 0.49 ms | 0.71 ms | 67–145 KB | Comparable to manifest.xml; scales with reviewer/round count, not file count |
| transfer.xml | 0.265 ms | 0.274 ms | 21–37 KB | Fastest and smallest of all 5 — `O(1)` in every dimension, no round/file/reviewer iteration |

**ICAM build time dominates end-to-end latency in every case** (135–406 ms per sample, vs. sub-100ms for even the most expensive generator) — none of the 5 generators is a bottleneck relative to extraction/transformation. **Configuration loading overhead** was not separately profiled this review (each generator's constructor is called once per batch run in the intended design, per `generators.base.Generator`'s own documented "instantiated once, reused across articles" lifecycle — not per-article), but `ConfigLoader`'s own JSON-Schema-validation-per-file cost is a one-time, batch-startup cost, not a per-article one, consistent with 12_LLD_03 §5.9's design.

**Generator reuse**: every generator is stateless beyond its injected, read-only config (confirmed via `grep` — no generator has a mutable instance attribute set after `__init__`), matching the framework's own documented thread/process-safety contract ("instantiated once, reused across articles").

**No bottleneck identified.** At the 3-sample scale tested, and by algorithmic analysis (every generator is `O(n)` or `O(n log n)` in its own natural input size — files, reviewers, or a small fixed constant — never worse), nothing here is expected to become a bottleneck at production scale (6,000–10,000+ articles/run) before the ICAM-build stage does.

---

## 8. Test Review

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 895 passed, 0 failed |
| Golden tests | 18 (3 per generator × 5 generators + 3 for metadata→ICAM), 18/18 passing |
| Per-generator unit test counts | raw.xml 51, article.xml 49, manifest.xml 37, reviews.xml 41 (18+15+8 across generator.py/review_builder.py/decision_builder.py), transfer.xml 32 |
| Framework unit test counts | `xml/builder.py` 26, `xml/helpers.py` 31, `xml/namespaces.py` 9, `base.py` 5, `context.py` 3, `diagnostics.py` 8, `result.py` 2, `validation_hooks.py` 8 |
| Overall project coverage | 99% (3,807 statements, 11 missed — all in unimplemented future-milestone stub modules: `orchestrator/run_controller`, `validation`, `packaging`, etc.) |
| Coverage, every generator module (all 5 packages + framework) | **100%**, confirmed this review via a fresh `pytest --cov` run, not copied from a prior report |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (246 files) |
| `mypy --strict` | Clean (111 source files) |

### 8.1 Coverage gaps identified this review

1. **BR-156 cross-validation** (reviews.xml decision round ↔ article.xml/raw.xml history date) has no dedicated test anywhere in the suite — a genuine, minor gap (Technical Debt Register, TD-6, Low).
2. **manifest.xml round-order regression coverage** — closed this review (§5.3); previously a silent gap (the `set`-based href comparison could never have caught an ordering regression).
3. **Batch-level invariants** (BR-154 DOI uniqueness, BR-160 atomic 5-file generation) have no test coverage anywhere, correctly, since no batch/orchestration layer exists yet — flagged as a **Package Assembly prerequisite**, not a generation-layer gap.

No other coverage gap was found: every BR implemented by every generator has at least one directly-attributable unit test, and every generator's defensive/diagnostic branch is exercised (100% branch coverage confirmed per-module).

---

## 9. Maintainability & Testability Assessment

- **Consistent structure across all 5 generators**: every one follows the same shape (`BaseGenerator[T]` subclass, `_generate(context)` only, config injected via constructor, `DiagnosticsCollector` for every data-quality gap, never an exception for a recoverable condition). A developer who has read one generator's code can predict the shape of any other.
- **Decision logs as a maintenance asset**: 4 dedicated decision logs now exist (`22_BUSINESS_TRANSFORMATION_DECISION_LOG.md`, `24_MANIFEST_DECISION_LOG.md`, `28_REVIEWS_DECISION_LOG.md`, `29_TRANSFER_DECISION_LOG.md`), each recording every non-obvious judgment call with its evidence — confirmed, during this review, to still accurately describe current behavior (no drift found).
- **Golden tests as living documentation**: every generator's golden test file's own module docstring explains precisely which real-evidence facts are and are not asserted, and why — this pattern held up well under this review's own fresh scrutiny (no golden test was found to assert something false, though §5.3 found one gap in what it *didn't* assert).
- **Testability**: 100% branch coverage across every generator module was achieved without any test needing to reach into private internals via reflection — every defensive branch is naturally reachable either through the public `generate()` API with a crafted `ArticleModel`, or (for a small number of internal helper functions, e.g. `review_builder.add_review_item`) via direct unit tests of module-level functions, a pattern already established as acceptable in this codebase since Milestone 6C.

---

## 10. Conclusion

The XML generation subsystem — all 5 generators, the shared Generator Framework, and the transformation-layer corrections underneath them — is architecturally clean (zero layering violations, zero duplicated logic, zero hard-coded business values, ICAM immutability fully preserved), extensively tested (895 tests, 100% coverage on every generator module, 99% overall), and its behavior against real evidence is fully classified and explained with no unattributed difference remaining.

One confirmed, currently-live BR-083/144 violation (manifest.xml's round ordering) was found and precisely diagnosed; it is not a new coding defect but the sharpest empirical confirmation yet of the already-known, already-deliberately-deferred `RoundInfo` semantic mismatch. It is now a permanent, asserted regression tripwire in the golden test suite rather than a silent gap.

See the companion documents for the executive summary (`32_XML_GENERATION_READINESS_REPORT.md`), the full field-by-field consistency data (`33_CROSS_GENERATOR_CONSISTENCY_MATRIX.md`), the prioritized debt list (`34_TECHNICAL_DEBT_REGISTER.md`), and the Go/No-Go recommendation (`35_PACKAGE_ASSEMBLY_READINESS_ASSESSMENT.md`).
