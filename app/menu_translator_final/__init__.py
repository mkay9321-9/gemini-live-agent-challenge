"""Menu Translator Agent package.

Exports the ADK Agent used by the Live Restaurant Menu Agent. The agent supports
 multimodal input (text, audio, images) and uses google_search for web lookups.
"""

from .agent import agent

__all__ = ["agent"]
