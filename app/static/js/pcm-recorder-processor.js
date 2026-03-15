/**
 * PCM Recorder Processor - Captures microphone input
 *
 * Runs in AudioWorklet; receives mic input, copies to avoid recycled buffers,
 * posts Float32 frames to main thread. Main thread converts to Int16 and sends
 * to WebSocket. Sample rate 16kHz (set by AudioContext in audio-recorder.js).
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    if (inputs.length > 0 && inputs[0].length > 0) {
      const inputChannel = inputs[0][0];
      // Copy to avoid recycled buffer issues when posting to main thread
      const inputCopy = new Float32Array(inputChannel);
      this.port.postMessage(inputCopy);
    }
    return true;
  }
}

registerProcessor("pcm-recorder-processor", PCMProcessor);
