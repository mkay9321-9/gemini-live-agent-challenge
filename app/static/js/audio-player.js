/**
 * Audio Player Worklet - Plays agent voice output
 *
 * Receives base64 PCM from the WebSocket (agent responses), decodes in the
 * processor, and plays through speakers. Sample rate 24kHz matches Gemini
 * native audio output. Used for Live Agents voice response.
 */

export async function startAudioPlayerWorklet() {
    // Step 1: Create AudioContext at 24kHz (matches Gemini native audio output)
    const audioContext = new AudioContext({
        sampleRate: 24000
    });

    // Step 2: Load the PCM player processor (ring buffer, fade-out on interrupt)
    const workletURL = new URL('./pcm-player-processor.js', import.meta.url);
    await audioContext.audioWorklet.addModule(workletURL);

    // Step 3: Create worklet node; main thread sends audio via port.postMessage()
    const audioPlayerNode = new AudioWorkletNode(audioContext, 'pcm-player-processor');

    // Step 4: Route output to speakers
    audioPlayerNode.connect(audioContext.destination);

    return [audioPlayerNode, audioContext];
}
