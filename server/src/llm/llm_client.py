"""LLM client — Groq for code repair."""

import logging

from groq import Groq

from src.app.config import api_settings
from src.core.exceptions import LLMError

logger = logging.getLogger("rift_server")

_client: Groq | None = None


def _get_client() -> Groq:
    """Lazy-initialised Groq client."""
    global _client
    if _client is None:
        if not api_settings.groq_api_key:
            raise LLMError("SERVER_GROQ_API_KEY is not set — cannot call LLM")
        _client = Groq(api_key=api_settings.groq_api_key)
    return _client


def _clean_output(text: str) -> str:
    """Strip markdown code fences returned by LLM."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```python etc.)
        lines = lines[1:]
        # Remove closing ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


def clean_code_fences(text: str) -> str:
    """Public alias for stripping markdown fences from code."""
    return _clean_output(text)


def ask_llm(prompt: str) -> str:
    """
    Send a code-repair prompt to Groq LLM and return the fixed code.

    Raises LLMError on failure.
    """
    client = _get_client()

    logger.info("\n" + "#"*60)
    logger.info("[LLM-REQ] Groq chat.completions.create")
    logger.info(f"[LLM-REQ] model={api_settings.llm_model}  max_tokens={api_settings.llm_max_tokens}  temp={api_settings.llm_temperature}")
    logger.info(f"[LLM-REQ] PROMPT ({len(prompt)} chars):\n{prompt}")
    logger.info("#"*60)

    try:
        import time as _time
        t0 = _time.monotonic()
        response = client.chat.completions.create(
            model=api_settings.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior software engineer fixing CI test failures. "
                        "Return ONLY the complete corrected file contents. "
                        "Do not include any explanation, markdown fences, or commentary. "
                        "Just the raw code."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=api_settings.llm_temperature,
            max_tokens=api_settings.llm_max_tokens,
        )
        elapsed = (_time.monotonic() - t0) * 1000

        content = response.choices[0].message.content
        usage = response.usage
        logger.info("\n" + "-"*60)
        logger.info(f"[LLM-RES] Groq response ({elapsed:.0f}ms)")
        logger.info(f"[LLM-RES] usage: prompt_tokens={usage.prompt_tokens}  completion_tokens={usage.completion_tokens}  total={usage.total_tokens}")
        logger.info(f"[LLM-RES] OUTPUT ({len(content)} chars):\n{content[:1000]}{'...<truncated>' if len(content) > 1000 else ''}")
        logger.info("-"*60)
        return _clean_output(content)

    except LLMError:
        raise
    except Exception as e:
        logger.error(f"[LLM-ERR] LLM call failed: {e}")
        raise LLMError(f"LLM call failed: {e}")
