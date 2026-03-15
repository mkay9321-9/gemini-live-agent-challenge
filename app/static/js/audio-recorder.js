/**
 * Audio Recorder Worklet - Captures user voice for agent input
 *
 * Records microphone at 16kHz PCM (Gemini Live API requirement), converts
 * Float32 to Int16, and sends to handler (which forwards to WebSocket).
 * Echo cancellation prevents agent output from being re-captured.
 */

let micStream;

export async function startAudioRecorderWorklet(audioRecorderHandler) {
  // Step 1: Create AudioContext at 16kHz (Gemini Live API expects PCM 16kHz)
  const audioRecorderContext = new AudioContext({ sampleRate: 16000 });
  console.log("AudioContext sample rate:", audioRecorderContext.sampleRate);

  // Step 2: Load the PCM recorder processor (captures mic, outputs Float32)
  const workletURL = new URL("./pcm-recorder-processor.js", import.meta.url);
  await audioRecorderContext.audioWorklet.addModule(workletURL);

  // Step 3: Request microphone with echo cancellation (avoids false barge-in from speaker)
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const source = audioRecorderContext.createMediaStreamSource(micStream);

  // Step 4: Create worklet node; processor sends Float32 frames via port
  const audioRecorderNode = new AudioWorkletNode(
    audioRecorderContext,
    "pcm-recorder-processor"
  );

  // Connect the microphone source to the worklet.
  source.connect(audioRecorderNode);
  audioRecorderNode.port.onmessage = (event) => {
    // Convert to 16-bit PCM
    const pcmData = convertFloat32ToPCM(event.data);

    // Send the PCM data to the handler.
    audioRecorderHandler(pcmData);
  };
  return [audioRecorderNode, audioRecorderContext, micStream];
}

/**
 * Stop the microphone.
 */
export function stopMicrophone(micStream) {
  micStream.getTracks().forEach((track) => track.stop());
  console.log("stopMicrophone(): Microphone stopped.");
}

// Convert Float32 [-1,1] to Int16 for Gemini Live API
function convertFloat32ToPCM(inputData) {
  // Create an Int16Array of the same length.
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    // Multiply by 0x7fff (32767) to scale the float value to 16-bit PCM range.
    pcm16[i] = inputData[i] * 0x7fff;
  }
  // Return the underlying ArrayBuffer.
  return pcm16.buffer;
}
