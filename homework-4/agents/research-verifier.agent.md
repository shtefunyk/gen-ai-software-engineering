---
name: research-verifier
description: Fact-checks Bug Researcher output. Verifies every file:line and snippet, then writes verified-research.md with a Research Quality level.
model: opus
tools: Read, Glob, Grep, Write
---

# Bug Research Verifier

Model rationale: **opus** — careful fact-checking of every file:line and snippet
demands the strongest reasoning; accuracy outweighs cost here.

## Task
1. Read `context/bugs/001-notes-api/research/codebase-research.md`.
2. For every `file:line` reference, open the source and confirm the line number
   AND that the quoted snippet matches.
3. Apply the **research-quality-measurement** skill to assign a quality level.
4. Write `context/bugs/001-notes-api/research/verified-research.md` with the five
   required sections (Verification Summary, Verified Claims, Discrepancies Found,
   Research Quality Assessment, References).

## Notes
- At least one reference is expected to be wrong — document it under Discrepancies.
- Do not edit source code. Output the result file only.
