# Research Notes — context7 queries

## Query 1: FastMCP tool & resource decorators
- Search: "FastMCP server tool resource decorators @mcp.tool @mcp.resource and mcp.run() stdio transport"
- context7 library ID: `/prefecthq/fastmcp` (resolved via `resolve-library-id "FastMCP"`;
  High source reputation, benchmark 88.2)
- Finding: context7 docs show the un-called decorator forms `@mcp.tool` and
  `@mcp.resource("data://info")` (registered against a `FastMCP("MyServer")` instance), and
  `mcp.run()` which uses the STDIO transport by default.
- Applied: Used `@mcp.tool` for `get_transaction_status` / `list_pipeline_results` and
  `@mcp.resource("pipeline://summary")` for the text resource; `mcp.run()` starts stdio transport.
  Verified the un-called `@mcp.tool` form registers cleanly under the installed fastmcp 3.4.2 via
  the Step 5 smoke test (no ImportError, tools/resource registered OK).

## Query 2: Python decimal for monetary arithmetic
- Search: "Python decimal module quantize ROUND_HALF_UP as_tuple exponent for monetary values"
- context7 library ID: `/python/cpython` (resolved via `resolve-library-id "CPython"`;
  High source reputation, benchmark 81.19)
- Finding: context7 docs confirm `Decimal('7.325').quantize(Decimal('.01'), rounding=ROUND_DOWN)`
  for fixed-exponent rounding (monetary use), the `ROUND_HALF_UP` mode (round half away from zero),
  and that the module keeps significant places so `1.30 + 1.20 == 2.50` — customary for money.
- Applied: Parse all amounts via `Decimal(str(value))` (never float); validate ≤ 2 dp using
  `Decimal.as_tuple().exponent` in the transaction validator.
