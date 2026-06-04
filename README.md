# ssurgo_portal

## SSURGO download unzip failure handling

When a downloaded SSURGO archive cannot be extracted (for example, because the ZIP is incomplete/corrupt), use `extract_ssurgo_archive` from `ssurgo_portal.archive_handling`.

Behavior:
- validates ZIP integrity before extraction (`ZipFile.testzip()`)
- catches unzip and file errors
- does **not** report success when extraction fails
- includes a user-facing remediation message (retry or re-download)
- logs extraction context (`archive`, `destination`, `error`, `attempt`)
- optionally retries extraction with `max_retries`
- optionally records final failures to a JSONL file with `failure_record_path`

### Troubleshooting

If a SSURGO archive downloads but fails to unzip:
1. Retry extraction/download once.
2. Delete the local ZIP and re-download that dataset.
3. Check logs for archive path and exception details.
4. Review the failure record JSONL file (if configured) to identify repeatedly failing archives.
