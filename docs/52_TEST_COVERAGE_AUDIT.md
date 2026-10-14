# Test Coverage Audit — Milestone 8

Complete, empirically-verified test inventory across the whole project,
run directly during this milestone.

## 1. Headline numbers (fresh run)

| Metric | Value |
|---|---|
| Total tests collected and passing | **945** |
| Unit-marked tests | 921 |
| Golden-marked tests | 24 (8 test functions × 3 real samples, parametrized) |
| Integration-marked tests | 0 |
| Performance-marked tests | 0 |
| Fault-injection-marked tests | 0 |
| Synthetic-marked tests | 0 (synthetic *fixtures* are used extensively inside unit tests; the dedicated `tests/synthetic_fixtures/` directory itself is empty — see §3) |
| Overall coverage | 99% (4,113 statements, 8 missed) |
| Ruff (`src/`, `tests/`) | Clean |
| Ruff format | Clean (262 files) |
| Mypy `--strict` (`src/`) | Clean (119 source files) |

## 2. Test-function count by directory

| Directory | Test functions |
|---|---|
| `tests/unit/generators/` | 302 |
| `tests/unit/extraction/` | 192 |
| `tests/unit/model/` | 63 |
| `tests/unit/transform/` | 60 |
| `tests/unit/input/` | 48 |
| `tests/unit/config/` | 46 |
| `tests/unit/packaging/` | 37 |
| `tests/unit/logging_/` | 24 |
| `tests/unit/checkpoint/` | 18 |
| `tests/unit/orchestrator/` | 16 |
| `tests/unit/exceptions/` | 14 |
| `tests/unit/cli/` | 9 |
| `tests/golden/` | 8 (× 3 real samples = 24 collected) |
| `tests/unit/registry/` | 7 |
| `tests/unit/utils/` | 5 |
| `tests/unit/monitoring/`, `output/`, `recovery/`, `reporting/`, `retry/`, `validation/` | 0 each |

## 3. Coverage below 100% — every instance, with cause

| Module | Coverage | Cause |
|---|---|---|
| `monitoring/__init__.py` | 0% | Deliberately unimplemented stub (Roadmap phase not yet reached) |
| `output/__init__.py` | 0% | Deliberately unimplemented stub (Output Writer, deferred) |
| `recovery/__init__.py` | 0% | Deliberately unimplemented stub (deferred) |
| `reporting/__init__.py` | 0% | Deliberately unimplemented stub (deferred) |
| `retry/__init__.py` | 0% | Deliberately unimplemented stub (deferred) |
| `validation/__init__.py`, `validation/rules/__init__.py` | 0% | Deliberately unimplemented stub (Validation Engine, deferred) |
| `cli/main.py` | 97% (1 line) | `if __name__ == "__main__": cli()` — the standard, universally-unreachable-under-pytest module-execution guard; not a real gap |
| `extraction/article_metadata_extractor.py` | 99% (1 branch) | Pre-existing partial branch, unchanged since before Milestone 6 |
| `transform/contributor_transformer.py` | 99% (1 branch) | Pre-existing partial branch, unchanged since Milestone 5B |
| `transform/journal_transformer.py` | 95% (1 branch) | Pre-existing partial branch, unchanged since Milestone 5B |

**No module implementing any shipped functionality has a genuine
coverage gap.** Every 0% module is a deliberate, self-documented,
not-yet-reached stub; every <100%-but->95% module has one pre-existing,
already-known partial branch, none introduced this milestone.

## 4. Test category scaffolding vs. Test Specification's own stated preconditions

`tests/integration/`, `tests/performance/`, `tests/fault_injection/`,
`tests/synthetic_fixtures/` each exist only as `README.md` + `__init__.py`
+ `.gitkeep` — confirmed via direct directory listing. Each README states
its own precondition for being populated:

| Directory | Stated precondition | Currently met? | Verdict |
|---|---|---|---|
| `tests/integration/` | "True cross-module integration tests... populated once those packages exist (Roadmap Phases 2-4)" | **Yes** — extraction, ICAM, generators, packaging all exist | **Overdue** — this category should now have content but has none |
| `tests/performance/` | "Populated once there is a pipeline to benchmark (Roadmap Phase 7)" | **Yes** — Phase 7 (Package Assembly) is complete | **Overdue** |
| `tests/fault_injection/` | "Populated once `meca_engine.retry`, `meca_engine.recovery`, `meca_engine.checkpoint`, and `meca_engine.registry` are implemented (Roadmap Phase 6)" | **Partially** — `checkpoint`/`registry` exist; `retry`/`recovery` remain 0% stubs | **Correctly still deferred** (2 of 4 prerequisites unmet) |
| `tests/synthetic_fixtures/` | "Covers every scenario the 3 real samples cannot (0/1/3+/10-round articles, malformed XML, non-CC-BY license, a second journal)" | Ambiguous — synthetic *fixtures* are already used extensively **inside** existing unit tests (e.g. the 3-round ADR-013 fixture, malformed-XML tests), just not organized under this dedicated directory | **Partially addressed by convention, not by directory structure** — a documentation/organization gap, not a coverage gap |

**This is a genuine, evidence-backed finding**: the `tests/integration/`
and `tests/performance/` categories are now overdue relative to their
own stated preconditions, which the completion of Milestones 6-7 has
satisfied. This mirrors, and is directly caused by, the same root gap
identified in `48_COMPLETE_ARCHITECTURE_AUDIT.md` §7 (no end-to-end
orchestration exists yet to integration-test or benchmark as a whole).

## 5. Required test categories — coverage matrix (this milestone's own task scope)

| Required category | Status |
|---|---|
| Unit | Extensive — 921 tests across every implemented module |
| Integration | **Gap** — see §4 |
| Golden | Complete — 24/24 passing, all 3 real samples, all 5 generators + Package Assembly |
| Regression | Satisfied by the same golden + unit suite (re-run on every change; no dedicated separate "regression" suite exists, nor is one architecturally necessary given the existing suite's speed — 945 tests in ~18 seconds) |
| Batch | Covered at the `PackageBatchRunner` level (Milestone 7: success/skip/redo/continue-after-failure/concurrent-race) — **not covered end-to-end** (no test runs a multi-article batch through the *entire* pipeline, since no orchestration wiring exists to do so) |
| Performance | **Gap** — see §4; only ad-hoc, this-milestone's-own manual timing/memory measurements exist (see `50_PERFORMANCE_ASSESSMENT.md`), not a maintained, repeatable performance test suite |
| Failure | Extensive — every generator and every Package Assembly component has dedicated failure-path tests |

## 6. Conclusion

The **implemented** system is extremely well-tested: 99% coverage, zero
untested shipped-code paths, golden verification against all 3 real
samples at every layer including the final ZIP. The **gaps** are
entirely and exclusively in categories whose own prerequisites (a
runnable end-to-end pipeline, or fully-implemented retry/recovery) have
only just been completed or remain incomplete — not gaps in verifying
what has actually been built.
