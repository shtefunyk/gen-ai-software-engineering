"""Custom MCP server (Homework 5, Task 4) built with FastMCP.

Exposes the contents of ``lorem-ipsum.md`` as both an MCP **Resource** and an
MCP **Tool**, each limited to a requested number of words.

- Resource  ``lorem://words``              -> first 30 words (default)
- Resource  ``lorem://words/{word_count}`` -> first ``word_count`` words
- Tool      ``read(word_count=30)``        -> first ``word_count`` words

Run standalone:  python server.py
"""

from pathlib import Path

from fastmcp import FastMCP

DEFAULT_WORD_COUNT = 30
LOREM_FILE = Path(__file__).parent / "lorem-ipsum.md"

mcp = FastMCP("lorem-custom")


def get_words(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Return the first ``word_count`` whitespace-separated words of the file.

    The count is clamped to ``[0, total_words_in_file]`` so the function always
    returns a valid string, even for negative or oversized requests.
    """
    text = LOREM_FILE.read_text(encoding="utf-8")
    words = text.split()
    count = max(0, min(word_count, len(words)))
    return " ".join(words[:count])


@mcp.resource("lorem://words")
def lorem_default() -> str:
    """The lorem-ipsum text trimmed to the default word count (30)."""
    return get_words(DEFAULT_WORD_COUNT)


@mcp.resource("lorem://words/{word_count}")
def lorem_words(word_count: int) -> str:
    """The lorem-ipsum text trimmed to ``word_count`` words."""
    return get_words(word_count)


@mcp.tool
def read(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Read ``word_count`` words (default 30) from lorem-ipsum.md.

    Args:
        word_count: How many words to return. Defaults to 30.
    """
    return get_words(word_count)


if __name__ == "__main__":
    mcp.run()
