import { encodeMp3, type Mp3Bitrate } from './mp3'

interface EncodeRequest {
  left: ArrayBuffer
  right: ArrayBuffer
  sampleRate: number
  kbps: Mp3Bitrate
}

// Minimal local typing for the worker global scope, instead of pulling in
// the "webworker" lib (which would conflict with this project's "DOM" lib).
interface WorkerContext {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}

const ctx = self as unknown as WorkerContext

ctx.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { left, right, sampleRate, kbps } = event.data
  void (async () => {
    try {
      const buffer = await encodeMp3(new Float32Array(left), new Float32Array(right), sampleRate, kbps)
      ctx.postMessage({ buffer }, [buffer])
    } catch (err) {
      ctx.postMessage({ error: err instanceof Error ? err.message : String(err) }, [])
    }
  })()
}
