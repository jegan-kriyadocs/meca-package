# Milestone 7 Open Questions — Package Assembly

Every item below is backed by specific, cited evidence — no
speculative or hypothetical question is included, per the task's "if
supported by evidence" instruction.

## OQ-1: Does a transient output-write failure retry in place, or restart from packaging?

**Evidence of the ambiguity**: `13_LLD_04_PIPELINE_SCALABILITY_VALIDATION.md`
§9.5 states steps 5 (packaging) and 6 (output/publish) "are treated as
one atomic unit for restart purposes... ADR-017 forbids a
'half-published' state from ever being resumed into rather than redone"
— implying a crash anywhere in either step means **both** are redone
from scratch. But `06_DATA_FLOW_DOCUMENT.md` stage [9] (Output) states
"Write failure or post-write checksum mismatch → transient, retried **at
this stage only** (not from the beginning — this is the fine-grained
checkpoint granularity referenced in ADR-022/TC-158/TC-173)" — implying
an output-write retry does **not** redo packaging.

**Why it matters for this milestone's own design**: `PackageBatchRunner`'s
resume logic (§ Batch Execution Flow doc, §3) treats anything short of
`PACKAGED` as redo-from-scratch, consistent with the first reading. This
was the only reading available for the scope this milestone actually
built (packaging alone, no Output Writer yet) — but the future Output
Writer milestone will need to resolve this ambiguity explicitly, since it
determines whether a transient S3 hiccup should re-invoke
`PackageBuilder.build()` (expensive: 5 generators + full asset copy +
zip write) or just retry the upload of an already-built, still-valid
zip.

**Recommendation**: resolve before the Output Writer milestone begins,
since it changes that milestone's own checkpoint-transition design, not
this one's.

## OQ-2: Should `ArticleStage.PACKAGED` alone be treated as "batch-complete" for reporting purposes?

**Evidence**: `06_DATA_FLOW_DOCUMENT.md`'s own stage-chain narrative
treats `COMPLETE: published-operational` (stage 9) and
`COMPLETE: archived` (stage 12) as the true terminal states — "
`COMPLETE: published-operational` alone... is not sufficient to consider
the article fully done if archival is part of the confirmed scope." This
milestone's own `PackageBatchRunner` necessarily uses `PACKAGED` as its
own completion threshold (§ Decision Log, PA-7), since no later stage
exists in the codebase yet to check against.

**Why it matters**: a batch-level report generated purely from this
milestone's own `PackageOutcome`s would count an article as "succeeded"
once packaged, even though the business's own definition of "done"
(per the Data Flow Document) requires publication and archival too. This
is not a defect in this milestone — it correctly reports what it
itself accomplished — but it is a genuine terminology gap a future
Reporting-layer milestone must be careful not to conflate.

**Recommendation**: the future Reporting module (05_SYSTEM_MODULE_BREAKDOWN.md
Module 15, not yet built) should distinguish "packaged" from "published"
from "archived" explicitly in whatever summary it produces, rather than
treating this milestone's `PackageOutcomeStatus.SUCCEEDED` as
synonymous with "done."

## OQ-3: Is a DOI Registry mandatory for a real production run, or an opt-in safeguard?

**Evidence**: BR-154 ("A DOI must be unique across the production
batch") is stated as a firm rule in the Business Rule Book, and
`34_TECHNICAL_DEBT_REGISTER.md`'s TD-3 explicitly states "DOI uniqueness
must be implemented as part of Package Assembly's batch orchestration
(not deferred further) — a real production run without this check risks
silent DOI collisions across a batch." Yet this milestone's own
`PackageBuilder` accepts `doi_registry: DoiRegistry | None = None`,
meaning a caller **can** wire it up without one and skip the check
entirely.

**Why it matters**: the task's own instructions for this milestone say
"Implement the Package Assembly side of DOI uniqueness validation **if
this milestone includes it**" — a conditional framing — while the prior
milestone's Technical Debt Register treats it as a hard requirement "not
[to be] deferred further." This milestone resolved the tension by
building the capability fully (interface + working in-memory
implementation + wiring into `PackageBuilder`) while leaving it
technically optional to invoke, since no durable backend exists yet
(PA-1) and forcing every caller to use a non-durable, process-local
registry in production would itself be misleading.

**Recommendation**: before a real production batch run, whoever operates
it must explicitly decide to wire a `DoiRegistry` (ideally a durable one,
per PA-1) into every `PackageBuilder` instance — this milestone does not,
and should not, make that decision unilaterally on the operator's
behalf.
