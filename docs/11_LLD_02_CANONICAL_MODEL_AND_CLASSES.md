# Low-Level Design — Part 2: Internal Canonical Article Model (ICAM) & Class Design

No production code below — interface *signatures* (names, types, no bodies) and field/relationship descriptions only.

---

## 3. Internal Canonical Article Model (ICAM)

### 3.1 Design Principle

**The ICAM is the only object any generator (`raw_xml`, `article_xml`, `manifest_xml`, `reviews_xml`, `transfer_xml`) is permitted to read.** No generator ever touches the staged Kriyadocs XML, a file path string, or the S3 client directly. This is enforced structurally by the import-direction rules in Part 1 (§2.3) — the `generators.*` packages have no import path to `extraction.kriyadocs_parser` at all, so violating this rule is a compile-time/lint-time failure, not just a convention.

The ICAM is built incrementally across pipeline stages 2–4 (Metadata Loading → Pre-Validation → Transformation, per `06_DATA_FLOW_DOCUMENT.md`) using a **builder pattern**, then **frozen** before stage 5 (XML Generation) begins. Freezing is the mechanism that makes the "manifest/reviews/transfer generators run concurrently" design in the Data Flow Document safe: once frozen, no generator can mutate shared state a sibling generator concurrently depends on.

### 3.2 Object Graph

```
ArticleModel  (root, frozen after Transformation stage)
│
├── identity: ArticleIdentity                  [immutable from extraction]
│     article_id: str                          # exact input-folder string (BR-003)
│     publisher_id_value: str                  # verbatim article-id[@pub-id-type=publisher-id] (BR-080/136)
│     doi_article_id_value: str                # verbatim article-id[@pub-id-type=doi] (BR-058 input)
│     journal_id: str                          # config lookup key (ADR-028)
│     source_object_key: str                   # S3 key of the root XML, for traceability/logging
│
├── journal_meta: JournalMeta                   [immutable, copied verbatim]
│     journal_title, issn_ppub, issn_epub, publisher_name,
│     abbrev_titles: dict[str, str]             # keyed by abbrev-type
│
├── article_meta: ArticleMeta                   [immutable, copied/derived]
│     display_channel_subject: str              # e.g. "Review Article" — INPUT to article-type mapping, BR unchanged
│     heading_subjects: tuple[str, ...]
│     article_title: str
│     contributors: ContributorList             # see §3.3
│     affiliations: AffiliationList             # see §3.3
│     corresponding_emails: tuple[CorrespEmail, ...]   # ordered; index 0 = primary (BR-130 resolution rule)
│     copyright_statement: str                  # verbatim, wording NOT normalized (BR-045/062)
│     copyright_year: str
│     funding: FundingList
│     keywords: tuple[str, ...]
│     counts: ArticleCounts                     # word_count, ref_count, fig_count
│     history_dates: HistoryDates               # received / revision / accepted (Optional[date] each)
│
├── body_fragment: BodyFragment                 [immutable, opaque passthrough]
│     raw_xml_fragment: str                     # the <body> subtree, copied verbatim byte-for-byte
│     # deliberately NOT decomposed further — raw.xml copies it verbatim (BR-043) and article.xml
│     # never includes it at all (BR-072); no generator needs structured access to its internals.
│
├── custom_meta: CustomMetaStore                 [immutable after classification, §3.4]
│
├── rounds: RoundIndex                           [immutable after round-resolution, §3.5]
│
└── resolved_files: ResolvedFileList              [immutable after File Resolver runs, §3.6]
```

### 3.3 Contributor / Affiliation Relationship

`Contributor` and `Affiliation` are linked **structurally, not by source `id` attribute** — this deliberately matches TC-060/070's finding that article.xml (with all ids stripped) must still represent author↔affiliation linkage correctly. The ICAM assigns its own stable, model-internal integer keys at build time; these keys never appear in any output XML, they exist only to let a generator correctly regroup/reorder contributors and affiliations without needing the source UUIDs.

```
ContributorList: tuple[Contributor, ...]           # ordered — author display order preserved
Contributor:
    surname: str
    given_names: str
    email: Optional[str]
    orcid: Optional[str]                            # value only; no source id (BR-075 field vs. element-id distinction)
    contrib_type: ContribType                        # enum: AUTHOR (contrib-group here is always authors)
    affiliation_keys: tuple[int, ...]                # model-internal keys into AffiliationList
    is_corresponding: bool

AffiliationList: tuple[Affiliation, ...]
Affiliation:
    model_key: int                                    # stable within this ArticleModel instance only
    institution: str
    country: Optional[str]

CorrespEmail:
    email: str
    display_text: Optional[str]                       # e.g. trailing "Changchun, China" seen in samples
```

### 3.4 CustomMetaStore — the Audit-Trail-of-Record

This is the richest part of the ICAM, directly mirroring the Business Rule Book's §A–J classification. It is built once by `extraction.custom_meta_classifier` and never re-derived downstream.

```
CustomMetaStore:
    form_answers: FormAnswerBag                       # open-vocabulary key → tuple[str, ...] (multi-value keys, e.g. "Authorship" x4)
    file_entries: tuple[FileEntry, ...]                # every file-category custom-meta record, ALL rounds
    reviewer_scorecards: tuple[ReviewerScorecard, ...] # QN_* answer sets, grouped per reviewer-assignment event
    decision_drafts: tuple[DecisionDraft, ...]         # one per round's editorial decision text
    decline_reasons: tuple[DeclineReason, ...]
    workflow_log: WorkflowLog                          # see below — feeds reviews.xml exclusively

FileEntry:
    round_label: str                                    # e.g. "Original", "R1" — opaque string (ADR-014: generic)
    category: str                                        # open vocabulary: "manuscript","figure","tables",... (BR-019)
    original_filename: str
    declared_path_hint: str                              # source `path` field — hint only, not authoritative (BR-016/017)
    declared_size_bytes: Optional[int]

ReviewerScorecard:
    round_label: str
    reviewer_name: str
    reviewer_email: str
    answers: dict[str, str]                               # "QN_01" -> "No", etc. — open-ended, prefix-matched (BR-075)
    overall_recommendation: Optional[str]
    outcome_status: ReviewOutcomeStatus                    # enum: COMPLETED, DECLINED, TERMINATED, PENDING

DecisionDraft:
    round_label: str
    decision_text: str
    editor_name: Optional[str]
    associate_editor_name: Optional[str]
    decision_date: Optional[date]

WorkflowLog:
    events: tuple[CorrespondenceEvent, ...]                 # ordered chronologically
CorrespondenceEvent:
    round_label: Optional[str]
    timestamp: datetime
    actor_name: str
    actor_role: ActorRole                                     # enum: REVIEWER, EDITOR, ASSOCIATE_EDITOR, AUTHOR, PUBLISHER, COPYEDITOR, PREEDITOR
    channel: CorrespondenceChannel                            # enum: TO_AUTHOR, TO_EDITOR_CONFIDENTIAL, INTERNAL
    text: str
    attachment_url: Optional[str]                             # e.g. the ppl.kriyadocs.com PDF link (ADR-003)
    event_kind: CorrespondenceKind                            # enum: REVIEW_COMMENT, SCREENING_QUERY, EDITOR_REASSIGNMENT,
                                                               #   AUTHOR_SUGGESTED_REVIEWER, PRODUCTION_QUERY (ADR-005 scope)
```

### 3.5 RoundIndex

```
RoundIndex: tuple[RoundInfo, ...]                # ordered by resolved sequence, ascending
RoundInfo:
    label: str                                    # generic string (ADR-014)
    sequence_number: int                          # from vocab-identifier "snapshots/<N>_..." (BR-010)
    is_latest: bool                               # true for exactly one RoundInfo
```

### 3.6 ResolvedFileList

Produced by the File Resolver from `custom_meta.file_entries` + the staged physical folder — this is the list every generator that touches files (`manifest_xml`, `packaging`) actually consumes; `custom_meta.file_entries` alone is not sufficient because it lacks the resolved physical path/media-type.

```
ResolvedFileList: tuple[ResolvedFile, ...]
ResolvedFile:
    round_label: str
    category: str
    original_filename: str
    staged_physical_path: str
    checksum: str                                   # computed at resolution time (BR-012 verification input)
    size_bytes: int                                  # actual, cross-checked against declared_size_bytes (BR-021)
    media_type: str                                   # resolved via config media-types.yaml at this stage
```

### 3.7 Immutability Policy

| Phase | Mutability |
|---|---|
| Extraction (`extraction.kriyadocs_parser`, `custom_meta_classifier`) | Builds `ArticleModel` incrementally via a `ArticleModelBuilder` — fields are write-once (set exactly one time, raise on a second write attempt) rather than freely mutable, catching extractor bugs early. |
| Round resolution (`extraction.round_resolver`) | Populates `rounds` on the builder. |
| File resolution (`extraction.file_resolver`) | Populates `resolved_files` on the builder. |
| Transformation (`transform.coordinator`) | Calls `builder.freeze() -> ArticleModel` — returns an immutable (frozen dataclass / `NamedTuple`-based) instance. From this point forward, **every field and every collection is immutable** — collections are `tuple`s, not `list`s, specifically so no generator can accidentally `.append()` into shared state. |
| Generation (all 5 generators, run possibly concurrently) | Read-only. No generator ever calls back into the builder. |
| Validation | Read-only, plus reads the generators' *output* documents (separate types, not part of ICAM). |

This "write-once during build, frozen thereafter" policy is the single most important correctness property in the whole engine: it is what makes RISK-017 (concurrency bugs) tractable for the ICAM specifically — a frozen object shared across concurrent readers has no possible race condition.

---

## 4. Class Design

Each entry: **Responsibilities · Public Interface · Internal Helpers · Dependencies · Lifecycle · Error Handling · Configuration Requirements.** Grouped by package from Part 1 §2.1.

### 4.1 `model.article.ArticleModelBuilder`
- **Responsibilities:** Accumulate extracted data into a not-yet-frozen `ArticleModel`; enforce write-once field semantics; produce the frozen instance.
- **Public Interface:** `set_identity(identity: ArticleIdentity) -> None`; `set_journal_meta(...)`; `set_article_meta(...)`; `set_body_fragment(...)`; `set_custom_meta(store: CustomMetaStore) -> None`; `set_rounds(index: RoundIndex) -> None`; `set_resolved_files(files: ResolvedFileList) -> None`; `freeze() -> ArticleModel`.
- **Internal Helpers:** `_assert_not_already_set(field_name: str) -> None`.
- **Dependencies:** None (foundation layer).
- **Lifecycle:** One instance per article, discarded after `freeze()`.
- **Error Handling:** Raises `ModelBuildError` (see Part 3) if `freeze()` is called before all required fields are set, or if a field is set twice.
- **Configuration Requirements:** None.

### 4.2 `extraction.kriyadocs_parser.KriyadocsParser`
- **Responsibilities:** Parse the staged root XML into raw JATS/custom-meta structures; the ONLY module permitted to know the Kriyadocs XML's tag shapes.
- **Public Interface:** `parse(staged_xml_path: str) -> RawParsedDocument` (an internal, extraction-only intermediate type — never exposed outside `extraction.*`).
- **Internal Helpers:** `_strip_internal_workflow_tags(...)`, `_extract_custom_meta_group(...)`.
- **Dependencies:** `exceptions.article_errors` (raises on malformed XML).
- **Lifecycle:** Stateless; one call per article.
- **Error Handling:** Any XML parse failure raises `SourceXmlMalformedError` (non-retryable, per Part 3).
- **Configuration Requirements:** None (source format is not configurable — it's a fixed platform contract).

### 4.3 `extraction.custom_meta_classifier.CustomMetaClassifier`
- **Responsibilities:** Classify every raw custom-meta node into the typed `CustomMetaStore` collections (§3.4); apply the `QN_` prefix-match rule (BR-075); build the `WorkflowLog` from correspondence-shaped nodes.
- **Public Interface:** `classify(raw: RawParsedDocument) -> CustomMetaStore`.
- **Internal Helpers:** `_is_file_entry(node) -> bool`; `_is_scorecard_key(meta_name: str) -> bool`; `_infer_correspondence_channel(node) -> CorrespondenceChannel`.
- **Dependencies:** `config.registry` (for the open-vocabulary category list used only for logging/telemetry, never to reject an unknown key — per BR-019).
- **Lifecycle:** Stateless; one call per article.
- **Error Handling:** An unclassifiable custom-meta node is logged as a warning and placed in `form_answers` under its raw key (never dropped silently) — matches the deny-list philosophy (BR-071).
- **Configuration Requirements:** Reads `feature-flags.yaml` for the ADR-005 extended-history scope toggle (determines whether `AUTHOR_SUGGESTED_REVIEWER`/`EDITOR_REASSIGNMENT`/`PRODUCTION_QUERY` event kinds are populated or skipped at classification time).

### 4.4 `extraction.round_resolver.RoundResolver`
- **Responsibilities:** Build the `RoundIndex` from `article-version/@vocab-identifier` values (BR-010); determine `is_latest`.
- **Public Interface:** `resolve(raw: RawParsedDocument) -> RoundIndex`.
- **Dependencies:** None beyond `model`.
- **Error Handling:** Ambiguous/missing sequence numbers raise `RoundResolutionError` (non-retryable) — per ADR-013, this must never silently guess.
- **Configuration Requirements:** None.

### 4.5 `extraction.file_resolver.FileResolver`
- **Responsibilities:** Resolve each `FileEntry` to a physical staged file; compute checksum/size; resolve `media_type` via config; log unmatched physical files (ADR-016).
- **Public Interface:** `resolve(file_entries: tuple[FileEntry, ...], staged_root: str, media_type_config: MediaTypeConfig) -> ResolvedFileList`.
- **Internal Helpers:** `_normalize_path_hint(hint: str) -> str` (BR-016 leading-slash tolerance); `_match_by_filename(entry, staged_root) -> str`.
- **Dependencies:** `config.schema.MediaTypeConfig`, `utils.hashing`.
- **Error Handling:** An entry with no matching physical file raises `FileReferenceMissingError` (non-retryable, per BR-011). An unmapped extension follows ADR-009's confirmed fallback (warn + `application/octet-stream`, or raise, per config).
- **Configuration Requirements:** `media-types.yaml`.

### 4.6 `transform.coordinator.TransformationCoordinator`
- **Responsibilities:** Orchestrate extraction stage calls in order, then `builder.freeze()`. The single place that knows the correct build order.
- **Public Interface:** `build_model(staged_article: StagedArticle, config: RunConfig) -> ArticleModel`.
- **Dependencies:** `extraction.*`, `model.article.ArticleModelBuilder`.
- **Error Handling:** Propagates typed errors from extraction stages unchanged (no re-wrapping — preserves the original error class for correct retry/permanent classification downstream).

### 4.7 Generators — Shared Base
**`generators.base.Generator[T]` (ABC)**
- **Responsibilities:** Define the one method every generator must implement; nothing else — deliberately minimal so generators share no behavior beyond a signature.
- **Public Interface:** `generate(model: ArticleModel, config: JournalConfig) -> T` (abstract), where `T` is the generator's specific output-document type.
- **Dependencies:** `model` only.
- **Lifecycle:** Stateless; instantiated once, reused across articles (thread/process-safe by construction — no mutable instance state, since `model` is frozen and `config` is read-only).

**`generators.raw_xml.generator.RawXmlGenerator(Generator[RawXmlDocument])`**
- **Responsibilities:** Emit BR-036–050 exactly — DOCTYPE, namespaces, id-preserving copy, unpruned custom-meta.
- **Internal Helpers:** `_render_pretty_printed(...)`.
- **Error Handling:** Should not raise under normal conditions (input is already-validated ICAM); a raise here indicates a Transformation-stage bug (`GeneratorInvariantError`, non-retryable, treated as a code defect not a data defect).
- **Configuration Requirements:** None (raw.xml has no configurable behavior — it's a pure structural reformat).

**`generators.article_xml.generator.ArticleXmlGenerator(Generator[ArticleXmlDocument])`**
- **Responsibilities:** Derive from the `RawXmlDocument`'s internal representation (not re-read the ICAM independently for JATS content — avoids drift between the two); strip ids; apply article-type mapping; call `doi_builder`/`license_builder`; apply custom-meta deny-list pruning (BR-066–071).
- **Internal Helpers:** `_prune_custom_meta(store: CustomMetaStore, latest_round: str) -> CustomMetaStore`.
- **Dependencies:** `generators.raw_xml` (consumes its output type, not its class — no import cycle, since `raw_xml` never imports `article_xml`), `generators.article_xml.doi_builder`, `.license_builder`, `registry.doi_registry`, `config`.
- **Error Handling:** Unmapped article-type with no default → `ArticleTypeMappingError` (non-retryable, per ADR-001). Unmapped License Type → `LicenseMappingError` (non-retryable, per ADR-002). DOI collision → `DoiCollisionError` (non-retryable, requires human review per ADR-015).
- **Configuration Requirements:** `article-type-mapping.yaml`, `license-templates.yaml`, journal's DOI prefix.

**`generators.article_xml.doi_builder.DoiBuilder`**
- **Responsibilities:** Implement BR-058's exact formula; nothing else.
- **Public Interface:** `build(doi_article_id_value: str, doi_prefix: str) -> str`.
- **Error Handling:** Malformed/empty `doi_article_id_value` → `MissingDoiError` (non-retryable, BR-049/050 test cases).

**`generators.manifest_xml.generator.ManifestXmlGenerator(Generator[ManifestXmlDocument])`**
- **Responsibilities:** 3 fixed items + one item per `ResolvedFile`, item-type via `item_type_mapper`, ordering per BR-083, clean id/description generation (ADR-010/011).
- **Dependencies:** `config` (item-type-mapping.yaml, media-types.yaml).
- **Error Handling:** Should not raise under normal conditions — any file-resolution problems were already caught upstream in `extraction.file_resolver`.

**`generators.reviews_xml.generator.ReviewsXmlGenerator(Generator[ReviewsXmlDocument])`**
- **Responsibilities:** The most complex generator — delegates to `review_builder` and `decision_builder`; applies ADR-004/005 feature-flag scoping.
- **Dependencies:** `generators.reviews_xml.review_builder`, `.decision_builder`, `config` (feature flags).
- **Error Handling:** A reviewer-scorecard record with internally inconsistent data (e.g. a recommendation but no reviewer identity) raises `ReviewDataIntegrityError` — non-retryable, flagged Medium severity per the Validation Engine's tiering, does not block the whole article unless configured to (ADR-024 severity policy applies here too).

**`generators.transfer_xml.generator.TransferXmlGenerator(Generator[TransferXmlDocument])`**
- **Responsibilities:** Emit BR-126–140 exactly, using config for provider names/acronym and the ICAM's primary corresponding email.
- **Dependencies:** `config` (publisher config, journal acronym per ADR-007's resolved answer).

### 4.8 `validation.engine.ValidationEngine`
- **Responsibilities:** Run every registered rule (from `validation.rules.*`) against the 5 generated documents + `ResolvedFileList`; aggregate a `ValidationReport`; apply severity tiering (ADR-024) to decide block-vs-warn.
- **Public Interface:** `validate(documents: GeneratedDocumentSet, resolved_files: ResolvedFileList) -> ValidationReport`.
- **Internal Helpers:** `_run_rule_category(category: RuleCategory, ...) -> tuple[RuleResult, ...]`.
- **Dependencies:** `validation.rules.*`, `validation.severity`, `schemas/dtd` (vendored DTD files, via a DTD-validation rule module).
- **Error Handling:** A rule implementation itself throwing an unexpected exception is caught and converted into a `RuleExecutionError` finding (Medium severity) rather than crashing the whole validation pass — one broken rule must never block validation of everything else.
- **Configuration Requirements:** `runtime.yaml` (severity thresholds, DTD-validation on/off per ADR-025).

### 4.9 `packaging.builder.PackageBuilder`
- **Responsibilities:** Stage `files/<Round>/...` + 5 XML files into a temp location; only move/publish to the final staged-complete state on full success (ADR-017).
- **Public Interface:** `build(documents: GeneratedDocumentSet, resolved_files: ResolvedFileList, staging_dir: str) -> StagedPackage`.
- **Error Handling:** Any I/O failure during assembly raises `PackageAssemblyError`; the staging directory is always cleaned up (success or failure), never left half-written at a path the Output Writer might mistake for complete.

### 4.10 `output.writer.OutputWriter`
- **Responsibilities:** Publish a `StagedPackage` to the operational S3 location and archival location; verify post-write checksum.
- **Public Interface:** `publish(package: StagedPackage, targets: OutputTargets) -> PublishResult`.
- **Dependencies:** `retry.decorators` (wraps every S3 write), `checkpoint.store` (records `COMPLETE` on success).
- **Error Handling:** Checksum mismatch post-write → `PostWriteIntegrityError` (transient — triggers a re-write, per TC-182).

### 4.11 `registry.doi_registry.DoiRegistry`
- **Responsibilities:** Atomic check-and-reserve of a candidate DOI, scoped per journal (ADR-015).
- **Public Interface:** `reserve(doi: str, journal_id: str) -> ReservationResult` (enum: `RESERVED` | `DUPLICATE`).
- **Dependencies:** A pluggable backend (`registry.backends.*` — e.g. Postgres unique-constraint-backed, or DynamoDB conditional-write-backed).
- **Error Handling:** Backend unavailability → transient, retried via `retry.decorators`; `DUPLICATE` result is not an error, it's a normal outcome the caller (`ArticleXmlGenerator`) must handle explicitly.

### 4.12 `checkpoint.store.CheckpointStore`
- **Responsibilities:** Atomic per-article state read/compare-and-set across the stage names enumerated in the Data Flow Document (`staging` → ... → `archived`).
- **Public Interface:** `get_state(article_id: str) -> ArticleState`; `transition(article_id: str, from_state: ArticleState, to_state: ArticleState) -> bool` (returns `False` on a failed compare-and-set, signaling a concurrent duplicate-dispatch attempt, per TC-183).
- **Dependencies:** A pluggable backend, same pattern as the DOI Registry.

### 4.13 `retry.decorators` (module-level functions, not classes)
- **Responsibilities:** `@with_retry(classifier: ErrorClassifier, policy: RetryPolicy)` — a decorator applied to any I/O-fallible function in `input`, `output`, `registry`, `checkpoint`.
- **Dependencies:** `retry.classifier`, `config` (runtime.yaml retry counts/backoff).

### 4.14 `recovery.policy.RecoveryPolicy`
- **Responsibilities:** Given a classified failure, decide: auto-retry (delegates to `retry`), route to human-review queue, or signal batch-pause (for systemic failures like a config error affecting every article).
- **Public Interface:** `handle(failure: ClassifiedFailure, context: ArticleContext) -> RecoveryAction`.
- **Dependencies:** `retry.classifier`, `checkpoint.store`, `monitoring.metrics`.

### 4.15 `orchestrator.run_controller.RunController`
- **Responsibilities:** Top-level entry point: enumerate the batch (via `input.s3_client`), consult `checkpoint.store` to skip completed articles, dispatch remaining articles to `worker_pool`, aggregate results for `reporting.report_builder`.
- **Public Interface:** `run(batch_spec: BatchSpec) -> RunSummary`.
- **Dependencies:** Every package (top of the layering — see Part 1 §2.3).

### 4.16 `orchestrator.article_pipeline.ArticlePipeline`
- **Responsibilities:** The single-article state machine — executes stages 1–9 from the Data Flow Document in order, updating the Checkpoint Store at each transition, invoking `recovery.policy` on any failure.
- **Public Interface:** `process(article_ref: ArticleRef) -> ArticleOutcome`.
- **Dependencies:** `input`, `transform`, `generators.*`, `validation`, `packaging`, `output`, `checkpoint`, `recovery`, `logging_`.
- **Lifecycle:** One instance per in-flight article (or stateless, re-entrant, called once per article by the worker pool — implementation detail left to the build phase, but must be safe under `worker_pool`'s concurrency model regardless of choice).

### 4.17 `orchestrator.worker_pool.WorkerPool`
- **Responsibilities:** Manage the concurrency mechanism (process pool / thread pool / async tasks — decided in Part 4, Scalability) executing `ArticlePipeline.process` across many articles per ADR-021's per-article parallelism model.
- **Public Interface:** `submit(article_refs: Iterable[ArticleRef], pipeline_factory: Callable[[], ArticlePipeline]) -> Iterator[ArticleOutcome]`.
- **Dependencies:** `orchestrator.article_pipeline`, `config` (concurrency level).
