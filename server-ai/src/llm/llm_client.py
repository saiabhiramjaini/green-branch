"""LLM client — Groq for code repair."""

import logging
import time

from groq import Groq

from src.app.config import api_settings
from src.core.exceptions import FixGenerationError, LLMError

logger = logging.getLogger("greenbranch")

DEFAULT_SYSTEM_PROMPT = "You are a senior software engineer fixing CI test failures."

_client: Groq | None = None


def _get_client() -> Groq:
    """Lazy-initialised Groq client."""
    global _client
    if _client is None:
        if not api_settings.groq_api_key:
            raise LLMError("SERVER_GROQ_API_KEY is not set — cannot call LLM")
        _client = Groq(api_key=api_settings.groq_api_key)
    return _client


def clean_code_fences(text: str) -> str:
    """Strip a markdown code fence wrapped around the whole text."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")[1:]  # drop ```python etc.
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


def ask_llm(prompt: str, system: str = DEFAULT_SYSTEM_PROMPT) -> str:
    """Send *prompt* to the Groq model and return its answer (outer code fences removed).

    Raises LLMError if the call fails, FixGenerationError if the answer was cut off
    at ``llm_max_tokens`` (a partial answer can't be used safely).
    """
    client = _get_client()

    logger.info(f"[LLM-REQ] model={api_settings.llm_model} max_tokens={api_settings.llm_max_tokens} "
                f"temp={api_settings.llm_temperature} prompt_chars={len(prompt)}")
    logger.debug(f"[LLM-REQ] PROMPT:\n{prompt}")

    try:
        t0 = time.monotonic()
        response = client.chat.completions.create(
            model=api_settings.llm_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=api_settings.llm_temperature,
            max_tokens=api_settings.llm_max_tokens,
        )
        elapsed = (time.monotonic() - t0) * 1000
    except Exception as e:
        logger.error(f"[LLM-ERR] LLM call failed: {e}")
        raise LLMError(f"LLM call failed: {e}") from e

    choice = response.choices[0]
    content = choice.message.content or ""
    usage = response.usage
    logger.info(f"[LLM-RES] {elapsed:.0f}ms prompt_tokens={usage.prompt_tokens} "
                f"completion_tokens={usage.completion_tokens} finish={choice.finish_reason}")
    logger.debug(f"[LLM-RES] OUTPUT:\n{content}")

    if choice.finish_reason == "length":
        raise FixGenerationError(
            f"The AI's answer was cut off at {api_settings.llm_max_tokens} tokens, so it can't be used"
        )
    return clean_code_fences(content)
