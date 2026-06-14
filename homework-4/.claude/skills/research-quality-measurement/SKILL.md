---
name: research-quality-measurement
description: Use when writing verified-research.md to assign a standard Research Quality level based on how many file:line references and code snippets are verified against source.
---

# Research Quality Measurement

When verifying a research document, compute the **verification ratio**:

```
ratio = verified_references / total_references
```

A reference is *verified* only if BOTH the `file:line` resolves to real code AND
the quoted snippet matches the source.

## Quality levels

| Level | Criteria |
|-------|----------|
| `VERIFIED` | ratio = 100%, all snippets match exactly |
| `MOSTLY-VERIFIED` | ratio >= 80%, only minor discrepancies (e.g. off-by-one line numbers) |
| `PARTIALLY-VERIFIED` | 50% <= ratio < 80%, at least one substantive discrepancy |
| `UNRELIABLE` | ratio < 50% |

## Required output sections in `verified-research.md`

1. **Verification Summary** — pass/fail + Research Quality level.
2. **Verified Claims** — each confirmed `file:line` + snippet.
3. **Discrepancies Found** — each wrong reference, what was claimed vs. actual.
4. **Research Quality Assessment** — the level + reasoning (cite the ratio).
5. **References** — list of all checked `file:line` locations.
