# Package Assembly Sequence Diagram — Milestone 7

Matches the style of `15_LLD_06_SEQUENCE_DIAGRAMS.md`. Two diagrams:
the single-article happy path (this milestone's own scope), and the
failure/atomicity path.

## 1. Single-article happy path

```mermaid
sequenceDiagram
    participant Caller as PackageBatchRunner
    participant PB as PackageBuilder
    participant Gen as 5 Generators
    participant DR as document_reader
    participant DOI as DoiRegistry
    participant AC as AssetCopyService
    participant ZB as ZipBuilder
    participant FS as Filesystem

    Caller->>PB: build(context, output_root)
    PB->>Gen: raw_generator.generate(context)
    Gen-->>PB: GenerationResult[RawXmlDocument]
    PB->>Gen: article_generator.generate(context)
    Gen-->>PB: GenerationResult[ArticleXmlDocument]
    PB->>Gen: manifest_generator.generate(context)
    Gen-->>PB: GenerationResult[ManifestXmlDocument]
    PB->>Gen: reviews_generator.generate(context)
    Gen-->>PB: GenerationResult[ReviewsXmlDocument]
    PB->>Gen: transfer_generator.generate(context)
    Gen-->>PB: GenerationResult[TransferXmlDocument]

    opt business_rule_hooks configured
        PB->>PB: run each hook against each document's bytes
        PB->>Caller: log "validation summary"
    end

    PB->>DR: extract_packaged_file_hrefs(manifest.xml_bytes)
    DR-->>PB: ordered tuple of "files/..." hrefs
    PB->>PB: resolve each href -> ResolvedFile (via context.model.resolved_files)
    PB->>DR: extract_generated_doi(article.xml_bytes)
    DR-->>PB: doi

    opt doi_registry configured
        PB->>DOI: reserve(doi, article_id)
        DOI-->>PB: True
    end

    PB->>FS: mkdir .package-staging-<ArticleID>
    PB->>FS: write 5 XML files into staging dir
    PB->>AC: copy_all(packaged_files, staging_dir/files)
    loop each PackagedFile
        AC->>FS: stream-copy + checksum-verify
        AC->>Caller: log "asset copied"
    end
    AC-->>PB: AssetCopyReport

    PB->>ZB: build(staging_dir -> .MECA_<id>.zip.tmp)
    ZB->>FS: stream every file into the archive, sorted, fixed timestamp
    ZB-->>PB: (zip written)
    ZB->>Caller: log "zip completed"

    PB->>FS: os.replace(.zip.tmp -> MECA_<id>.zip)   [atomic]
    PB->>FS: rmtree(staging_dir)
    PB->>Caller: log "package complete" + elapsed time
    PB-->>Caller: StagedPackage
```

## 2. Failure / atomicity path (any step after generation)

```mermaid
sequenceDiagram
    participant Caller as PackageBatchRunner
    participant PB as PackageBuilder
    participant FS as Filesystem

    Caller->>PB: build(context, output_root)
    Note over PB: any step raises —<br/>generator failure, DOI collision,<br/>unresolvable href, copy failure,<br/>or zip-write failure
    PB->>PB: except BaseException
    PB->>FS: rmtree(.package-staging-<id>, ignore_errors=True)
    PB->>FS: unlink(.MECA_<id>.zip.tmp) if it exists
    PB->>Caller: log "package failed" + elapsed time
    PB-->>Caller: re-raise original exception unchanged
    Note over Caller: no MECA_<id>.zip,<br/>no staging dir,<br/>no .tmp file — ever
    Caller->>Caller: checkpoint.transition(GENERATED -> FAILED, reason)
    Caller->>Caller: record PackageOutcome(FAILED); continue to next article
```

## 3. Batch flow (composing §1/§2 across many articles)

```mermaid
sequenceDiagram
    participant Runner as PackageBatchRunner
    participant CKP as CheckpointStore
    participant PB as PackageBuilder

    loop each context in contexts
        Runner->>CKP: get_record(article_id)
        alt already >= PACKAGED
            Runner->>Runner: outcome = SKIPPED
        else
            Runner->>CKP: transition(current -> GENERATED)  [claim]
            alt claim lost (race)
                Runner->>Runner: outcome = SKIPPED
            else claim won
                Runner->>PB: build(context, output_root)
                alt success
                    Runner->>CKP: transition(GENERATED -> PACKAGED)
                    Runner->>Runner: outcome = SUCCEEDED
                else MecaEngineError
                    Runner->>CKP: transition(GENERATED -> FAILED, reason)
                    Runner->>Runner: outcome = FAILED
                end
            end
        end
    end
    Runner-->>Runner: return tuple(outcomes)
```
