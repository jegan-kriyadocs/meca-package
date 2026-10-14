# Complete Architecture Audit — Milestone 8

Full-system architecture verification, Milestones 1–7 combined. Every
claim below is backed by a `grep`/direct-read command run during this
milestone — none is asserted from memory of prior reports without
re-verification.

## 1. Layering and dependency direction

```
grep -rln "from meca_engine.extraction\|from meca_engine.transform" src/meca_engine/generators/ src/meca_engine/packaging/ src/meca_engine/registry/
→ 0 hits
```
Confirmed unchanged since Milestone 6H: the generation and packaging
layers have no import path to `extraction`/`transform` internals — the
ICAM (`GeneratorContext`) remains the only channel.

```
grep -rln "from meca_engine.orchestrator" src/meca_engine/packaging/ src/meca_engine/registry/ src/meca_engine/generators/ src/meca_engine/checkpoint/ src/meca_engine/config/
→ 0 hits
```
No layer below `orchestrator` imports upward from it — `10_LLD_01`'s
rule ("`orchestrator/` is the only package permitted to import from
every other package; nothing else may import `orchestrator/`") holds
system-wide, not just within the generation layer.

```
grep -rln "from meca_engine.checkpoint" src/meca_engine/registry/
grep -rln "from meca_engine.registry" src/meca_engine/checkpoint/
→ 0 hits both directions
```
`checkpoint/` and `registry/` remain mutually independent, per
`10_LLD_01 §2.3` rule 5.

## 2. Module isolation

```
grep -n "^from meca_engine.generators\." src/meca_engine/generators/*/generator.py
```
Every hit is a generator importing its own sibling submodule, except
the one approved exception (`article_xml` → `raw_xml`, BR-051). No new
cross-generator dependency was introduced by Package Assembly.

```
grep -n "RawXmlGenerator(\|ArticleXmlGenerator(\|ManifestXmlGenerator(\|ReviewsXmlGenerator(\|TransferXmlGenerator(" src/meca_engine/packaging/builder.py
→ 0 hits
```
`PackageBuilder` never constructs a generator itself — every generator
instance is injected, confirming "Package Builder independence" (it
depends on generator *instances*, not generator *implementations*).

## 3. Configuration ownership

```
grep -rn "10\.1042\|CLINSCI\|Portland Press\|Silverchair" src/meca_engine/ --include="*.py"
```
The only hits are inside docstrings *describing* the ADR-007 ambiguity
(`config/schema.py`, `transfer_xml/generator.py`) — never a literal used
as an actual runtime value. No module outside `config/` owns a
publisher/journal/DOI-prefix value.

## 4. Generator independence (re-confirmed system-wide)

Every one of the 5 generators remains stateless (no mutable instance
attribute set after `__init__`, confirmed via direct code review of all
5 `generator.py` files this milestone) and independently instantiable —
proven directly by `tests/unit/generators/*/test_generator.py`, each of
which constructs its own generator in isolation with no dependency on
any other generator's presence.

## 5. Package Builder independence

`PackageBuilder.__init__` takes 5 generator instances, `NamespaceManager`,
`AssetCopyService`, `ZipBuilder`, and optional `DoiRegistry`/validation
hooks — nothing else. It has no compile-time or runtime dependency on
any *specific* generator implementation beyond the `BaseGenerator[T]`
duck-typed `.generate(context)` contract (confirmed: `test_builder.py`'s
own unit tests substitute fake generator objects with no inheritance
from the real classes, and `PackageBuilder` operates on them identically).

## 6. Zero duplicated XML logic (system-wide)

```
grep -rn "SubElement(\|ET\.Element\b" src/meca_engine/ --include="*.py" | grep -v "generators/xml/builder.py"
→ 0 hits
```
Confirmed system-wide, not just within `generators/`: no module anywhere
in the codebase constructs an XML element outside the one shared
`XmlDocumentBuilder`.

## 7. Critical finding: no end-to-end orchestration wiring exists

**This is the single most significant architecture finding of this
milestone.** Verified directly:

```
sed -n '1,15p' src/meca_engine/orchestrator/run_controller.py
```
> "Milestone 2 scope: discovery → checkpoint... No transformation,
> generation, validation, or packaging occurs here — those stages don't
> exist yet."

```
sed -n '160,212p' src/meca_engine/orchestrator/run_controller.py
```
Confirms `RunController._process_one` calls only `self._stager.stage_article(article_ref)`
and transitions the checkpoint to `STAGED`. It never calls
`extract_all_metadata`, `TransformationCoordinator`, any generator, or
`PackageBuilder`.

```
grep -n "^from meca_engine" src/meca_engine/container.py
```
The dependency-injection composition root wires `RunController`,
`Stager`, `BatchDiscovery`, `CheckpointStore` — but **never** wires any
generator, `PackageBuilder`, or `DoiRegistry`. There is no
`build_package_builder()`-equivalent function in `container.py`.

```
grep -n "is a placeholder\|will be implemented" src/meca_engine/cli/main.py
```
Confirms 2 CLI commands (`seed-doi-registry`, `rebuild-golden-baseline`)
remain explicit placeholders whose own stated preconditions ("once
`meca_engine.registry` [exists]"; "once the full generation pipeline
exists") **are now met** (both `registry/` and the full pipeline exist
as of Milestone 7) but have not been implemented to reflect that.

**Conclusion**: every individual stage (parsing, extraction,
transformation, all 5 generators, Package Assembly) is fully built,
independently correct, and proven end-to-end only by test code that
manually wires the stages together (the golden tests, and this
milestone's own end-to-end trace script). **No production entry point
exists that performs this wiring for a real batch run.** This is not a
defect in any completed milestone — every milestone's own scope
statement was explicit and honest about this boundary — but it is the
central fact the Production Readiness Go/No-Go decision must weigh.

## 8. No architectural redesign found necessary

Every dimension audited (layering, isolation, ownership, independence,
XML-logic duplication) passed with zero violations. The one significant
finding (§7) is a **completion gap**, not an **architectural defect** —
the missing wiring does not require redesigning anything already built;
it requires building the next, already-anticipated layer
(`orchestrator/article_pipeline.py`, per `10_LLD_01`'s own original
naming) on top of unchanged existing interfaces.
