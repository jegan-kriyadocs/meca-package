# Milestone 7 Known Limitations — Package Assembly

Consolidated, ranked Critical/High/Medium/Low, following the same
convention as `34_TECHNICAL_DEBT_REGISTER.md`. Every item here is a
**scope boundary or inherited condition**, not a defect in what was
built — each is empirically distinguished from a defect in
`36_MILESTONE_7_PACKAGE_ASSEMBLY_IMPLEMENTATION_REPORT.md` §6.

## Critical

None. No confirmed implementation defect exists in this milestone's own
code (verified: 943 tests passing, 100% coverage on every new module,
mypy `--strict` clean, and the golden test's zip-content assertions
passing against all 3 real samples).

## High

| ID | Item | Description | Remediation path |
|---|---|---|---|
| PA-1 | No durable DOI Registry / Checkpoint Store backend | `InMemoryDoiRegistry`/`InMemoryCheckpointStore` are process-local and non-durable across restarts — a real multi-process or multi-run production deployment needs a shared, durable backend before BR-154 uniqueness or ADR-022 resume can be trusted across process boundaries | Implement a Postgres/DynamoDB backend for each `ABC` — no interface change needed, since `PackageBuilder`/`PackageBatchRunner` depend only on the abstract `DoiRegistry`/`CheckpointStore` contracts |
| PA-2 | Output Writer / S3 publishing not implemented | `StagedPackage` is the ready seam, but no code publishes it anywhere beyond local disk | A future milestone's own scope, per the task's own "support future S3 publishing" framing — not a gap introduced unexpectedly this milestone |

## Medium

| ID | Item | Description | Remediation path |
|---|---|---|---|
| PA-3 | Batch execution is sequential only | No parallel/distributed scheduler exists; a 6,000+-article batch runs one article at a time | Explicitly deferred per this milestone's own instructions; `PackageBuilder`'s stateless design and per-article-unique temp paths already remove the main blockers to adding one later |
| PA-4 | Concrete validation hooks are not implemented | `PackageBuilder`'s hook-invocation point is real and tested, but no `BusinessRuleValidationHook`/`DtdValidationHook`/`SchemaValidationHook` implementation exists to plug into it | The future Validation Engine milestone's own scope, unchanged from Milestone 6A's original deferral |
| PA-5 | TD-1 (manifest.xml round ordering, from Milestone 6H) still affects the *order* items appear inside the final zip's own manifest.xml content | Package Assembly correctly does not attempt to fix this (per the Milestone 6H Readiness Assessment's own explicit instruction), but the underlying `RoundInfo` semantic mismatch remains unresolved at its true root layer | Unchanged from Milestone 6H's own remediation path — a business-confirmed change to `round_resolver.py`, out of this milestone's layer |

## Low

| ID | Item | Description | Remediation path |
|---|---|---|---|
| PA-6 | Zip archive-entry timestamps are fixed at the zip format epoch (1980-01-01), not the files' real mtimes | A deliberate reproducibility trade-off (§ Decision Log) — the *copied files on disk*, prior to zipping, do preserve real mtimes via `shutil.copystat`; only the zip *entry metadata* is fixed | No action recommended — revisit only if a downstream consumer specifically needs zip-entry mtimes to reflect real file history |
| PA-7 | `PackageBatchRunner`'s "claimed" checkpoint stage reuses `ArticleStage.GENERATED` rather than a dedicated value | A slight semantic overload (§ Decision Log's own reasoning) — functionally correct and fully tested, but a future milestone splitting generation and packaging into independently-checkpointed stages would need to revisit this | Revisit only if/when generation and packaging become independently resumable steps |
