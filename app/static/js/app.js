/**
 * app.js - Live Restaurant Menu Agent Frontend
 *
 * Gemini Live Agent Challenge 2026 - Live Agents category.
 * Handles real-time bidirectional streaming with the ADK backend:
 * - Text input/output
 * - Audio input (microphone) and output (agent voice)
 * - Image upload (menu photos for vision)
 * - Event console for debugging ADK events
 * - Barge-in: user can interrupt agent mid-response
 */

/* ========== WebSocket Connection ========== */

// Fixed user ID for demo; session ID is unique per connection for reconnection support
const userId = "demo-user";
let sessionId = "demo-session-" + Math.random().toString(36).substring(7);
let websocket = null;
let is_audio = false;
let userEndedCall = false;
let pendingStartAudio = false;

// Build WebSocket URL. Uses wss:// when served over HTTPS (e.g., Cloud Run).
// Query params enable proactivity and affective_dialog for native audio models.
function getWebSocketUrl() {
  // Use wss:// for HTTPS pages, ws:// for HTTP (localhost development)
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const baseUrl = wsProtocol + "//" + window.location.host + "/ws/" + userId + "/" + sessionId;
  const params = new URLSearchParams();
  params.append("proactivity", "true");
  params.append("affective_dialog", "true");
  return baseUrl + "?" + params.toString();
}

// Get DOM elements
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");
const consoleContent = document.getElementById("consoleContent");
const clearConsoleBtn = document.getElementById("clearConsole");
const showAudioEventsCheckbox = document.getElementById("showAudioEvents");
const agentPresence = document.getElementById("agentPresence");
const agentStatusText = document.getElementById("agentStatusText");
let currentMessageId = null;
let currentBubbleElement = null;
let currentInputTranscriptionId = null;
let currentInputTranscriptionElement = null;
let currentOutputTranscriptionId = null;
let currentOutputTranscriptionElement = null;
let inputTranscriptionFinished = false; // Track if input transcription is complete for this turn
let hasOutputTranscriptionInTurn = false; // Track if output transcription delivered the response

/* ========== UI Helpers ========== */

// Agent presence indicator: idle (ready), listening (user speaking), speaking (agent responding)
function updateAgentStatus(state, label) {
  if (!agentPresence || !agentStatusText) return;
  agentPresence.classList.remove("idle", "listening", "speaking");
  agentPresence.classList.add(state);
  agentStatusText.textContent = label || (state === "idle" ? "Ready" : state === "listening" ? "Listening…" : "Speaking…");
}

// Helper function to clean spaces between CJK characters
// Removes spaces between Japanese/Chinese/Korean characters while preserving spaces around Latin text
function cleanCJKSpaces(text) {
  // CJK Unicode ranges: Hiragana, Katakana, Kanji, CJK Unified Ideographs, Fullwidth forms
  const cjkPattern = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uffef]/;

  // Remove spaces between two CJK characters
  return text.replace(/(\S)\s+(?=\S)/g, (match, char1) => {
    // Get the character after the space(s)
    const nextCharMatch = text.match(new RegExp(char1 + '\\s+(.)', 'g'));
    if (nextCharMatch && nextCharMatch.length > 0) {
      const char2 = nextCharMatch[0].slice(-1);
      // If both characters are CJK, remove the space
      if (cjkPattern.test(char1) && cjkPattern.test(char2)) {
        return char1;
      }
    }
    return match;
  });
}

// Event console: format timestamps and add expandable entries for ADK events
function formatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

function addConsoleEntry(type, content, data = null, emoji = null, author = null, isAudio = false) {
  // Skip audio events if checkbox is unchecked
  if (isAudio && !showAudioEventsCheckbox.checked) {
    return;
  }

  const entry = document.createElement("div");
  entry.className = `console-entry ${type}`;

  const header = document.createElement("div");
  header.className = "console-entry-header";

  const leftSection = document.createElement("div");
  leftSection.className = "console-entry-left";

  // Add emoji icon if provided
  if (emoji) {
    const emojiIcon = document.createElement("span");
    emojiIcon.className = "console-entry-emoji";
    emojiIcon.textContent = emoji;
    leftSection.appendChild(emojiIcon);
  }

  // Add expand/collapse icon
  const expandIcon = document.createElement("span");
  expandIcon.className = "console-expand-icon";
  expandIcon.textContent = data ? "▶" : "";

  const typeLabel = document.createElement("span");
  typeLabel.className = "console-entry-type";
  typeLabel.textContent = type === 'outgoing' ? '↑ Upstream' : type === 'incoming' ? '↓ Downstream' : '⚠ Error';

  leftSection.appendChild(expandIcon);
  leftSection.appendChild(typeLabel);

  // Add author badge if provided
  if (author) {
    const authorBadge = document.createElement("span");
    authorBadge.className = "console-entry-author";
    authorBadge.textContent = author;
    authorBadge.setAttribute('data-author', author);
    leftSection.appendChild(authorBadge);
  }

  const timestamp = document.createElement("span");
  timestamp.className = "console-entry-timestamp";
  timestamp.textContent = formatTimestamp();

  header.appendChild(leftSection);
  header.appendChild(timestamp);

  const contentDiv = document.createElement("div");
  contentDiv.className = "console-entry-content";
  contentDiv.textContent = content;

  entry.appendChild(header);
  entry.appendChild(contentDiv);

  // JSON details (hidden by default)
  let jsonDiv = null;
  if (data) {
    jsonDiv = document.createElement("div");
    jsonDiv.className = "console-entry-json collapsed";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(data, null, 2);
    jsonDiv.appendChild(pre);
    entry.appendChild(jsonDiv);

    // Make entry clickable if it has data
    entry.classList.add("expandable");

    // Toggle expand/collapse on click
    entry.addEventListener("click", () => {
      const isExpanded = !jsonDiv.classList.contains("collapsed");

      if (isExpanded) {
        // Collapse
        jsonDiv.classList.add("collapsed");
        expandIcon.textContent = "▶";
        entry.classList.remove("expanded");
      } else {
        // Expand
        jsonDiv.classList.remove("collapsed");
        expandIcon.textContent = "▼";
        entry.classList.add("expanded");
      }
    });
  }

  consoleContent.appendChild(entry);
  consoleContent.scrollTop = consoleContent.scrollHeight;
}

function clearConsole() {
  consoleContent.innerHTML = '';
}

// Clear console button handler
clearConsoleBtn.addEventListener('click', clearConsole);

// Update connection status UI
function updateConnectionStatus(connected) {
  if (connected) {
    statusIndicator.classList.remove("disconnected");
    statusText.textContent = "Connected";
  } else {
    statusIndicator.classList.add("disconnected");
    statusText.textContent = "Disconnected";
  }
}

// Create a message bubble element
function createMessageBubble(text, isUser, isPartial = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "agent"}`;

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "bubble";

  const textP = document.createElement("p");
  textP.className = "bubble-text";
  textP.textContent = text;

  // Add typing indicator for partial messages
  if (isPartial && !isUser) {
    const typingSpan = document.createElement("span");
    typingSpan.className = "typing-indicator";
    textP.appendChild(typingSpan);
  }

  bubbleDiv.appendChild(textP);
  messageDiv.appendChild(bubbleDiv);

  return messageDiv;
}

// Create an image message bubble element
function createImageBubble(imageDataUrl, isUser) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "agent"}`;

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "bubble image-bubble";

  const img = document.createElement("img");
  img.src = imageDataUrl;
  img.className = "bubble-image";
  img.alt = "Captured image";

  bubbleDiv.appendChild(img);
  messageDiv.appendChild(bubbleDiv);

  return messageDiv;
}

// Update existing message bubble text
function updateMessageBubble(element, text, isPartial = false) {
  const textElement = element.querySelector(".bubble-text");

  // Remove existing typing indicator
  const existingIndicator = textElement.querySelector(".typing-indicator");
  if (existingIndicator) {
    existingIndicator.remove();
  }

  textElement.textContent = text;

  // Add typing indicator for partial messages
  if (isPartial) {
    const typingSpan = document.createElement("span");
    typingSpan.className = "typing-indicator";
    textElement.appendChild(typingSpan);
  }
}

// Add a system message
function addSystemMessage(text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "system-message";
  messageDiv.textContent = text;
  messagesDiv.appendChild(messageDiv);
  scrollToBottom();
}

// Scroll to bottom of messages
function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Sanitize event data for console display (replace large audio data with summary)
function sanitizeEventForDisplay(event) {
  // Deep clone the event object
  const sanitized = JSON.parse(JSON.stringify(event));

  // Check for audio data in content.parts
  if (sanitized.content && sanitized.content.parts) {
    sanitized.content.parts = sanitized.content.parts.map(part => {
      if (part.inlineData && part.inlineData.data) {
        // Calculate byte size (base64 string length / 4 * 3, roughly)
        const byteSize = Math.floor(part.inlineData.data.length * 0.75);
        return {
          ...part,
          inlineData: {
            ...part.inlineData,
            data: `(${byteSize.toLocaleString()} bytes)`
          }
        };
      }
      return part;
    });
  }

  return sanitized;
}

/* ========== WebSocket Lifecycle ========== */

// Establish WebSocket connection; handles open, message, close, error
function connectWebsocket() {
  userEndedCall = false;
  const ws_url = getWebSocketUrl();
  websocket = new WebSocket(ws_url);

  // Handle connection open
  websocket.onopen = function () {
    console.log("WebSocket connection opened.");
    updateConnectionStatus(true);
    addSystemMessage("Connected to Gemini Live Agent");

    // Log to console
    addConsoleEntry('incoming', 'WebSocket Connected', {
      userId: userId,
      sessionId: sessionId,
      url: ws_url
    }, '🔌', 'system');

    // Enable the Send, Start Audio, and Upload Image buttons (End Call enabled when Start Audio is clicked)
    document.getElementById("sendButton").disabled = false;
    document.getElementById("startAudioButton").disabled = false;
    document.getElementById("uploadImageButton").disabled = false;
    updateAgentStatus("idle", "Ready");
    addSubmitHandler();

    if (pendingStartAudio) {
      pendingStartAudio = false;
      startAudio();
      is_audio = true;
      document.getElementById("endCallButton").disabled = false;
      document.getElementById("startAudioButton").disabled = true;
      addSystemMessage("Audio mode enabled - you can now speak to the agent");
      addConsoleEntry('outgoing', 'Audio Mode Enabled', {
        status: 'Audio worklets started',
        message: 'Microphone active - audio input will be sent to agent'
      }, '🎤', 'system');
    }
  };

  // Handle incoming ADK events: transcriptions, content (text/audio), turnComplete, interrupted
  websocket.onmessage = function (event) {
    const adkEvent = JSON.parse(event.data);
    console.log("[AGENT TO CLIENT] ", adkEvent);

    // Log to console panel
    let eventSummary = 'Event';
    let eventEmoji = '📨'; // Default emoji
    const author = adkEvent.author || 'system';

    if (adkEvent.turnComplete) {
      eventSummary = 'Turn Complete';
      eventEmoji = '✅';
    } else if (adkEvent.interrupted) {
      eventSummary = 'Interrupted';
      eventEmoji = '⏸️';
    } else if (adkEvent.inputTranscription) {
      // Show transcription text in summary
      const transcriptionText = adkEvent.inputTranscription.text || '';
      const truncated = transcriptionText.length > 60
        ? transcriptionText.substring(0, 60) + '...'
        : transcriptionText;
      eventSummary = `Input Transcription: "${truncated}"`;
      eventEmoji = '📝';
    } else if (adkEvent.outputTranscription) {
      // Show transcription text in summary
      const transcriptionText = adkEvent.outputTranscription.text || '';
      const truncated = transcriptionText.length > 60
        ? transcriptionText.substring(0, 60) + '...'
        : transcriptionText;
      eventSummary = `Output Transcription: "${truncated}"`;
      eventEmoji = '📝';
    } else if (adkEvent.usageMetadata) {
      // Show token usage information
      const usage = adkEvent.usageMetadata;
      const promptTokens = usage.promptTokenCount || 0;
      const responseTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || 0;
      eventSummary = `Token Usage: ${totalTokens.toLocaleString()} total (${promptTokens.toLocaleString()} prompt + ${responseTokens.toLocaleString()} response)`;
      eventEmoji = '📊';
    } else if (adkEvent.content && adkEvent.content.parts) {
      const hasText = adkEvent.content.parts.some(p => p.text);
      const hasAudio = adkEvent.content.parts.some(p => p.inlineData);
      const hasExecutableCode = adkEvent.content.parts.some(p => p.executableCode);
      const hasCodeExecutionResult = adkEvent.content.parts.some(p => p.codeExecutionResult);

      if (hasExecutableCode) {
        // Show executable code
        const codePart = adkEvent.content.parts.find(p => p.executableCode);
        if (codePart && codePart.executableCode) {
          const code = codePart.executableCode.code || '';
          const language = codePart.executableCode.language || 'unknown';
          const truncated = code.length > 60
            ? code.substring(0, 60).replace(/\n/g, ' ') + '...'
            : code.replace(/\n/g, ' ');
          eventSummary = `Executable Code (${language}): ${truncated}`;
          eventEmoji = '💻';
        }
      }

      if (hasCodeExecutionResult) {
        // Show code execution result
        const resultPart = adkEvent.content.parts.find(p => p.codeExecutionResult);
        if (resultPart && resultPart.codeExecutionResult) {
          const outcome = resultPart.codeExecutionResult.outcome || 'UNKNOWN';
          const output = resultPart.codeExecutionResult.output || '';
          const truncatedOutput = output.length > 60
            ? output.substring(0, 60).replace(/\n/g, ' ') + '...'
            : output.replace(/\n/g, ' ');
          eventSummary = `Code Execution Result (${outcome}): ${truncatedOutput}`;
          eventEmoji = outcome === 'OUTCOME_OK' ? '✅' : '❌';
        }
      }

      if (hasText) {
        // Show text preview in summary
        const textPart = adkEvent.content.parts.find(p => p.text);
        if (textPart && textPart.text) {
          const text = textPart.text;
          const truncated = text.length > 80
            ? text.substring(0, 80) + '...'
            : text;
          eventSummary = `Text: "${truncated}"`;
          eventEmoji = '💭';
        } else {
          eventSummary = 'Text Response';
          eventEmoji = '💭';
        }
      }

      if (hasAudio) {
        // Extract audio info for summary
        const audioPart = adkEvent.content.parts.find(p => p.inlineData);
        if (audioPart && audioPart.inlineData) {
          const mimeType = audioPart.inlineData.mimeType || 'unknown';
          const dataLength = audioPart.inlineData.data ? audioPart.inlineData.data.length : 0;
          // Base64 string length / 4 * 3 gives approximate bytes
          const byteSize = Math.floor(dataLength * 0.75);
          eventSummary = `Audio Response: ${mimeType} (${byteSize.toLocaleString()} bytes)`;
          eventEmoji = '🔊';
        } else {
          eventSummary = 'Audio Response';
          eventEmoji = '🔊';
        }

        // Log audio event with isAudio flag (filtered by checkbox)
        const sanitizedEvent = sanitizeEventForDisplay(adkEvent);
        addConsoleEntry('incoming', eventSummary, sanitizedEvent, eventEmoji, author, true);
      }
    }

    // Create a sanitized version for console display (replace large audio data with summary)
    // Skip if already logged as audio event above
    const isAudioOnlyEvent = adkEvent.content && adkEvent.content.parts &&
      adkEvent.content.parts.some(p => p.inlineData) &&
      !adkEvent.content.parts.some(p => p.text);
    if (!isAudioOnlyEvent) {
      const sanitizedEvent = sanitizeEventForDisplay(adkEvent);
      addConsoleEntry('incoming', eventSummary, sanitizedEvent, eventEmoji, author);
    }

    // Update agent presence state
    if (adkEvent.inputTranscription && adkEvent.inputTranscription.text) {
      updateAgentStatus("listening", "Listening…");
    } else if (adkEvent.interrupted === true) {
      updateAgentStatus("listening", "Listening…");
    } else if ((adkEvent.outputTranscription && adkEvent.outputTranscription.text) ||
               (adkEvent.content && adkEvent.content.parts && adkEvent.content.parts.some(p => p.inlineData))) {
      updateAgentStatus("speaking", "Speaking…");
    } else if (adkEvent.turnComplete === true) {
      updateAgentStatus("idle", "Ready");
    }

    // Handle turn complete event
    if (adkEvent.turnComplete === true) {
      // Remove typing indicator from current message
      if (currentBubbleElement) {
        const textElement = currentBubbleElement.querySelector(".bubble-text");
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }
      }
      // Remove typing indicator from current output transcription
      if (currentOutputTranscriptionElement) {
        const textElement = currentOutputTranscriptionElement.querySelector(".bubble-text");
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }
      }
      currentMessageId = null;
      currentBubbleElement = null;
      currentOutputTranscriptionId = null;
      currentOutputTranscriptionElement = null;
      inputTranscriptionFinished = false; // Reset for next turn
      hasOutputTranscriptionInTurn = false; // Reset for next turn
      return;
    }

    // Handle interrupted event
    if (adkEvent.interrupted === true) {
      // Stop audio playback gracefully (smooth fade-out)
      if (audioPlayerNode) {
        audioPlayerNode.port.postMessage({ command: "endOfAudio" });
      }

      // Provide user feedback that interruption was received
      addSystemMessage("Got it — listening to you now");

      // Keep the partial message but mark it as interrupted
      if (currentBubbleElement) {
        const textElement = currentBubbleElement.querySelector(".bubble-text");
        if (textElement) {
          const typingIndicator = textElement.querySelector(".typing-indicator");
          if (typingIndicator) typingIndicator.remove();
        }
        currentBubbleElement.classList.add("interrupted");
      }

      // Keep the partial output transcription but mark it as interrupted
      if (currentOutputTranscriptionElement) {
        const textElement = currentOutputTranscriptionElement.querySelector(".bubble-text");
        if (textElement) {
          const typingIndicator = textElement.querySelector(".typing-indicator");
          if (typingIndicator) typingIndicator.remove();
        }
        currentOutputTranscriptionElement.classList.add("interrupted");
      }

      // Reset state so new content creates a new bubble
      currentMessageId = null;
      currentBubbleElement = null;
      currentOutputTranscriptionId = null;
      currentOutputTranscriptionElement = null;
      inputTranscriptionFinished = false; // Reset for next turn
      hasOutputTranscriptionInTurn = false; // Reset for next turn
      return;
    }

    // Handle input transcription (user's spoken words)
    if (adkEvent.inputTranscription && adkEvent.inputTranscription.text) {
      const transcriptionText = adkEvent.inputTranscription.text;
      const isFinished = adkEvent.inputTranscription.finished;

      // Only stop audio on explicit interrupted event, not on input transcription.
      // Input transcription can arrive from noise/breathing and causes false stops.
      // The interrupted event is the authoritative signal that the user actually spoke.

      if (transcriptionText) {
        // Ignore late-arriving transcriptions after we've finished for this turn
        if (inputTranscriptionFinished) {
          return;
        }

        if (currentInputTranscriptionId == null) {
          // Create new transcription bubble
          currentInputTranscriptionId = Math.random().toString(36).substring(7);
          // Clean spaces between CJK characters
          const cleanedText = cleanCJKSpaces(transcriptionText);
          currentInputTranscriptionElement = createMessageBubble(cleanedText, true, !isFinished);
          currentInputTranscriptionElement.id = currentInputTranscriptionId;

          // Add a special class to indicate it's a transcription
          currentInputTranscriptionElement.classList.add("transcription");

          messagesDiv.appendChild(currentInputTranscriptionElement);
        } else {
          // Update existing transcription bubble only if model hasn't started responding
          // This prevents late partial transcriptions from overwriting complete ones
          if (currentOutputTranscriptionId == null && currentMessageId == null) {
            if (isFinished) {
              // Final transcription contains the complete text, replace entirely
              const cleanedText = cleanCJKSpaces(transcriptionText);
              updateMessageBubble(currentInputTranscriptionElement, cleanedText, false);
            } else {
              // Partial transcription - append to existing text
              const existingText = currentInputTranscriptionElement.querySelector(".bubble-text").textContent;
              // Remove typing indicator if present
              const cleanText = existingText.replace(/\.\.\.$/, '');
              // Clean spaces between CJK characters before updating
              const accumulatedText = cleanCJKSpaces(cleanText + transcriptionText);
              updateMessageBubble(currentInputTranscriptionElement, accumulatedText, true);
            }
          }
        }

        // If transcription is finished, reset the state and mark as complete
        if (isFinished) {
          currentInputTranscriptionId = null;
          currentInputTranscriptionElement = null;
          inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
        }

        scrollToBottom();
      }
    }

    // Handle output transcription (model's spoken words)
    if (adkEvent.outputTranscription && adkEvent.outputTranscription.text) {
      const transcriptionText = adkEvent.outputTranscription.text;
      const isFinished = adkEvent.outputTranscription.finished;
      hasOutputTranscriptionInTurn = true;

      if (transcriptionText) {
        // Finalize any active input transcription when server starts responding
        if (currentInputTranscriptionId != null && currentOutputTranscriptionId == null) {
          // This is the first output transcription - finalize input transcription
          const textElement = currentInputTranscriptionElement.querySelector(".bubble-text");
          const typingIndicator = textElement.querySelector(".typing-indicator");
          if (typingIndicator) {
            typingIndicator.remove();
          }
          // Reset input transcription state so next user input creates new balloon
          currentInputTranscriptionId = null;
          currentInputTranscriptionElement = null;
          inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
        }

        if (currentOutputTranscriptionId == null) {
          // Create new transcription bubble for agent
          currentOutputTranscriptionId = Math.random().toString(36).substring(7);
          currentOutputTranscriptionElement = createMessageBubble(transcriptionText, false, !isFinished);
          currentOutputTranscriptionElement.id = currentOutputTranscriptionId;

          // Add a special class to indicate it's a transcription
          currentOutputTranscriptionElement.classList.add("transcription");

          messagesDiv.appendChild(currentOutputTranscriptionElement);
        } else {
          // Update existing transcription bubble
          if (isFinished) {
            // Final transcription contains the complete text, replace entirely
            updateMessageBubble(currentOutputTranscriptionElement, transcriptionText, false);
          } else {
            // Partial transcription - append to existing text
            const existingText = currentOutputTranscriptionElement.querySelector(".bubble-text").textContent;
            // Remove typing indicator if present
            const cleanText = existingText.replace(/\.\.\.$/, '');
            updateMessageBubble(currentOutputTranscriptionElement, cleanText + transcriptionText, true);
          }
        }

        // If transcription is finished, reset the state
        if (isFinished) {
          currentOutputTranscriptionId = null;
          currentOutputTranscriptionElement = null;
        }

        scrollToBottom();
      }
    }

    // Handle content events (text or audio)
    if (adkEvent.content && adkEvent.content.parts) {
      const parts = adkEvent.content.parts;

      // Finalize any active input transcription when server starts responding with content
      if (currentInputTranscriptionId != null && currentMessageId == null && currentOutputTranscriptionId == null) {
        // This is the first content event - finalize input transcription
        const textElement = currentInputTranscriptionElement.querySelector(".bubble-text");
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }
        // Reset input transcription state so next user input creates new balloon
        currentInputTranscriptionId = null;
        currentInputTranscriptionElement = null;
        inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
      }

      for (const part of parts) {
        // Handle inline data (audio)
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType;
          const data = part.inlineData.data;

          if (mimeType && mimeType.startsWith("audio/pcm") && audioPlayerNode) {
            audioPlayerNode.port.postMessage(base64ToArray(data));
          }
        }

        // Handle text
        if (part.text) {
          // Skip thinking/reasoning text from chat bubbles (shown in event console)
          if (part.thought) {
            continue;
          }

          // Skip final aggregated content when output transcription already
          // delivered the response (prevents duplicate thinking text replay)
          if (!adkEvent.partial && hasOutputTranscriptionInTurn) {
            continue;
          }

          // Add a new message bubble for a new turn
          if (currentMessageId == null) {
            currentMessageId = Math.random().toString(36).substring(7);
            currentBubbleElement = createMessageBubble(part.text, false, true);
            currentBubbleElement.id = currentMessageId;
            messagesDiv.appendChild(currentBubbleElement);
          } else {
            // Update the existing message bubble with accumulated text
            const existingText = currentBubbleElement.querySelector(".bubble-text").textContent;
            // Remove the "..." if present
            const cleanText = existingText.replace(/\.\.\.$/, '');
            updateMessageBubble(currentBubbleElement, cleanText + part.text, true);
          }

          // Scroll down to the bottom of the messagesDiv
          scrollToBottom();
        }
      }
    }
  };

  // Handle connection close
  websocket.onclose = function () {
    console.log("WebSocket connection closed.");
    updateAgentStatus("idle", "Disconnected");
    updateConnectionStatus(false);
    document.getElementById("sendButton").disabled = true;
    document.getElementById("startAudioButton").disabled = true;
    document.getElementById("endCallButton").disabled = true;
    document.getElementById("uploadImageButton").disabled = true;

    if (userEndedCall) {
      statusText.textContent = "Call Ended";
      document.getElementById("startAudioButton").disabled = false;
      document.getElementById("uploadImageButton").disabled = false;
      addSystemMessage("Call ended. Click Start Call or Upload Menu to start a new session.");
      addConsoleEntry('outgoing', 'Call ended by user', null, '📞', 'system');
    } else {
      addSystemMessage("Connection closed. Reconnecting in 5 seconds...");
      addConsoleEntry('error', 'WebSocket Disconnected', {
        status: 'Connection closed',
        reconnecting: true,
        reconnectDelay: '5 seconds'
      }, '🔌', 'system');

      setTimeout(function () {
        console.log("Reconnecting...");
        addConsoleEntry('outgoing', 'Reconnecting to ADK server...', {
          userId: userId,
          sessionId: sessionId
        }, '🔄', 'system');
        connectWebsocket();
      }, 5000);
    }
  };

  websocket.onerror = function (e) {
    console.log("WebSocket error: ", e);
    updateConnectionStatus(false);
    document.getElementById("sendButton").disabled = true;
    document.getElementById("startAudioButton").disabled = true;
    document.getElementById("endCallButton").disabled = true;
    document.getElementById("uploadImageButton").disabled = true;

    // Log to console
    addConsoleEntry('error', 'WebSocket Error', {
      error: e.type,
      message: 'Connection error occurred'
    }, '⚠️', 'system');
  };
}

connectWebsocket();

// End call button - stops audio, closes WebSocket, ends session, then starts new session
document.getElementById("endCallButton").addEventListener("click", () => {
  stopAudio();
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    userEndedCall = true;
    websocket.close();
  }
});

// Add submit handler to the form
function addSubmitHandler() {
  messageForm.onsubmit = function (e) {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
      // Add user message bubble
      const userBubble = createMessageBubble(message, true, false);
      messagesDiv.appendChild(userBubble);
      scrollToBottom();

      // Clear input
      messageInput.value = "";

      // Send message to server
      sendMessage(message);
      console.log("[CLIENT TO AGENT] " + message);
    }
    return false;
  };
}

// Send a message to the server as JSON
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    const jsonMessage = JSON.stringify({
      type: "text",
      text: message
    });
    websocket.send(jsonMessage);

    // Log to console panel
    addConsoleEntry('outgoing', 'User Message: ' + message, null, '💬', 'user');
  }
}

// Decode Base64 data to Array
// Handles both standard base64 and base64url encoding
function base64ToArray(base64) {
  // Convert base64url to standard base64
  // Replace URL-safe characters: - with +, _ with /
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  while (standardBase64.length % 4) {
    standardBase64 += '=';
  }

  const binaryString = window.atob(standardBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Send image to server
function sendImage(base64Image, mimeType = "image/jpeg") {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    const jsonMessage = JSON.stringify({
      type: "image",
      data: base64Image,
      mimeType: mimeType
    });
    websocket.send(jsonMessage);
    console.log("[CLIENT TO AGENT] Sent image");
  } else {
    addSystemMessage("Not connected. Please wait for connection before sending images.");
  }
}

/**
 * Upload Menu handling
 */

const uploadImageButton = document.getElementById("uploadImageButton");
const imageFileInput = document.getElementById("imageFileInput");

// Map file extensions to MIME types for common image formats
const mimeTypeMap = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp"
};

function getMimeType(file) {
  const mime = file.type;
  return mimeTypeMap[mime] || mime || "image/jpeg";
}

// Open file picker when upload button is clicked
uploadImageButton.addEventListener("click", () => {
  imageFileInput.click();
});

// Handle file selection
imageFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addSystemMessage("Please select an image file (JPEG, PNG, GIF, or WebP).");
    imageFileInput.value = "";
    return;
  }

  const mimeType = getMimeType(file);
  const reader = new FileReader();

  reader.onloadend = () => {
    const result = reader.result;
    const base64data = result.split(",")[1];

    if (!base64data) {
      addSystemMessage("Failed to read image file.");
      imageFileInput.value = "";
      return;
    }

    // Display the uploaded image in the chat
    const imageBubble = createImageBubble(result, true);
    messagesDiv.appendChild(imageBubble);
    scrollToBottom();

    // Send image to agent
    sendImage(base64data, mimeType);

    addConsoleEntry("outgoing", `Image uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, {
      filename: file.name,
      size: file.size,
      type: mimeType
    }, "📤", "user");
  };

  reader.readAsDataURL(file);
  imageFileInput.value = ""; // Reset so same file can be selected again
});

/* ========== Audio (Voice I/O) ========== */
// Microphone -> PCM 16kHz -> WebSocket; WebSocket -> base64 PCM -> AudioWorklet playback

let audioPlayerNode;
let audioPlayerContext;
let audioRecorderNode;
let audioRecorderContext;
let micStream;

// Import the audio worklets
import { startAudioPlayerWorklet } from "./audio-player.js";
import { startAudioRecorderWorklet, stopMicrophone } from "./audio-recorder.js";

// Start audio
function startAudio() {
  // Start audio output
  startAudioPlayerWorklet().then(([node, ctx]) => {
    audioPlayerNode = node;
    audioPlayerContext = ctx;
  });
  // Start audio input
  startAudioRecorderWorklet(audioRecorderHandler).then(
    ([node, ctx, stream]) => {
      audioRecorderNode = node;
      audioRecorderContext = ctx;
      micStream = stream;
    }
  );
}

// Stop audio: release microphone and close audio contexts
function stopAudio() {
  if (!is_audio) return;
  if (micStream) {
    stopMicrophone(micStream);
    micStream = null;
  }
  if (audioRecorderContext) {
    audioRecorderContext.close().catch(() => {});
    audioRecorderContext = null;
  }
  if (audioPlayerContext) {
    audioPlayerContext.close().catch(() => {});
    audioPlayerContext = null;
  }
  audioRecorderNode = null;
  audioPlayerNode = null;
  is_audio = false;
}

// Start the audio only when the user clicked the button
// (due to the gesture requirement for the Web Audio API)
const startAudioButton = document.getElementById("startAudioButton");
startAudioButton.addEventListener("click", () => {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    pendingStartAudio = true;
    sessionId = "demo-session-" + Math.random().toString(36).substring(7);
    connectWebsocket();
    return;
  }
  startAudioButton.disabled = true;
  startAudio();
  is_audio = true;
  document.getElementById("endCallButton").disabled = false;
  addSystemMessage("Audio mode enabled - you can now speak to the agent");

  // Log to console
  addConsoleEntry('outgoing', 'Audio Mode Enabled', {
    status: 'Audio worklets started',
    message: 'Microphone active - audio input will be sent to agent'
  }, '🎤', 'system');
});

// Audio recorder handler
function audioRecorderHandler(pcmData) {
  if (websocket && websocket.readyState === WebSocket.OPEN && is_audio) {
    // Send audio as binary WebSocket frame (more efficient than base64 JSON)
    websocket.send(pcmData);
    console.log("[CLIENT TO AGENT] Sent audio chunk: %s bytes", pcmData.byteLength);

    // Log to console panel (optional, can be noisy with frequent audio chunks)
    // addConsoleEntry('outgoing', `Audio chunk: ${pcmData.byteLength} bytes`);
  }
}

