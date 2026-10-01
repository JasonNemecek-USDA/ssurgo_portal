---
description: "Use when closing a work slice in SSURGO Portal. Produces a no-regression closeout, updates markdown records, and captures pain points/next steps."
name: "Session Closeout Record"
argument-hint: "Scope of work to close out"
agent: "agent"
---
Create a session closeout record for: ${input:Scope of work to close out}

Required actions:
1. Summarize what changed and why.
2. Add or update entries in:
   - [CHANGELOG.md](../../CHANGELOG.md)
   - [version/V1.0.0.118-Manageable-Steps-and-Tasks.md](../../version/V1.0.0.118-Manageable-Steps-and-Tasks.md)
   - [version/V1.0.0.118-Enhancement-Plan.md](../../version/V1.0.0.118-Enhancement-Plan.md) when strategy changed
3. Include command-backed validation evidence and any remaining risk.
4. Record pain points encountered in this session and their mitigations.
5. If repeated friction appears, run `/chronicle improve` and fold findings into AGENTS/skills/instructions.
6. End with clear next steps and owners.
