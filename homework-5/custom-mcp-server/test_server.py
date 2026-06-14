"""Smoke test for the custom MCP server.

Runs without Claude Code: uses FastMCP's in-memory client to exercise the
``read`` tool and the ``lorem://`` resources, plus the word-count helper.

Usage:  .venv/bin/python test_server.py
"""

import asyncio

from fastmcp import Client

import server
from server import get_words


def test_word_logic() -> None:
    assert len(get_words(5).split()) == 5, "should return exactly 5 words"
    assert get_words(0) == "", "zero words -> empty string"
    assert get_words(-3) == "", "negative clamps to empty"
    total = len(open(server.LOREM_FILE, encoding="utf-8").read().split())
    assert len(get_words(10_000).split()) == total, "oversized clamps to file size"
    assert len(get_words().split()) == 30, "default is 30 words"
    print(f"  word logic OK (file has {total} words)")


async def test_mcp_surface() -> None:
    async with Client(server.mcp) as client:
        tools = {t.name for t in await client.list_tools()}
        assert "read" in tools, f"'read' tool missing, got {tools}"

        resources = {str(r.uri) for r in await client.list_resources()}
        assert "lorem://words" in resources, f"default resource missing, got {resources}"

        result = await client.call_tool("read", {"word_count": 7})
        text = result.content[0].text
        assert len(text.split()) == 7, f"tool should return 7 words, got {len(text.split())}"
        print(f"  tool read(7) -> {text!r}")

        res = await client.read_resource("lorem://words")
        assert len(res[0].text.split()) == 30, "default resource should be 30 words"
        print("  resource lorem://words OK (30 words)")


def main() -> None:
    print("test_word_logic:")
    test_word_logic()
    print("test_mcp_surface:")
    asyncio.run(test_mcp_surface())
    print("\nALL OK ✅")


if __name__ == "__main__":
    main()
