# Low-Level Design — Part 6: Sequence Diagrams

Mermaid `sequenceDiagram` syntax (renders in GitHub, VSCode with a Mermaid extension, and any Mermaid-aware viewer). Diagrams trace the module interactions defined in Parts 1–4; no new behavior is introduced here beyond what those parts already specify.

---

## 14.1 Single Article — Happy Path

```mermaid
sequenceDiagram
    participant WP as WorkerPool
    participant AP as ArticlePipeline
    participant IR as input.staging
    participant TC as transform.coordinator
    participant EX as extraction.*
    participant GEN as generators.*
    participant DOI as registry.DoiRegistry
    participant VAL as validation.ValidationEngine
    participant PKG as packaging.PackageBuilder
    participant OUT as output.Writer
    participant CKP as checkpoint.CheckpointStore

    WP->>AP: process(article_ref)
    AP->>CKP: transition(NOT_STARTED -> STAGING)
    AP->>IR: stage(article_ref)
    IR-->>AP: StagedArticle
    AP->>CKP: transition(STAGING -> METADATA_LOADED)

    AP->>TC: build_model(staged_article)
    TC->>EX: parse / classify / resolve_rounds / resolve_files
    EX-->>TC: RawParsedDocument, CustomMetaStore, RoundIndex, ResolvedFileList
    TC-->>AP: ArticleModel (frozen)
    AP->>CKP: transition(METADATA_LOADED -> TRANSFORMED)

    AP->>GEN: raw_xml_generator.generate(model)
    GEN-->>AP: RawXmlDocument
    par concurrent generation
        AP->>GEN: article_xml_generator.generate(model, raw_doc)
        GEN->>DOI: reserve(candidate_doi, journal_id)
        DOI-->>GEN: RESERVED
        GEN-->>AP: ArticleXmlDocument
    and
        AP->>GEN: manifest_xml_generator.generate(model)
        GEN-->>AP: ManifestXmlDocument
    and
        AP->>GEN: reviews_xml_generator.generate(model)
        GEN-->>AP: ReviewsXmlDocument
    and
        AP->>GEN: transfer_xml_generator.generate(model)
        GEN-->>AP: TransferXmlDocument
    end
    AP->>CKP: transition(TRANSFORMED -> GENERATED)

    AP->>VAL: validate(all 5 documents, resolved_files)
    VAL-->>AP: ValidationReport (no Critical/High findings)
    AP->>CKP: transition(GENERATED -> VALIDATED)

    AP->>PKG: build(documents, resolved_files)
    PKG-->>AP: StagedPackage
    AP->>CKP: transition(VALIDATED -> PACKAGED)

    AP->>OUT: publish(staged_package)
    OUT-->>AP: PublishResult (operational + archival OK)
    AP->>CKP: transition(PACKAGED -> COMPLETE)

    AP-->>WP: ArticleOutcome(SUCCESS)
```

---

## 14.2 Batch Processing

```mermaid
sequenceDiagram
    participant OP as Operator
    participant RC as RunController
    participant S3 as input.s3_client
    participant CKP as checkpoint.CheckpointStore
    participant WP as WorkerPool
    participant AP as ArticlePipeline (xN, one per article)
    participant REP as reporting.ReportBuilder

    OP->>RC: run(batch_spec)
    RC->>S3: list(batch_spec.prefix)
    S3-->>RC: [article_ref_1 .. article_ref_N]
    RC->>CKP: get_state(each article_ref)
    CKP-->>RC: states (some COMPLETE, most NOT_STARTED)
    RC->>RC: filter out COMPLETE article_refs
    RC->>WP: submit(remaining article_refs)

    par N articles processed concurrently (bounded by worker_count)
        WP->>AP: process(article_ref_i)
        AP-->>WP: ArticleOutcome_i
    end

    WP-->>RC: stream of ArticleOutcome (as each completes)
    RC->>REP: record(outcome) for each
    RC->>REP: finalize(all outcomes)
    REP-->>RC: RunSummary
    RC-->>OP: RunSummary (success/failure/warning counts)
```

---

## 14.3 Error Recovery — Transient Failure With Successful Retry, Then a Permanent Failure Escalation

```mermaid
sequenceDiagram
    participant AP as ArticlePipeline
    participant OUT as output.Writer
    participant RT as retry.decorators
    participant RCV as recovery.RecoveryPolicy
    participant CKP as checkpoint.CheckpointStore
    participant HRQ as Human Review Queue

    Note over AP,OUT: --- Scenario A: transient failure, auto-recovered ---
    AP->>OUT: publish(staged_package)
    OUT-->>RT: raises S3WriteTransientError
    RT->>RT: classify -> retryable
    RT->>RT: backoff (attempt 1)
    RT->>OUT: publish(staged_package) [retry]
    OUT-->>RT: success
    RT-->>AP: PublishResult (OK, after 1 retry)
    AP->>CKP: transition(... -> COMPLETE)

    Note over AP,HRQ: --- Scenario B: same article, a different failure, non-retryable ---
    AP->>OUT: publish(staged_package) [different article]
    OUT-->>RT: raises FileReferenceMissingError (surfaced earlier, at extraction, illustrative here)
    RT->>RT: classify -> non-retryable
    RT-->>RCV: ClassifiedFailure(non-retryable)
    RCV->>CKP: transition(... -> FAILED)
    RCV->>HRQ: enqueue(article_id, failure_detail)
    RCV-->>AP: RecoveryAction.NO_RETRY
    AP-->>AP: (this article ends here; batch continues with other articles per WorkerPool isolation)
```

---

## 14.4 Restart Processing — Batch Killed Mid-Run, Then Resumed

```mermaid
sequenceDiagram
    participant OP as Operator
    participant RC as RunController
    participant CKP as checkpoint.CheckpointStore
    participant WP as WorkerPool
    participant AP as ArticlePipeline

    Note over OP,AP: --- Original run: process crashes at ~50% completion ---
    OP->>RC: run(batch_spec)
    RC->>WP: submit(10000 article_refs)
    WP->>AP: process(article_ref_1..5000, various in-flight)
    Note over AP,CKP: Each article's checkpoint reflects its true last-completed stage
    Note over RC,WP: *** process killed (crash / infra interruption) ***

    Note over OP,AP: --- Operator restarts the run ---
    OP->>RC: run(batch_spec)  %% same batch_spec, same article set
    RC->>CKP: get_state(each of the 10000 article_refs)
    CKP-->>RC: states: ~5000 COMPLETE, ~4995 NOT_STARTED, ~5 IN_PROGRESS at various stages
    RC->>RC: skip all COMPLETE (per ADR-022 — never reprocessed)
    RC->>RC: for IN_PROGRESS articles: treat as NOT_STARTED (ADR-017 atomicity — restart from stage 1, never resume mid-stage)
    RC->>WP: submit(~5000 remaining article_refs)
    WP->>AP: process(each remaining article_ref, from stage 1)
    AP-->>WP: ArticleOutcome (SUCCESS, for each)
    WP-->>RC: full stream of outcomes
    RC-->>OP: RunSummary (0 articles reprocessed unnecessarily, ~5000 completed on this resumed run)
```

**Design note reflected in 14.4:** per ADR-017 (package atomicity) and the discussion in Part 4 §9.5, an `IN_PROGRESS` article on restart is **always redone from the beginning**, never resumed mid-stage — this is a deliberate simplicity choice: since no partial package can ever have been published (ADR-017), the only cost of restarting-from-scratch is re-doing already-cheap, already-idempotent extraction/generation work, which is far simpler and safer than trying to resume a partially-built in-memory `ArticleModel` across a process restart.
