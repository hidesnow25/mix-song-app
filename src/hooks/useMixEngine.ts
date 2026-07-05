import { useEffect, useRef, useState } from 'react'
import { decodeFile, toMono } from '../audio/decode'
import { presetToMixParams } from '../audio/mix'
import { renderMix } from '../audio/render'
import { encodeWavPCM16 } from '../audio/wav'
import { encodeMp3 } from '../audio/mp3'
import { defaultExportFormat, type ExportFormat } from '../audio/format'
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
  const [preset, setPreset] = useState<MixPreset>('both')
  const [userExportFormat, setUserExportFormat] = useState<ExportFormat | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const exportFormat = userExportFormat ?? defaultExportFormat(trackA.file?.name ?? null, trackB.file?.name ?? null)

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

    const timer = setTimeout(() => {
      setIsProcessing(true)
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
        })

        const { buffer, mimeType } =
          exportFormat === 'mp3'
            ? { buffer: encodeMp3(result.left, result.right, result.sampleRate), mimeType: 'audio/mpeg' }
            : { buffer: encodeWavPCM16(result.left, result.right, result.sampleRate), mimeType: 'audio/wav' }

        const blob = new Blob([buffer], { type: mimeType })
        const nextUrl = URL.createObjectURL(blob)

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = nextUrl
        setObjectUrl(nextUrl)
      } finally {
        setIsProcessing(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [
    trackA.mono,
    trackA.sampleRate,
    trackA.regions,
    trackB.mono,
    trackB.sampleRate,
    trackB.regions,
    preset,
    exportFormat,
  ])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  return {
    trackAFile: trackA.file,
    trackBFile: trackB.file,
    preset,
    setPreset,
    exportFormat,
    setExportFormat: setUserExportFormat,
    loadFile,
    setRegions,
    objectUrl,
    isProcessing,
    error,
  }
}
