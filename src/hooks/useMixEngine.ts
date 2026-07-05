import { useEffect, useRef, useState } from 'react'
import { decodeFile, toMono } from '../audio/decode'
import { presetToMixParams } from '../audio/mix'
import { renderMix } from '../audio/render'
import { encodeWavPCM16 } from '../audio/wav'
import { encodeMp3InWorker } from '../audio/mp3WorkerClient'
import { defaultExportFormat, defaultOutputFileName, type ExportFormat } from '../audio/format'
import type { MixPreset, SilenceRegion } from '../audio/types'

interface TrackData {
  file: File | null
  mono: Float32Array | null
  sampleRate: number | null
  regions: SilenceRegion[]
}

const EMPTY_TRACK: TrackData = { file: null, mono: null, sampleRate: null, regions: [] }
const DEBOUNCE_MS = 250

export function useMixEngine() {
  const [trackA, setTrackA] = useState<TrackData>(EMPTY_TRACK)
  const [trackB, setTrackB] = useState<TrackData>(EMPTY_TRACK)
  const [preset, setPreset] = useState<MixPreset>('separate')
  const [userExportFormat, setUserExportFormat] = useState<ExportFormat | null>(null)
  const [userFileName, setUserFileName] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [previewSamples, setPreviewSamples] = useState<{ left: Float32Array; right: Float32Array } | null>(null)
  const [useCompensated, setUseCompensated] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const exportFormat = userExportFormat ?? defaultExportFormat(trackA.file?.name ?? null, trackB.file?.name ?? null)
  const fileName = userFileName ?? defaultOutputFileName(trackA.file?.name ?? null, trackB.file?.name ?? null)

  async function loadFile(track: 'A' | 'B', file: File) {
    setError(null)
    try {
      const audioBuffer = await decodeFile(file)
      const mono = toMono(audioBuffer)
      const data: TrackData = { file, mono, sampleRate: audioBuffer.sampleRate, regions: [] }
      if (track === 'A') setTrackA(data)
      else setTrackB(data)
    } catch {
      setError(`${file.name} を音声として読み込めませんでした。対応形式のファイルを選択してください。`)
    }
  }

  function setRegions(track: 'A' | 'B', regions: SilenceRegion[]) {
    if (track === 'A') setTrackA((prev) => ({ ...prev, regions }))
    else setTrackB((prev) => ({ ...prev, regions }))
  }

  useEffect(() => {
    if (!trackA.mono || !trackB.mono || !trackA.sampleRate || !trackB.sampleRate) {
      return
    }

    const sampleRate = trackA.sampleRate
    const { panA, volumeA, panB, volumeB } = presetToMixParams(preset)

    let workTimer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const debounceTimer = setTimeout(() => {
      setIsProcessing(true)
      // Yield one tick so React can actually paint the "processing" state
      // before the encode work runs — otherwise isProcessing could flip
      // true->false within the same callback and never become visible.
      workTimer = setTimeout(() => {
        void (async () => {
          try {
            const result = renderMix({
              monoA: trackA.mono!,
              regionsA: trackA.regions,
              panA,
              volumeA,
              monoB: trackB.mono!,
              regionsB: trackB.regions,
              panB,
              volumeB,
              sampleRate,
              soloBoostFactor: useCompensated ? Math.SQRT2 : undefined,
            })

            // Feed the (fast, synchronous) mix result to the preview waveform
            // before the potentially slow encode step below runs.
            if (!cancelled) setPreviewSamples({ left: result.left, right: result.right })

            // MP3 encoding runs in a Worker so the main thread stays fully
            // responsive during long encodes; guard against a newer run
            // finishing first.
            const { buffer, mimeType } =
              exportFormat === 'mp3'
                ? {
                    buffer: await encodeMp3InWorker(result.left, result.right, result.sampleRate),
                    mimeType: 'audio/mpeg',
                  }
                : { buffer: encodeWavPCM16(result.left, result.right, result.sampleRate), mimeType: 'audio/wav' }

            if (cancelled) return

            const blob = new Blob([buffer], { type: mimeType })
            const nextUrl = URL.createObjectURL(blob)

            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = nextUrl
            setObjectUrl(nextUrl)
          } finally {
            if (!cancelled) setIsProcessing(false)
          }
        })()
      }, 0)
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      if (workTimer) clearTimeout(workTimer)
    }
  }, [
    trackA.mono,
    trackA.sampleRate,
    trackA.regions,
    trackB.mono,
    trackB.sampleRate,
    trackB.regions,
    preset,
    exportFormat,
    useCompensated,
  ])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  return {
    trackAFile: trackA.file,
    trackBFile: trackB.file,
    trackAMono: trackA.mono,
    trackBMono: trackB.mono,
    sampleRate: trackA.sampleRate ?? trackB.sampleRate,
    preset,
    setPreset,
    exportFormat,
    setExportFormat: setUserExportFormat,
    fileName,
    setFileName: setUserFileName,
    loadFile,
    setRegions,
    objectUrl,
    previewSamples,
    useCompensated,
    setUseCompensated,
    isProcessing,
    error,
  }
}
