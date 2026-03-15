/**
 * PCM Player Processor - Plays agent voice from WebSocket
 *
 * Receives Int16 PCM from main thread (decoded from base64), stores in ring buffer,
 * outputs Float32 to speakers. Supports fade-out on interruption (barge-in) so
 * old audio doesn't keep playing when user speaks.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer: 24kHz * 180s capacity
    this.bufferSize = 24000 * 180;  // 24kHz x 180 seconds
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    // Smooth fade-out on interruption (~50ms at 24kHz)
    this.fadeOutActive = false;
    this.fadeOutSamplesTotal = 0;
    this.fadeOutSamplesElapsed = 0;

    // Main thread sends: { command: 'endOfAudio' } for interrupt, or Int16Array for audio
    this.port.onmessage = (event) => {
      if (event.data.command === 'endOfAudio') {
        // Stop: brief fade (~20ms) then clear buffer so old audio doesn't keep playing
        const remaining = (this.writeIndex - this.readIndex + this.bufferSize) % this.bufferSize;
        this.fadeOutSamplesTotal = Math.min(remaining, 480);  // ~20ms at 24kHz
        this.fadeOutSamplesElapsed = 0;
        this.fadeOutActive = remaining > 0;
        return;
      }

      // Decode the base64 data to int16 array.
      const int16Samples = new Int16Array(event.data);

      // Add the audio data to the buffer
      this._enqueue(int16Samples);
    };
  }

  // Push incoming Int16 data into our ring buffer.
  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      // Convert 16-bit integer to float in [-1, 1]
      const floatVal = int16Samples[i] / 32768;

      // Store in ring buffer for left channel only (mono)
      this.buffer[this.writeIndex] = floatVal;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      // Overflow handling (overwrite oldest samples)
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  // The system calls `process()` ~128 samples at a time (depending on the browser).
  // We fill the output buffers from our ring buffer.
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const framesPerBlock = output[0].length;

    for (let frame = 0; frame < framesPerBlock; frame++) {
      let sample = 0;
      if (this.readIndex !== this.writeIndex) {
        sample = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;

        // Apply smooth fade-out when interrupting
        if (this.fadeOutActive && this.fadeOutSamplesTotal > 0) {
          const gain = 1 - (this.fadeOutSamplesElapsed / this.fadeOutSamplesTotal);
          sample *= Math.max(0, gain);
          this.fadeOutSamplesElapsed++;
          if (this.fadeOutSamplesElapsed >= this.fadeOutSamplesTotal) {
            this.fadeOutActive = false;
            this.readIndex = this.writeIndex;
          }
        }
      }

      output[0][frame] = sample;
      if (output.length > 1) {
        output[1][frame] = sample;
      }
    }

    return true;
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);

