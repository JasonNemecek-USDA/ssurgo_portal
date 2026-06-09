# Baseline Report v1.0.0.117

## Scope
- Workload: national full manifest from area_manifest_v1.0.0.118_national_full.json
- SLA reference for .118 target: p95 <= 30 minutes
- Runtime policy: managed fallback paths across supported Python versions

## Current Evidence Status (2026-06-09)
- Baseline tracking run folder created: `version/benchmarks/runs/20260609_072811`
- Run metadata captured with entry runtime: `Python 3.14.3`
- Full-manifest download execution is still required on target machines (Kyle, Alena) before p50/p95 can be finalized.

## Execution Matrix
| Machine | Entry Python | Active Runtime | Run 1 (min) | Run 2 (min) | Run 3 (min) | p50 (min) | p95 (min) |
|---|---|---|---:|---:|---:|---:|---:|
| Local bootstrap (metadata only) | 3.14.3 | Pending managed fallback launch | Not started | Not started | Not started | TBD | TBD |
| Kyle | TBD | TBD | Pending | Pending | Pending | TBD | TBD |
| Alena | TBD | TBD | Pending | Pending | Pending | TBD | TBD |

## Stage Timing Summary
| Stage | p50 (s) | p95 (s) | Notes |
|---|---:|---:|---|
| Download | TBD | TBD | Pending full-manifest telemetry collection |
| Save (upload to local endpoint) | TBD | TBD | Pending full-manifest telemetry collection |
| Unzip | TBD | TBD | Pending full-manifest telemetry collection |
| Import | TBD | TBD | Pending full-manifest telemetry collection |

## Reliability Summary
- Selected areas: TBD (awaiting full-manifest execution)
- Success count: TBD
- Failure count: TBD
- Categorized failure taxonomy coverage: TBD
- Retry queued count: TBD

## Runtime Health Summary
- CPU percent (p50/p95): TBD
- Memory percent (p50/p95): TBD
- Process RSS MB (p50/p95): TBD

## Bottleneck Notes
1. Adaptive governor and queue backpressure are now instrumented for each run.
2. Governor/backpressure signals are logged as `downloadGovernor` and `downloadBackpressure` lines.
3. Remaining blocker is execution time on real full-manifest runs, not telemetry visibility.

## Actions for .118
1. Execute three full-manifest runs on Kyle and three on Alena.
2. Record run durations and compute p50/p95 against the 30-minute SLA.
3. Categorize failures and tune governor thresholds if p95 > 30 minutes.
