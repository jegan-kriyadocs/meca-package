# Architecture Decision Records — MECA Package Generation Engine

Every ADR here corresponds to either (a) a "Requires Business Confirmation" rule in `01_BUSINESS_RULE_BOOK.md`, or (b) a new enterprise-architecture decision introduced by the production requirements (S3, 6,000–10,000+ articles/run, restartability, monitoring). **No ADR here has been implemented or assumed-resolved in code** — each is open until the "Recommended Decision" is explicitly approved.

Status key: all ADRs below are **PROPOSED**, pending business confirmation.

---

### ADR-001 — Article-Type Mapping for `article.xml`
**Background:** All 3 samples output `article-type="Original Study"` regardless of source `display-channel` value (seen: "Research Article", "Review Article", "Research"). No sample contains a Correction, Editorial, or Case Report.
**Decision Required:** Is `"Original Study"` a true constant for every article type, or does a lookup table exist that happens to collapse to the same value for the two types seen?
**Options Considered:** (1) Hard-code the constant. (2) Build a `display-channel → article-type` lookup table with `"Original Study"` as the default/fallback for unmapped values. (3) Query an external metadata service for the correct value per article.
**Recommended Decision:** Option 2 — externally configurable lookup table with a documented default, so the system doesn't need a code change when a Correction/Editorial is first encountered.
**Reasoning:** Preserves observed behavior for known types while not silently mis-tagging an unseen type.
**Impact:** Affects `article.xml` correctness for any non-Research/Review article; low impact today (100% of samples are Research/Review), high future impact at 6,000+ article scale.
**Risk:** Medium — wrong article-type could affect downstream Silverchair categorization/search facets.
**Future Impact:** New article types will surface in production; the lookup table becomes a living config artifact, not a one-time decision.
**Business Confirmation Required:** Yes.

---

### ADR-002 — License Text Generation for Non-CC-BY Articles
**Background:** All 3 samples are CC-BY open access; `<license>` synthesis logic (BR-063) is only proven for that one case.
**Decision Required:** What `<license>` block (if any) should be generated for a subscription/all-rights-reserved article, or a different CC variant (CC BY-NC, CC BY-ND)?
**Options Considered:** (1) Maintain a `License Type → license-p boilerplate` config table covering every license type Portland Press uses. (2) Omit `<license>` entirely for non-OA articles (mirroring raw.xml's behavior, which never has one). (3) Fail validation if `License Type` is anything other than the currently-known values, forcing manual review until confirmed.
**Recommended Decision:** Option 1, with Option 3 as an interim safety net (fail loud for unmapped license types rather than guessing).
**Reasoning:** A wrong or missing license statement on a published article is a legal/compliance risk, not just a formatting issue.
**Impact:** Blocks correct processing of any non-CC-BY submission.
**Risk:** High — legal/compliance exposure if a license is fabricated incorrectly.
**Future Impact:** License config table must be maintained alongside publisher/journal legal policy changes.
**Business Confirmation Required:** Yes.

---

### ADR-003 — Reviewer PDF Attachments: Link vs. Package
**Background:** One sample (pkg3) shows a reviewer's comments submitted as an uploaded PDF, referenced in `reviews.xml` via `<ext-link>` to a live `ppl.kriyadocs.com` URL rather than being copied into `files/`.
**Decision Required:** Should the converter fetch that file and include it physically in the MECA package (self-contained archival), or is an external link acceptable/expected?
**Options Considered:** (1) Keep external link only (matches sample). (2) Fetch-and-embed under a new `files/Reviews/` or similar subfolder, add a manifest item, and reference the local copy instead. (3) Do both — embed a local copy AND keep the original URL as provenance metadata.
**Recommended Decision:** Option 3, if the receiving system (Silverchair) requires self-contained MECA packages; Option 1 if links are acceptable per the transfer agreement. **Cannot be decided without confirming Silverchair's ingestion requirements.**
**Reasoning:** A MECA package is nominally meant to be self-contained for archival transfer; a dangling internal URL (which may not be permanently accessible) undermines that.
**Impact:** Affects package completeness/durability for any article where reviewers attach files instead of using scored fields.
**Risk:** High — if the source URL becomes unreachable post-transfer, the review content is permanently lost from the package.
**Future Impact:** Determines whether the converter needs authenticated access to the Kriyadocs resource-hosting API at packaging time (a new external dependency).
**Business Confirmation Required:** Yes.

---

### ADR-004 — Duplicate Correspondence Entries in `reviews.xml`
**Background:** Some packages log the same reviewer's comments twice — once as a formal scored `<review>`, once as a raw "query action" correspondence entry with near-identical text.
**Decision Required:** Is this duplication a required full-audit-trail feature, or should the converter de-duplicate?
**Options Considered:** (1) Always include both (full fidelity to the source audit log). (2) De-duplicate by content-similarity, keeping only the formal review. (3) Make it a configurable output mode (`full-audit` vs `summary`).
**Recommended Decision:** Option 3 — default to full-audit (matches majority sample behavior) with a config flag to suppress duplicates later if downstream consumers complain about redundancy.
**Reasoning:** Cheapest to reverse (a config flag) versus permanently discarding audit information the business may actually want.
**Impact:** Affects `reviews.xml` size and readability at scale; no correctness impact either way.
**Risk:** Low.
**Future Impact:** None significant.
**Business Confirmation Required:** Yes.

---

### ADR-005 — Scope of `reviews.xml` Content Depth
**Background:** Package 1's `reviews.xml` captures author-suggested reviewers, full editor-reassignment history, and post-acceptance copyediting/proofing query logs; packages 2/3 omit all three categories entirely.
**Decision Required:** Should the converter always extract and include these three categories when present in source data, or are they out of standard scope?
**Options Considered:** (1) Always include everything the source data supports (maximal fidelity). (2) Restrict to the canonical categories proven in 2/3 packages (reviewer reviews + editor decisions only). (3) Configurable per-deployment "review completeness level."
**Recommended Decision:** Option 3, defaulting to Option 1 (maximal fidelity) since more information in an archival package is safer than less, but allow trimming if downstream systems reject unexpected content categories.
**Reasoning:** No sample proves the extra categories are *wrong* to include — only that 2/3 packages happened not to have them documented (possibly because those articles simply had no author-suggested reviewers or editor reassignment events, not because the builder chose to omit them).
**Impact:** Determines the full scope of the reviews.xml generator module.
**Risk:** Medium — omitting real business data if Option 2 chosen; over-scoping the generator if Option 1 chosen without confirmation.
**Future Impact:** Directly determines reviews-generator module complexity and Kriyadocs XML parsing depth required.
**Business Confirmation Required:** Yes.

---

### ADR-006 — `transfer.xml` Source-Contact Name Population
**Background:** `transfer-source/service-provider/contact/contact-name` (surname/given-names) is empty in all 3 samples.
**Decision Required:** Is this intentionally always blank, or should it be populated from a field not yet identified (e.g. the handling editor, a Portland Press production contact)?
**Options Considered:** (1) Leave always blank (matches all samples). (2) Populate from corresponding-author name. (3) Populate from a fixed Portland-Press-side contact configured externally.
**Recommended Decision:** Option 1 until told otherwise — changing established, 3/3-consistent behavior without evidence is riskier than leaving it as observed.
**Reasoning:** No counter-evidence exists; inventing a value is more likely to introduce an error than to fix one.
**Impact:** Low — cosmetic field.
**Risk:** Low.
**Future Impact:** None.
**Business Confirmation Required:** Yes (low urgency).

---

### ADR-007 — `transfer.xml` Journal Acronym Value
**Background:** 2/3 samples use `"CLINSCI"` (not present anywhere in any source XML); 1/3 uses `"CS"` (matches source `abbrev-journal-title[@abbrev-type=publisher]` exactly).
**Decision Required:** Which value is correct, and where does `"CLINSCI"` actually come from if not the source XML?
**Options Considered:** (1) Always derive from source `abbrev-journal-title[@abbrev-type=publisher]` (→ "CS", matches 1/3). (2) Maintain an external journal-acronym config table keyed by publisher-id/journal-id, populated with Silverchair's actual system codes (possibly "CLINSCI", matching 2/3). (3) Ask Portland Press/Silverchair directly which value their ingestion expects.
**Recommended Decision:** Option 3 first (this is a direct, answerable factual question to the destination system owner), falling back to Option 2 if confirmed that Silverchair uses its own internal acronym codes independent of JATS metadata.
**Reasoning:** This is the single highest-priority open question in the entire spec — a wrong acronym could cause silent mis-routing or rejection at the destination system, and it cannot be resolved by looking at more sample packages (both patterns are already attested from the same organization).
**Impact:** Critical — affects `transfer.xml` correctness for every article.
**Risk:** High.
**Future Impact:** Establishes the journal-acronym config table as a first-class configuration artifact for every future journal onboarded.
**Business Confirmation Required:** Yes — **highest priority**.

---

### ADR-008 — Media-Type Mapping Standard (Legacy vs. Modern MIME Types)
**Background:** All 3 samples use legacy MIME types for Office formats: `.docx`→`application/msword`, `.xlsx`→`application/vnd.ms-excel`.
**Decision Required:** Replicate the legacy mapping (matches 100% of observed evidence) or correct it to modern OOXML MIME types, which may be required by current MECA/NISO conformance expectations?
**Options Considered:** (1) Keep legacy mapping (matches samples exactly). (2) Use modern OOXML MIME types for `.docx`/`.xlsx` only, keep legacy for genuinely legacy `.doc`. (3) Make the whole table externally configurable so either behavior is a config change, not a code change.
**Recommended Decision:** Option 3, defaulting to Option 2 (modern types for modern extensions) unless byte-for-byte replication of the manually-built samples is itself a project acceptance criterion.
**Reasoning:** If the manually-built packages are meant to be the literal gold standard the automated output is graded against, Option 1 is required for that specific acceptance test; if they represent "close enough, fix known issues" then Option 2 is more correct going forward. This is a project-goal question, not a technical one.
**Impact:** Affects manifest.xml `media-type` values for every `.docx`/`.xlsx` file — potentially thousands per production run.
**Risk:** Medium.
**Future Impact:** Config table becomes the extension point for every future file type encountered.
**Business Confirmation Required:** Yes.

---

### ADR-009 — Unmapped File Extension Fallback Behavior
**Background:** No sample contains `.png`, `.tif`/`.tiff`, `.zip`, `.csv`, `.mp4`, or other common publishing-supplement formats.
**Decision Required:** What happens when the converter encounters a file extension with no configured media-type mapping?
**Options Considered:** (1) Hard failure — the whole article fails ingestion, forcing manual config update. (2) Soft fallback to `application/octet-stream` with a WARN log, package continues. (3) Soft fallback but flag the whole package for manual QA review before release, without blocking the batch run.
**Recommended Decision:** Option 3 for production batch runs (don't block 9,999 other articles for one unmapped extension), Option 1 acceptable for a single-article debug/dev mode.
**Reasoning:** At 6,000–10,000+ articles/run scale, a hard-fail-the-batch policy on any single unmapped extension is operationally unacceptable; but silently shipping `application/octet-stream` without flagging it risks unnoticed defects reaching Silverchair.
**Impact:** Directly affects batch-run resilience.
**Risk:** Medium.
**Future Impact:** Establishes the general "isolate failures per-article, don't block the batch" principle used throughout the error-handling design (see Risk Register).
**Business Confirmation Required:** Yes.

---

### ADR-010 — `manifest.xml` `item-description` Generation Format
**Background:** All 3 samples show a broken, naive field-concatenation-then-truncation pattern for file-item descriptions (classified as a defect, not a rule — see Business Rule Book BR-084).
**Decision Required:** What is the correct, clean description format to generate instead?
**Options Considered:** (1) `"<category> — <original filename>"`. (2) `"<category> — <original filename> (<size> bytes)"`. (3) `"<category> — <original filename>, submitted <round>"`.
**Recommended Decision:** Option 2 — includes a useful integrity cross-check value (file size) without fabricating information not present in source.
**Reasoning:** All three candidate fields (category, filename, size) are already reliably available from custom-meta; no invented content required.
**Impact:** Cosmetic/informational only — does not affect package validity, but affects human-reviewer usability of the manifest.
**Risk:** Low.
**Future Impact:** None.
**Business Confirmation Required:** Yes (low urgency, easy default).

---

### ADR-011 — `manifest.xml` `item/@id` Generation Scheme
**Background:** Observed id values follow no discoverable deterministic formula (gaps, string-concatenation artifacts) — classified as a clerical mistake in the hand-built samples, not a pattern to replicate.
**Decision Required:** What clean, deterministic id scheme should the converter use?
**Options Considered:** (1) Flat `file-1`, `file-2`, ... across the whole document in final listed order. (2) `file-<round>-<sequence>` (round-qualified, e.g. `file-R1-1`, `file-Original-1`). (3) UUID-based ids (matches the Kriyadocs internal-id style used elsewhere).
**Recommended Decision:** Option 1 for simplicity and MECA-manifest-convention familiarity, unless the destination system specifically needs round-traceable ids (Option 2).
**Reasoning:** Simplicity reduces implementation risk; nothing in the DTD or samples requires round-encoding in the id itself (round is already expressed via the `xlink:href` path).
**Impact:** Internal identifier only — no observed external system depends on the exact id string, but this should be confirmed, not assumed.
**Risk:** Low.
**Future Impact:** None.
**Business Confirmation Required:** Yes (low urgency, easy default).

---

### ADR-012 — `xlink:href` Escaping for Filenames with Spaces/Special Characters
**Background:** All 3 samples embed raw (non-percent-encoded) filenames with literal spaces directly in `xlink:href` values (e.g. `files/R1/Figure 1.jpg`).
**Decision Required:** Is this MECA/XML-spec-correct, or should hrefs be percent-encoded?
**Options Considered:** (1) Keep raw/unescaped (matches samples). (2) Percent-encode per URI spec. (3) Percent-encode only characters that are strictly illegal in XML attribute values (quotes, `<`, `>`, `&`), leaving spaces raw.
**Recommended Decision:** Option 1, matching all 3 samples, unless Silverchair's MECA ingestion is confirmed to require percent-encoding.
**Reasoning:** Changing an established, universally-consistent pattern without evidence of a real downstream problem risks introducing a *new* defect where none was reported.
**Impact:** Affects every filename with a space or special character — the majority of files in these samples.
**Risk:** Medium (if the destination system actually requires encoding and rejects raw spaces, this becomes a systemic failure).
**Future Impact:** None beyond initial confirmation.
**Business Confirmation Required:** Yes.

---

### ADR-013 — Multi-Round Generalization Beyond R1
**Background:** All 3 samples have exactly 2 rounds (Original, R1). No sample demonstrates 3+ rounds.
**Decision Required:** Confirm the round-ordering/collision rules (§Multi-Round in Business Rule Book) generalize correctly to R2, R3, etc.
**Options Considered:** (1) Assume generalization holds (rules are expressed generically, not hard-coded to 2 rounds). (2) Require a 4th real sample with 3+ rounds before sign-off. (3) Implement generically now, validate against a synthetic/manufactured 3-round test fixture (see Test Specification) as an interim substitute for real evidence.
**Recommended Decision:** Option 3 — implement generically per the rules as written, and cover the gap with synthetic test fixtures rather than blocking on finding a real 3-round sample.
**Reasoning:** The underlying rules (vocab-identifier ordering, latest-round-wins for article.xml, all-rounds-listed for manifest.xml) are already expressed round-count-agnostically; the risk is in an implementation that accidentally hard-codes "2 rounds."
**Impact:** High — a large fraction of real production articles will have 0, 1, or 3+ rounds; this is not an edge case at scale.
**Risk:** Medium.
**Future Impact:** Establishes synthetic-fixture testing as mandatory practice wherever real sample coverage is thin (see Test Specification §Synthetic Fixtures).
**Business Confirmation Required:** Yes (confirm approach, not blocked on new samples).

---

### ADR-014 — Round Naming Convention Flexibility
**Background:** Samples use exactly `Original` and `R1`. No evidence for alternative conventions (`Revision 1`, `V2`, `Round2`, etc.) that other journals/workflows on the same source platform might use.
**Decision Required:** Should the converter hard-code recognition of `Original`/`R\d+`, or treat *any* folder name as a valid round label?
**Options Considered:** (1) Hard-code the two known patterns; reject anything else. (2) Treat any folder name under the article root as a round, generically. (3) Externally configurable regex/pattern list per journal.
**Recommended Decision:** Option 2 (fully generic) — the converter's round-handling logic never needs to know the label's exact spelling, only its files' custom-meta associations and its `vocab-identifier` ordering.
**Reasoning:** Matches the "custom-meta is authoritative, not the folder scan" philosophy already established (BR-011) — round *labels* should be equally schema-free.
**Impact:** Increases robustness across different journals/source configurations at negligible implementation cost.
**Risk:** Low.
**Future Impact:** Removes a class of future onboarding friction for new journals.
**Business Confirmation Required:** Yes (low urgency, low-risk default).

---

### ADR-015 — DOI Uniqueness Validation Scope
**Background:** DOI generation formula is confirmed (BR-058); uniqueness across a real production batch is untested (3 samples are 3 different articles, trivially unique).
**Decision Required:** At what scope must DOI uniqueness be validated — within a single run, within a journal's full corpus, or globally?
**Options Considered:** (1) Per-run only (fast, cheap, catches accidental duplicate-input-file bugs). (2) Per-journal, checked against a persistent registry/database of previously-issued DOIs. (3) Global, via a live CrossRef/DOI-registry lookup at packaging time.
**Recommended Decision:** Option 2 as the production baseline (a persistent per-journal DOI registry the converter checks/updates), with Option 3 as an optional pre-publication safety check, not a per-run blocker (external API dependency risk).
**Reasoning:** A silently-generated duplicate DOI is a serious, hard-to-detect-after-the-fact publishing error; per-run-only checking (Option 1) would miss a duplicate against an article processed in a previous run.
**Impact:** Requires a new persistent-state component (DOI registry) not otherwise needed by the converter.
**Risk:** High if omitted — duplicate DOI is a severe, publicly-visible publishing defect.
**Future Impact:** Establishes the need for a shared, durable metadata store across runs — informs the "Metadata Extractor"/"Configuration Manager" module design (see System Module Breakdown).
**Business Confirmation Required:** Yes.

---

### ADR-016 — Unreferenced Physical File Handling
**Background:** Files present in the input folder but not referenced by any custom-meta entry are excluded from output (BR-011); whether this should also be *logged* for operator review is unconfirmed (BR-025).
**Decision Required:** Silent exclusion, or exclusion + mandatory log entry, or exclusion + quarantine copy for manual inspection?
**Options Considered:** (1) Silent exclusion (matches literal sample behavior — no log artifact exists in the samples to check against, since samples are final packages, not run logs). (2) Exclusion + WARN-level log line per unmatched file. (3) Exclusion + WARN log + copy the unmatched file to a `_quarantine/` review area outside the package.
**Recommended Decision:** Option 2 as baseline, Option 3 if operational teams want a physical review trail without needing to re-open the original input.
**Reasoning:** A source-system tagging bug (a real submission file the system forgot to associate with custom-meta) would otherwise cause silent, permanent data loss with no operational visibility.
**Impact:** Purely operational/logging; no effect on package content.
**Risk:** Low (but the *absence* of this logging is a real operational risk at scale).
**Future Impact:** Feeds the Reporting Engine module (see System Module Breakdown).
**Business Confirmation Required:** Yes (low urgency, safe default).

---

### ADR-017 — Package Atomicity / Partial-Failure Handling
**Background:** No sample demonstrates a partially-generated package; this is a new enterprise concern (BR-160), not sample-derived.
**Decision Required:** If generation of one of the 5 XML files fails mid-article, what happens to the other 4 already-generated files and the physical file copies?
**Options Considered:** (1) All-or-nothing per article: stage all outputs in a temp location, only move/publish the complete set on full success. (2) Best-effort partial publish with an explicit `INCOMPLETE` marker file. (3) Retry the whole article from scratch on any failure, never leaving partial output visible.
**Recommended Decision:** Option 1 (atomic staged-then-published pattern) combined with Option 3's retry-from-scratch semantics on failure.
**Reasoning:** A partially-generated MECA package (e.g. manifest.xml present, reviews.xml missing) is worse than no package at all — it could be mistakenly ingested downstream as complete.
**Impact:** Core to the Packaging Layer and restart/recovery design.
**Risk:** High if not addressed — silent partial packages are a severe data-integrity risk at scale.
**Future Impact:** Directly shapes the Package Builder and Retry Manager module designs (see System Module Breakdown) and the restartability strategy (ADR-022).
**Business Confirmation Required:** Yes.

---

### ADR-018 — Metadata Source Strategy: File-Based vs. Database/API-Based
**Background:** Current samples derive 100% of metadata from one Kriyadocs XML file per article. The stated production direction is that "much of the metadata will eventually come from a backend database or service."
**Decision Required:** Should the engine be built now with a hard dependency on the Kriyadocs XML file format, or with a pluggable metadata-source abstraction from day one?
**Options Considered:** (1) Build tightly against the XML format now, refactor later when the DB/API materializes. (2) Build a metadata-source abstraction (interface) now, with the XML parser as the only concrete implementation initially, so a future DB/API-backed implementation is a drop-in addition. (3) Hybrid — read journal-level constants (DOI prefix, destination provider, acronym, media-type table — the fields identified in the Functional Spec's "likely DB-sourced" table) from configuration/DB now, while article-specific content stays file-derived.
**Recommended Decision:** Option 3 immediately, with Option 2's abstraction boundary drawn around it so article-specific extraction can also migrate later without a rewrite.
**Reasoning:** The Functional Specification already identified which fields are naturally journal/publisher-level constants (candidates for DB/config) vs. article-specific content (naturally file-derived, since it's author-supplied and round-specific) — building that boundary in now avoids a costly re-architecture later.
**Impact:** Shapes the Configuration Manager and Metadata Extractor module boundary from the start.
**Risk:** Medium if skipped now (expensive later refactor); low if addressed now.
**Future Impact:** This is the single most consequential up-front architectural decision for long-term maintainability of the product.
**Business Confirmation Required:** Yes.

---

### ADR-019 — Input Acquisition Model: S3 Event-Driven vs. Batch-Pull
**Background:** Production input arrives via Amazon S3; volume is 6,000–10,000+ articles per run.
**Decision Required:** Should the engine react to S3 events (per-object-upload trigger) or run as a scheduled/on-demand batch job that lists and pulls a defined set of S3 prefixes/keys?
**Options Considered:** (1) Event-driven (S3 event → queue → worker per article) — naturally incremental, good for continuous ingestion. (2) Scheduled batch-pull (list bucket/prefix, process everything found) — simpler operationally, natural fit for "runs" as described. (3) Hybrid — batch-pull for the described 6,000–10,000-article "runs," with an event-driven path available for future incremental/single-article reprocessing.
**Recommended Decision:** Option 3.
**Reasoning:** The stated volume/shape ("6,000–10,000+ articles per production run") describes a batch job, not continuous trickle ingestion, but an event-driven path is cheap to add and valuable for later single-article reprocessing/hotfix scenarios.
**Impact:** Shapes the Input Reader module and the overall orchestration model.
**Risk:** Medium — wrong choice here affects the whole system's operational model.
**Future Impact:** Determines whether a message queue (SQS or similar) is a required component.
**Business Confirmation Required:** Yes.

---

### ADR-020 — Working-Folder / Local Staging Strategy
**Background:** Processing 6,000–10,000+ articles, each with binary attachments up to tens of MB, requires a defined local/ephemeral staging strategy — not evidenced by the samples (which are 3 already-unzipped folders).
**Decision Required:** Does each worker stage a full article (input + generated output) on local/ephemeral disk, or stream directly S3-to-S3 without ever fully materializing on local disk?
**Options Considered:** (1) Full local staging per article (simplest to implement and debug; requires adequate ephemeral storage per worker). (2) Streaming, minimal local footprint (more complex, lower resource requirement per worker, harder to debug). (3) Hybrid — small/medium articles staged fully, oversized articles (large supplementary datasets) handled via streaming.
**Recommended Decision:** Option 1 for the initial build, revisited only if actual article sizes at scale prove staging infeasible.
**Reasoning:** Simplicity and debuggability matter enormously for an initial enterprise build; article sizes observed in samples (largest supplementary file ~22MB) are not so large that full staging is impractical.
**Impact:** Shapes worker resource sizing and the Input Reader/Output Writer modules.
**Risk:** Low initially; could become Medium if a future journal submits unusually large datasets (e.g. raw sequencing data in the hundreds of MB–GB range, foreshadowed by the RNA-seq `.xlsx` file already seen in pkg3).
**Future Impact:** May need revisiting per ADR-020-A when true "big data" supplements appear.
**Business Confirmation Required:** Yes.

---

### ADR-021 — Concurrency / Parallel Processing Model
**Background:** 6,000–10,000+ articles per run; each article's conversion is independent of every other article (no cross-article dependency observed or expected).
**Decision Required:** What is the unit and mechanism of parallelism?
**Options Considered:** (1) Per-article parallelism only (each article is a fully independent unit of work, trivially parallelizable across worker processes/containers). (2) Per-article + per-XML-generator parallelism (the 5 output XML generators for one article could run concurrently against the same parsed internal model). (3) Single-threaded, sequential processing (simplest, but too slow at target scale).
**Recommended Decision:** Option 1 as the primary parallelism axis (scale out by adding workers, one article per worker task), Option 2 as a secondary, optional optimization once per-article latency is profiled.
**Reasoning:** Per-article parallelism has zero shared-state/coordination complexity (each article's generation is fully independent), making it both the simplest and the highest-leverage scaling mechanism.
**Impact:** Shapes the entire orchestration/worker-pool architecture.
**Risk:** Low.
**Future Impact:** Establishes the article as the fundamental unit of work throughout monitoring, retry, and checkpointing design.
**Business Confirmation Required:** No (low-risk, industry-standard default) — informational, flagged for awareness rather than approval-gating.

---

### ADR-022 — Restartability / Checkpointing Strategy
**Background:** Stated requirement: "restartable processing." A 6,000–10,000-article run must be resumable after a partial failure (process crash, infrastructure interruption) without reprocessing already-completed articles or double-publishing partial ones.
**Decision Required:** What is the checkpoint granularity and storage mechanism?
**Options Considered:** (1) Per-article checkpoint (a durable record of "article X: not-started / in-progress / complete / failed") in a database/table, consulted on every run start to skip already-complete articles. (2) Rely on S3 output-existence as the sole "already done" signal (no separate checkpoint store). (3) Per-article checkpoint plus per-stage checkpoint (track progress *within* an article's 5-XML-generation pipeline, enabling resume mid-article, not just skip-whole-article).
**Recommended Decision:** Option 1 as the baseline (per-article checkpoint store), with Option 3's finer granularity reserved for articles whose processing time/cost is unusually high (unlikely at this content size, but keep the design open to it).
**Reasoning:** Combined with ADR-017's atomic-publish decision, "complete" always means "the full 5-XML package was atomically published" — so per-article granularity is sufficient; there's no partial-article state to resume into, since ADR-017 guarantees an article never stops half-published.
**Impact:** Core to meeting the "restartable" requirement; without it a crash mid-run means reprocessing thousands of already-done articles.
**Risk:** High if omitted.
**Future Impact:** Directly informs the Retry Manager and Monitoring module designs.
**Business Confirmation Required:** Yes.

---

### ADR-023 — Retry Policy for Transient Failures
**Background:** At scale, transient failures (S3 throttling/network blips, momentary DB unavailability) are expected and must not be treated the same as permanent data-quality failures (a genuinely malformed source XML).
**Decision Required:** What is the retry policy — count, backoff, and the boundary between "retry automatically" vs. "fail and flag for human review"?
**Options Considered:** (1) Fixed retry count (e.g. 3 attempts) with exponential backoff for a defined set of transient error classes (network/S3/timeout), no retry for data-validation errors (retrying a malformed-XML failure will never succeed). (2) Unlimited retry with backoff cap, relying on operator intervention to stop a truly-stuck article. (3) No automatic retry — every failure surfaces immediately to a human queue.
**Recommended Decision:** Option 1.
**Reasoning:** Distinguishing transient-infrastructure failures (worth retrying) from permanent data-quality failures (retrying is pure wasted cost and delay) is the single highest-leverage reliability decision for a 6,000–10,000-article run.
**Impact:** Shapes the Retry Manager module and overall run-completion-time predictability.
**Risk:** Medium.
**Future Impact:** The transient-vs-permanent error taxonomy defined here is reused throughout the Error Handling design (see Risk Register and Test Specification).
**Business Confirmation Required:** Yes (confirm retry counts/thresholds specifically; the transient-vs-permanent principle itself is low-risk to adopt).

---

### ADR-024 — Validation Strictness Policy
**Background:** The Business Rule Book documents numerous validation rules of varying severity (from "package is unusable" to "cosmetically odd").
**Decision Required:** Should validation failures be uniformly fail-fast (reject the article entirely), or tiered (some failures block, some only warn and still produce output)?
**Options Considered:** (1) Uniform fail-fast — any validation rule violation blocks that article's output entirely. (2) Tiered severity (Critical/High/Medium/Low, matching the Business Rule Book's own priority field) — only Critical/High failures block output; Medium/Low failures produce output with a logged warning. (3) Fully configurable per-rule pass/warn/block behavior.
**Recommended Decision:** Option 2, using the Business Rule Book's existing priority classification as the severity tier directly (no need to invent a second taxonomy).
**Reasoning:** A uniform fail-fast policy (Option 1) would block valid, publishable articles over cosmetic issues (e.g. BOM presence, item-id numbering style) that have zero impact on package usability; full per-rule configurability (Option 3) is over-engineering for the current evidence base.
**Impact:** Directly shapes the Validation Engine module and what "success" means for a batch run.
**Risk:** Medium.
**Future Impact:** The Critical/High/Medium/Low taxonomy becomes a permanent, shared vocabulary across rules, validation, and reporting.
**Business Confirmation Required:** Yes.

---

### ADR-025 — DTD Validation Approach
**Background:** All 5 output XML types declare a DOCTYPE referencing an external DTD (JATS Publishing/Archiving, MECA Manifest/Reviews/Transfer v1.0). No sample output was observed being validated against an actual resolved DTD file — the DOCTYPEs are present but their system identifiers are relative/documentary (e.g. `./schema/manifest-1.0.dtd`), not fetched.
**Decision Required:** Should the converter perform real DTD-based validation (parse against the actual DTD grammar, requiring the DTD files to be vendored/available locally) or only structural/schema-shape validation (e.g. via an internal rule-based check equivalent to what the DTD would enforce)?
**Options Considered:** (1) Vendor the actual JATS/MECA DTD files and validate every generated XML against them at generation time (strongest correctness guarantee, adds a build/ops dependency on DTD file distribution). (2) Skip real DTD validation; rely entirely on the Business Rule Book's structural rules, implemented as code-level checks. (3) Vendor DTDs but only validate a sample of articles per run (spot-check) rather than every article, for performance.
**Recommended Decision:** Option 1 for `manifest.xml`/`reviews.xml`/`transfer.xml` (small, cheap to validate, and errors here are usually structural bugs worth catching every time); Option 2 acceptable for `raw.xml`/`article.xml` if full JATS DTD validation proves too slow at scale, backed by strong custom structural checks instead.
**Reasoning:** Real DTD validation is the strongest correctness guarantee available and directly prevents shipping structurally invalid XML (e.g. the pkg3 undeclared-`xlink`-namespace defect found in the samples) — but performance must be measured before committing to full JATS-DTD validation on every one of 10,000 articles.
**Impact:** Directly determines Validation Engine correctness guarantees and performance.
**Risk:** Medium (false confidence if skipped; performance risk if applied naively at full scale).
**Future Impact:** DTD files become a versioned dependency the deployment must manage.
**Business Confirmation Required:** Yes.

---

### ADR-026 — Logging & Audit Trail Standard
**Background:** No sample demonstrates a logging format — this is a new enterprise requirement.
**Decision Required:** What structured logging standard/format should the engine use, and what is the minimum required log content per article?
**Options Considered:** (1) Structured JSON logs (one line per event) with a fixed schema: `articleId`, `stage`, `ruleId` (referencing Business Rule Book IDs where applicable), `severity`, `message`, `timestamp`. (2) Free-text logs with grep-able conventions. (3) Structured JSON logs plus a separate, human-readable per-article summary report (see Reporting Engine).
**Recommended Decision:** Option 3.
**Reasoning:** Structured logs are required for machine-driven monitoring/alerting at scale; a human-readable per-article summary is required for the "any file physically present but unreferenced" style operator-facing warnings identified throughout the Business Rule Book (BR-025 etc.).
**Impact:** Shapes the Logging Framework and Reporting Engine modules.
**Risk:** Low.
**Future Impact:** Log schema becomes a contract other tooling (dashboards, alerting) will depend on — changing it later has a real cost.
**Business Confirmation Required:** Yes (confirm the schema fields specifically).

---

### ADR-027 — Configuration Management Approach
**Background:** Numerous constants identified throughout the Business Rule Book and ADRs above (DOI prefix, destination provider name, journal acronym, media-type table, license-text-per-license-type table, article-type mapping table) must not be hard-coded if the system is to serve multiple journals/publishers in the future.
**Decision Required:** Where does this configuration live, and how is it versioned/changed without a code deployment?
**Options Considered:** (1) A version-controlled configuration file (YAML/JSON) per journal/publisher, loaded at run start. (2) A database-backed configuration service, editable via an admin interface, no deployment needed for a config change. (3) Hybrid — version-controlled file as the source of truth (auditable, reviewable via normal code-review process), optionally synced into a fast-lookup cache/DB at runtime.
**Recommended Decision:** Option 3.
**Reasoning:** Version-controlled config gives auditability and review discipline appropriate for publishing-legal-sensitive values (license text, DOI prefixes); a runtime cache/DB avoids repeated file parsing at 10,000-article scale.
**Impact:** Directly shapes the Configuration Manager module.
**Risk:** Low.
**Future Impact:** This is the extension point every future journal onboarding will use — its design quality directly determines onboarding cost for journal #2, #3, etc.
**Business Confirmation Required:** Yes.

---

### ADR-028 — Multi-Tenancy / Multi-Journal / Multi-Publisher Support
**Background:** All 3 samples are the same journal and publisher. Several confirmed rules (BR-004, BR-059, BR-128, BR-134) are "constant" only because no second journal/publisher has been observed.
**Decision Required:** Should the engine be architected from the start to support multiple journals/publishers (config-driven per-tenant constants), or built single-tenant now with multi-tenancy deferred?
**Options Considered:** (1) Multi-tenant from day one — every "constant" identified in the Business Rule Book is actually a per-journal config lookup keyed by `journal-id`/publisher-id. (2) Single-tenant now (Clinical Science / Portland Press hard-coded), multi-tenant refactor later if/when a second journal is onboarded. (3) Multi-tenant data model, single-tenant config populated initially (structurally ready, operationally simple until needed).
**Recommended Decision:** Option 3 — directly consistent with ADR-018 and ADR-027's config-driven approach; costs little extra now and avoids a costly later refactor.
**Reasoning:** Every "constant" already flagged in the Business Rule Book (BR-004, BR-059, BR-128, BR-134, and the acronym question in ADR-007) is exactly the set of values a second journal/publisher would need to differ on — the abstraction boundary is already implied by the evidence, so it should be built now rather than retrofitted.
**Impact:** Shapes the overall data model and Configuration Manager module.
**Risk:** Low if adopted now; Medium-High cost if deferred and later required urgently.
**Future Impact:** Directly determines the cost of onboarding journal #2.
**Business Confirmation Required:** Yes (confirm whether multi-journal support is actually on the roadmap — if Clinical Science is the only journal this product will ever process, Option 2 is simpler and this ADR can be closed as "not needed").

---

### ADR-029 — Output Storage & Archival Strategy
**Background:** Not evidenced by samples (which are simply zip files on local disk); production output destination is unspecified beyond "eventually to Silverchair via transfer.xml's processing instructions."
**Decision Required:** Where do generated MECA package zips land — a dedicated S3 output bucket/prefix, direct handoff to Silverchair, or both? What is the retention/archival policy?
**Options Considered:** (1) Write to a dedicated S3 output bucket/prefix per run, with a separate downstream handoff process (out of this system's scope) picking them up for actual transfer to Silverchair. (2) This engine directly performs the transfer to Silverchair (would require Silverchair-side integration/credentials, expanding scope significantly). (3) Write to S3 output bucket AND retain a long-term archival copy (glacier/cold storage) independent of the operational output location, for audit/dispute purposes.
**Recommended Decision:** Option 3, with Option 1's operational output as the "hot" path and archival as append-only, immutable, long-retention storage.
**Reasoning:** Given this is described as a long-term enterprise product, an immutable audit trail of every generated package (for dispute resolution, reprocessing, and compliance) is standard practice and cheap relative to the cost of not having it when needed.
**Impact:** Shapes the Output Writer module and overall storage cost model.
**Risk:** Low.
**Future Impact:** Archival retention policy (how long, what storage class) needs a business/legal answer, not just a technical one.
**Business Confirmation Required:** Yes.

---

### ADR-030 — Monitoring & Alerting Strategy
**Background:** New enterprise requirement, not sample-derived.
**Decision Required:** What operational metrics/alerts are required for a production run of this scale?
**Options Considered:** (1) Minimal: run-level success/failure counts, surfaced via existing infrastructure monitoring (e.g. CloudWatch). (2) Rich: per-article-level dashboards (success/failure/retry counts by error category, by journal, by rule-violation type), with alerting thresholds (e.g. "batch failure rate > X% triggers page"). (3) Rich dashboards plus automated business-rule-violation trend reporting (e.g. "unmapped file extensions are trending up — config update needed").
**Recommended Decision:** Option 2 as the production baseline, Option 3 as a valuable second-phase enhancement.
**Reasoning:** At 6,000–10,000+ articles/run, per-article visibility (which articles failed, why, and whether it's a transient or data-quality issue) is operationally essential — minimal run-level counts alone would make troubleshooting a specific stuck article impractical.
**Impact:** Shapes the Monitoring module and operational runbook.
**Risk:** Low.
**Future Impact:** Directly informs on-call/support processes once in production.
**Business Confirmation Required:** Yes (confirm alerting thresholds/ownership specifically).

---

### ADR-031 — General Policy: Never Replicate an Observed Defect
**Background:** Multiple confirmed defects were found in the hand-built sample packages themselves (broken manifest ids/descriptions, pkg1's illegal `review-type="CDATA"`, pkg3's missing `xmlns:xlink`, BOM inconsistency) — see Business Rule Book's human-mistakes callouts.
**Decision Required:** Establish, once, a standing project policy for how the converter should treat any future-discovered sample defect, rather than re-litigating this question rule-by-rule.
**Options Considered:** (1) Byte-for-byte replicate the samples exactly, defects included, on the theory that "the manual packages are the gold standard, full stop." (2) Always generate clean/correct output per the *intended* rule, treating sample defects as bugs in the reference material, not behavior to preserve. (3) Configurable "strict replication mode" (for acceptance testing against the exact 3 samples) vs. "clean mode" (for production), defaulting to clean mode.
**Recommended Decision:** Option 3.
**Reasoning:** Preserves the ability to byte-for-byte diff the converter's output against the 3 known samples for acceptance testing (valuable, since it's the only ground truth available) while ensuring production output doesn't propagate known-bad patterns (invalid XML namespaces, broken ids) at scale.
**Impact:** This is a meta-decision that resolves ADR-010, ADR-011, and every other "replicate vs. fix" question in one policy, rather than needing separate sign-off each time.
**Risk:** Low.
**Future Impact:** Establishes the QA acceptance-testing strategy (diff against strict-mode output) alongside the production default (clean mode).
**Business Confirmation Required:** Yes — **recommend resolving this ADR first, as it determines the default answer to ADR-010, ADR-011, and similar questions.**

---

### ADR-032 — Warning-Based Filename Fallback ("Generate With Warnings")
**Background:** A prior specification audit (independent certification, `cs-2024-5238`) established that BR-013/016/017 and 11_LLD_02 §3.4 unambiguously treat a custom-meta entry's `path` field as "hint only, not authoritative" for filename identity — no existing Business Rule, ADR, HLD, or LLD authorizes deriving a filename from `path` when the entry's `name` field is absent. The engine's prior strict behavior (raise `FileReferenceMissingError`, abort the whole package) was confirmed **specification-correct**, not a bug. This ADR is a deliberate **product decision to extend that specification**, not a correction of it — the engine is asked to prioritize generating a complete package whenever reasonably possible, recording every such deviation as a structured, first-class warning rather than silently absorbing it.
**Decision Required:** Should the engine derive a missing filename from `declared_path_hint` and continue generation (with a mandatory warning), or continue to fail fast per the existing, confirmed-correct specification reading?
**Options Considered:** (1) Keep strict Fail-Fast behavior unconditionally (the specification-correct default established by the prior audit). (2) Always derive-and-warn, unconditionally, no way to restore strict behavior. (3) Configurable per-deployment: `allow_filename_fallback` feature flag, defaulting to lenient (derive-and-warn), with strict mode available as an explicit opt-out and zero code changes required to switch.
**Recommended Decision:** Option 3.
**Reasoning:** A hard product requirement ("generate whenever reasonably possible, never silently hide a data-quality issue") cannot be satisfied by option 1, and option 2 removes the ability to run in the strict, specification-literal mode acceptance testing and future audits may still need. Recovery is only ever attempted when it can succeed *safely* — an empty or unusable `declared_path_hint` (no path at all, or a path with no basename) still fails exactly as before, in every mode; the fallback narrows, rather than replaces, the conditions under which `FileReferenceMissingError` is raised. The original `FileEntry` the ICAM carries is never mutated — the derived filename is used solely for this generation run's `ResolvedFile`/output, so the fact that the name was originally missing is never lost, satisfying "never silently recover data."
**Impact:** New `WarningCategory`/`EngineWarning` types (`model/warnings.py`) and an `ArticleModel.warnings` field — the first diagnostic type in this codebase designed to survive from extraction all the way to a built `StagedPackage` (`PackageStatus.PASS_WITH_WARNINGS`). New `allow_filename_fallback` feature flag (`FeatureFlagsConfig`), read by `extraction`/`transform` code for the first time. Business Rule Book's BR-013/016 gain a cross-reference note pointing here — their own rule text is deliberately left unchanged, since they remain the correct description of default/strict behavior; this ADR documents the opt-in extension on top of them.
**Risk:** Medium. A derived filename is, by construction, never verified against the source's own intended name (which is unknown) — only against the physical file actually found at the declared path. Mitigated by: the mandatory, structured warning (never silent), the unchanged strict-mode escape hatch, and the fact that recovery only fires when a path is genuinely present and yields a real, on-disk file — an invalid/absent path still fails loudly in every mode.
**Future Impact:** Establishes the `EngineWarning`/`PackageStatus` model as the general mechanism for any future "recover safely, warn always" product decision (see the Fatal-vs-Warning classification table, `56_MILESTONE_10_WARNING_BASED_FALLBACK_IMPLEMENTATION_REPORT.md`) — not limited to this one filename case.
**Business Confirmation Required:** Yes — this ADR changes production behavior's default (lenient-by-default is a real product-risk decision, distinct from the purely technical question of whether the mechanism is implemented correctly).

---

## ADR Summary Table

| ADR | Title | Priority | Confirmation Required |
|---|---|---|---|
| 001 | Article-type mapping | High | Yes |
| 002 | Non-CC-BY license text | Critical | Yes |
| 003 | Reviewer PDF: link vs package | Critical | Yes |
| 004 | Duplicate correspondence entries | Low | Yes |
| 005 | reviews.xml content depth scope | Medium | Yes |
| 006 | Transfer source contact name | Low | Yes |
| 007 | Transfer journal acronym | **Critical (top priority)** | Yes |
| 008 | Media-type mapping standard | Medium | Yes |
| 009 | Unmapped extension fallback | High | Yes |
| 010 | Manifest item-description format | Low | Yes |
| 011 | Manifest item-id scheme | Low | Yes |
| 012 | xlink:href escaping | Medium | Yes |
| 013 | Multi-round generalization | High | Yes |
| 014 | Round naming flexibility | Low | Yes |
| 015 | DOI uniqueness scope | Critical | Yes |
| 016 | Unreferenced file handling | Low | Yes |
| 017 | Package atomicity | Critical | Yes |
| 018 | Metadata source strategy (file vs DB) | Critical | Yes |
| 019 | S3 input model | High | Yes |
| 020 | Working-folder staging strategy | Medium | Yes |
| 021 | Concurrency model | Low | No (informational) |
| 022 | Restartability/checkpointing | Critical | Yes |
| 023 | Retry policy | High | Yes |
| 024 | Validation strictness policy | High | Yes |
| 025 | DTD validation approach | Medium | Yes |
| 026 | Logging standard | Medium | Yes |
| 027 | Configuration management | High | Yes |
| 028 | Multi-tenancy support | High | Yes |
| 029 | Output storage/archival | Medium | Yes |
| 030 | Monitoring/alerting | Medium | Yes |
| 031 | Defect-replication policy | **Critical (resolve first)** | Yes |
| 032 | Warning-based filename fallback (Generate With Warnings) | High | Yes |

**30 of 32 ADRs require explicit business confirmation before implementation begins.**
