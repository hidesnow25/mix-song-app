/** Converts a single [-1, 1] float sample to a 16-bit signed PCM integer. */
export function floatSampleToInt16(sample: number): number {
  const clamped = Math.min(1, Math.max(-1, sample))
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
}

export function floatsToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    out[i] = floatSampleToInt16(samples[i])
  }
  return out
}
