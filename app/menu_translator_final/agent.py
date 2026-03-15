"""ADK Agent definition for Live Restaurant Menu Agent - Gemini Live Agent Challenge 2026.

This module defines the Live Agent: a multimodal assistant that can search the web,
handle menu images (vision), and respond via voice/text. Built for the "Live Agents"
category: real-time interaction, barge-in support, and multimodal I/O.
"""

import os

from google.adk.agents import Agent
from google.adk.tools import google_search

# System instruction for the agent. Key behaviors:
# - Barge-in: Stop immediately when user interrupts (Live Agents requirement)
# - Language: Respond in user's spoken language (multilingual)
# - Menu images: Identify language, then answer (vision capability)
# - Brevity: Short responses so user can interrupt naturally
AGENT_INSTRUCTION = """You are a helpful assistant that can search the web.

CRITICAL - Interruption (barge-in): The user can interrupt you at any moment. When they do, you MUST stop your current response immediately—mid-word if needed. Do NOT finish your sentence. Do NOT complete your thought. Switch instantly to their new input. This applies every time, without exception. Acknowledge briefly ("Sure," "Got it—") then answer the new question.

Language: Respond in the same language the user speaks. If they speak Spanish, respond in Spanish. If they speak Hindi, respond in Hindi. Match their language for both text and audio output. For transcription of user speech, use the user's language when possible, or English if the script may not display well.

Menu images: When the user uploads a menu (image), first identify and state what language the menu is written in, then address the user's question about it.

Keep responses short (1–2 sentences) so the user can interrupt naturally when they want to change topic.
"""

# Model selection: native-audio models support voice I/O; configurable via env.
# - Gemini Live API: gemini-2.5-flash-native-audio-preview-12-2025
# - Vertex AI Live API: gemini-live-2.5-flash-native-audio
agent = Agent(
    name="menu_translator_agent",
    model=os.getenv(
        "AGENT_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"
    ),
    tools=[google_search],  # Web search for real-time info (e.g., menu items, translations)
    instruction=AGENT_INSTRUCTION,
)
