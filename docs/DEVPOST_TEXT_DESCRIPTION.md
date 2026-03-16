# Live Restaurant Menu Agent — Text Description for Devpost Submission

**Category:** Live Agents 🗣️  
**Hackathon:** [Gemini Live Agent Challenge 2026]

--------------------------------------------------------------------------------

## Summary

The **Live Restaurant Menu Agent** is a real-time voice and vision assistant for restaurant menus. Point your phone at a menu, ask in your language, get spoken answers—ingredients, dietary info, prices, cultural context. Built with Gemini Live API to explore how native audio and barge-in differ from traditional STT→LLM→TTS pipelines.

--------------------------------------------------------------------------------

## Key Highlights

- **Live voice agent** — Real-time bidirectional streaming; natural conversation, not turn-based chat
- **Barge-in** — Interrupt the agent mid-sentence; it stops immediately and switches to your new question
- **Multilingual interaction** — Speak in your language, get answers in your language; no language selector
- **Cross-language menu** — Point at a menu in any language; the agent reads it and answers in yours
- **Multimodal** — Voice, text, and image (menu photo) input; spoken or text output
- **Live transcription** — See what you said and what the agent said in real time as the conversation flows
- **Web search** — Real-time lookup for ingredients, regional dishes, and cultural context

--------------------------------------------------------------------------------

## Value Proposition

Language barriers make ordering food stressful—menus are hard to read, ingredients unclear, dietary needs hard to communicate. This agent removes that friction: point, ask, interrupt when needed, get answers in your language. A practical Live API use case for voice-first, multimodal agents.

--------------------------------------------------------------------------------

## Features and Functionality

### Core Experience
- **Voice-first:** Start a call, speak naturally, receive spoken responses. Text fallback when voice isn't convenient.
- **Menu vision:** Upload a menu photo; agent identifies the language and answers questions about dishes, allergens, and more.
- **Multilingual:** Responds in your spoken language—no explicit selection.
- **Barge-in:** Interrupt mid-sentence; agent stops and switches to your new input.
- **Web search:** Google Search for up-to-date info.

### User Experience
- **Agent presence:** Visual states (Ready, Listening, Speaking).
- **Interruption feedback:** UI shows "— interrupted" and stops playback on barge-in.
- **Live transcription:** Real-time display of your speech and the agent's response as the conversation unfolds.

--------------------------------------------------------------------------------

## Technologies Used
| Layer           | Technology                                                      |
|-----------------|-----------------------------------------------------------------|
| **AI / Agent**  |  Google Agent Development Kit (ADK), Gemini Live API, `gemini-2.5-flash-native-audio-preview-12-2025
| **Backend**     | FastAPI, WebSocket (bidirectional streaming), Python 3.12
| **Frontend**    | Vanilla JavaScript, Web Audio API (AudioWorklet for 16 kHz PCM capture and playback)
| **Cloud**       | Google Cloud Run, Secret Manager, Cloud Build
| **Tools**       | `google_search` (ADK tool) for real-time web lookup

### Data Sources
- **Gemini Live API:** Real-time audio and text I/O, transcription, and model inference.
- **Google Search:** Web search results for menu items, ingredients, and cultural context.
- **User input:** Microphone (16 kHz PCM), text, and uploaded menu images. No external datasets or training.

--------------------------------------------------------------------------------

## Findings and Learnings

### 1. Three Approaches to Audio AI: Traditional, Native Audio, and Live API

**What I learned:** Coming from enterprise translation systems, I was used to the **traditional pipeline**— **Speech-to-Text (STT) → LLM translation → Text-to-Speech (TTS)**. Each step adds latency and can introduce errors (misheard words, unnatural prosody). It works for batch or one-shot translation, but it's not designed for real-time, conversational back-and-forth.

**What changed:** During this hackathon I explored **native audio** models—where the model processes audio end-to-end without explicit STT/TTS stages. The model "hears" and "speaks" directly. Latency drops and the flow feels more natural. But native audio alone doesn't give you the full real-time experience: you still need a streaming protocol, turn-taking logic, and—critically—the ability for the user to interrupt.

**What I discovered:** The **Live API** is the third piece. It combines native audio with a bidirectional streaming protocol, built-in voice activity detection (VAD), and first-class barge-in support. The API handles the plumbing—audio chunks, turn boundaries, interruption signals—so you can focus on the agent logic. This three-way comparison (traditional → native audio → Live API) became the mental model I used for every design decision in the project.

### 2. Barge-in: From Broken to Working—The Story

**What happened:** I started testing with native audio models outside the Live API. The agent would talk, I'd try to interrupt—and nothing. The agent kept going. I tried tweaking prompts, adjusting client-side logic, even cutting audio chunks manually. **Barge-in simply didn't work.** For a conversational menu assistant, that's a dealbreaker—users need to correct themselves, change questions, or ask for clarification without waiting for the agent to finish.

**What I did:** I switched to the **Live API**. The difference was immediate. The API has built-in interruption handling: when the user speaks, it detects it, stops the current response, and switches to the new input. No custom plumbing required.

**What I learned:** At a high level, the Live API treats barge-in as a first-class event. It sends an `interrupted` signal downstream, and the client stops playback and clears the buffer. The model is instructed to stop mid-sentence. The key insight: barge-in isn't something you bolt onto native audio—it's part of the Live API's real-time protocol. You either use the Live API and get it, or you don't.

### 3. Tuning Barge-in: Sensitivity, Latency, and Environment

**What I learned:** Barge-in is configurable via `RealtimeInputConfig` and `AutomaticActivityDetection`, but the options are limited and the behavior is sensitive to environment.

- **Start-of-speech sensitivity:** Only `LOW` and `HIGH` are supported—no "medium." I tried `HIGH` first; it caused false triggers from echo and background noise (the agent's own voice picked up by the mic). I changed to `START_SENSITIVITY_LOW` and false barge-ins dropped.
- **End-of-speech sensitivity:** I set `END_SENSITIVITY_HIGH` so turn detection is faster and the agent responds sooner after the user stops speaking. The tradeoff: brief pauses can be interpreted as end-of-turn.
- **Buffer and padding:** I tuned `prefix_padding_ms` (10 ms) and `silence_duration_ms` (20 ms) for faster interruption detection. Smaller values reduced perceived lag but made the system more sensitive to noise—I iterated until it felt right.
- **Echo and headphones:** Echo from speakers into the microphone caused spurious barge-in events. I enabled browser echo cancellation (`echoCancellation: true` in `getUserMedia`) and tested with headphones. The difference was stark—headphones became my recommendation for best results.

**What I changed:** On the client, when the Live API sends an `interrupted` event, I stop audio playback immediately and apply a short fade-out (~20 ms) so the user doesn't hear a harsh cut. The UI marks the interrupted message and clears the playback buffer.

### 4. Extending ADK and Live API: Outcome, Challenge, Solution

**Outcome/value:** I wanted the agent to feel natural—multilingual, interruptible, and easy to demo. Out of the box, ADK and Live API give you the plumbing, but the persona, language behavior, and UX are up to you.

**Challenge:** The default agent didn't know how to handle interruptions gracefully, didn't consistently match the user's language, and the UI didn't give clear feedback when something changed (e.g., user interrupted). I needed to extend the system without forking or fighting the framework.

**What I did (solution):**

- **Agent instructions:** I added explicit barge-in instructions: "When the user interrupts, stop immediately—mid-word if needed. Do NOT finish your sentence." This reinforces the API's behavior and keeps responses short so users can interrupt naturally.
- **Multi-language support:** No extra tools—I added language-matching instructions to the system prompt. The model responds in the user's spoken language based on input transcription.
- **RunConfig customization:** I added automatic detection of native-audio vs. half-cascade models and set `response_modalities`, transcription, and `RealtimeInputConfig` accordingly. Optional flags (`proactivity`, `affective_dialog`) are passed via WebSocket query params for experimentation.
- **UI/UX:** I built agent presence states (Ready, Listening, Speaking), visual feedback for interruptions ("— interrupted"), and live transcription so users see the conversation in real time. The agent became easy to demo and debug without overwhelming non-technical users.

### 5. Deployment and Reproducibility

**What I learned:** The hackathon requires proof of Google Cloud deployment and offers a bonus for automated deployment. I needed a one-command path from code to running service.

**What I did:** I containerized the app (Dockerfile) and wrote `scripts/deploy.sh`, which uses `gcloud run deploy --source .` and Cloud Build. API keys live in Secret Manager. One command deploys the full stack—no local Docker required.

**What happened:** Judges (and anyone else) can reproduce the deployment by running the script. This satisfies the hackathon bonus for automated cloud deployment.

---

## Reproducibility

See the [README](../README.md) for spin-up instructions. 
