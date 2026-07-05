// Only browser-specific file in src/audio/ — the seam a future server port
// would replace (e.g. with node-wav / ffmpeg-based decoding), while
// silence.ts / mix.ts / wav.ts / render.ts stay unchanged.

let sharedCtx: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext()
  }
  return sharedCtx
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  const arrayBuffer = await file.arrayBuffer()
  // decodeAudioData resamples to ctx.sampleRate automatically, so both
  // tracks always land on the same sample rate.
  return ctx.decodeAudioData(arrayBuffer)
}

/** Averages all channels down to one; inputs are treated as mono sources panned into the stereo output. */
export function toMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0).slice()
  }

  const mono = new Float32Array(length)
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / numberOfChannels
    }
  }
  return mono
}
