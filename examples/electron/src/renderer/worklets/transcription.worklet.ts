class TranscriptionProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0]
    const frameLength = channels?.[0]?.length ?? 0
    if (!channels || channels.length === 0 || frameLength === 0)
      return true

    const mono = new Float32Array(frameLength)
    for (const channel of channels) {
      for (let index = 0; index < frameLength; index += 1)
        mono[index] = (mono[index] ?? 0) + (channel[index] ?? 0) / channels.length
    }
    this.port.postMessage(mono, [mono.buffer])
    return true
  }
}

registerProcessor('transcription-processor', TranscriptionProcessor)
