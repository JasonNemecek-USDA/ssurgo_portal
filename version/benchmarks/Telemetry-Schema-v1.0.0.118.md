# Telemetry Schema v1.0.0.118

## Purpose
Capture minute-level benchmark telemetry for throughput and health during full-manifest runs.

## Event Source
- Worker event name: `download-telemetry`
- Sample interval: 60 seconds
- Backend runtime endpoint: `/runtimeTelemetry`

## Governor Event Source
- Worker event name: `download-governor`
- Triggered on adaptive concurrency adjustments and queue backpressure warnings
- Severity values: `info`, `warning`

## Required Fields
- `timestampUtc`: ISO timestamp for sample emission
- `stage`: `start`, `minute`, `final`, or `cancelled`
- `sequence`: monotonic integer sample counter for run
- `elapsedMs`: run elapsed milliseconds at sample time
- `totalAreas`: selected survey area count at run start
- `retryQueued`: cumulative retry-queue increments observed by worker
- `governorAdjustments`: cumulative adaptive governor concurrency updates
- `backpressureActivations`: cumulative queue backpressure window activations
- `queue.pipelineActive`
- `queue.pipelinePending`
- `queue.uploadConcurrency`
- `queue.uploadActive`
- `queue.uploadPending`
- `queue.ioConcurrency`
- `queue.ioActive`
- `queue.ioPending`
- `runtime.cpuPercent`
- `runtime.memoryPercent`
- `runtime.memoryUsedMb`
- `runtime.memoryAvailableMb`
- `runtime.processRssMb`

## Logging Contract
Each telemetry sample is summarized to tlogger in one compact line beginning with:
- `downloadTelemetry stage=`

Adaptive governor and queue-pressure signals are logged as compact lines beginning with:
- `downloadGovernor reason=`
- `downloadBackpressure stage=`

This allows baseline and optimization runs to be compared with grep/filter tooling.
