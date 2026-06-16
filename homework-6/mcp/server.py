"""Custom FastMCP server exposing the pipeline results.

Tools:    get_transaction_status, list_pipeline_results
Resource: pipeline://summary

Run as a script: `python mcp/server.py` (see mcp.json). This directory intentionally has no
__init__.py so it is not importable as a `mcp` package (which would shadow the installed MCP SDK
that FastMCP depends on). Pure query logic lives in `pipeline_status.py` and is unit-tested there.
"""
from __future__ import annotations

import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from fastmcp import FastMCP  # noqa: E402
import pipeline_status  # noqa: E402

RESULTS = BASE / "shared" / "results"

mcp = FastMCP("pipeline-status")


@mcp.tool
def get_transaction_status(transaction_id: str) -> dict:
    """Return the current pipeline status of a transaction."""
    return pipeline_status.get_status(RESULTS, transaction_id)


@mcp.tool
def list_pipeline_results() -> dict:
    """Return a summary of all processed transactions."""
    return pipeline_status.list_results(RESULTS)


@mcp.resource("pipeline://summary")
def pipeline_summary() -> str:
    """Return the latest pipeline run summary as text."""
    return pipeline_status.summary_text(RESULTS)


if __name__ == "__main__":  # pragma: no cover
    mcp.run()
