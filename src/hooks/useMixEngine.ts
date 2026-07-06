import { useEffect, useRef, useState } from 'react'
import { decodeFile, toMono } from '../audio/decode'
import { renderSeparateMix, renderTogetherMix, type Segment } from '../audio/render'
import { encodeWavPCM16 } from '../audio/wav'
import { encodeMp3InWorker } from '../audio/mp3WorkerClient'
import { defaultExportFormat, defaultOutputFileName, type ExportFormat } from '../audio/format'
import { TRACK_ORDER, BASE_TRACK_IDS, MAX_TRACKS, type TrackId } from '../audio/trackIds'
import type { MixPreset } from '../audio/types'

interface TrackData {
  file: File | null
  mono: Float32Array | null
  sampleRate: number | null
}

export interface ChannelAssignmentState {
  includeLeft: boolean
  includeRight: boolean
}

const EMPTY_TRACK: TrackData = { file: null, mono: null, sampleRate: null }
const DEBOUNCE_MS = 250

function createEmptyTracksById(): Record<TrackId, TrackData> {
  const result = {} as Record<TrackId, TrackData>
  for (const id of TRACK_ORDER) result[id] = EMPTY_TRACK
  return result
}

// A defaults to left-only, B to right-only (mirrors the previous fixed
// separate-mode behavior); newly added C-F start unchecked on both sides.
function createDefaultChannelAssignments(): Record<TrackId, ChannelAssignmentState> {
  const result = {} as Record<TrackId, ChannelAssignmentState>
  for (const id of TRACK_ORDER) result[id] = { includeLeft: id === 'A', includeRight: id === 'B' }
  return result
}

export function useMixEngine() {
  const [activeTrackIds, setActiveTrackIds] = useState<TrackId[]>(['A', 'B'])
  const [tracksById, setTracksById] = useState<Record<TrackId, TrackData>>(createEmptyTracksById)
  const [channelAssignments, setChannelAssignments] = useState<Record<TrackId, ChannelAssignmentState>>(
    createDefaultChannelAssignments,
  )
  const [preset, setPreset] = useState<MixPreset>('separate')
  const [segments, setSegments] = useState<Segment[]>([])
  const [userExportFormat, setUserExportFormat] = useState<ExportFormat | null>(null)
  const [userFileName, setUserFileName] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [previewSamples, setPreviewSamples] = useState<{ left: Float32Array; right: Float32Array } | null>(null)
  const [useCompensated, setUseCompensated] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const loadedTrackIds = activeTrackIds.filter((id) => tracksById[id].mono !== null)
  const sampleRate = loadedTrackIds.length > 0 ? tracksById[loadedTrackIds[0]].sampleRate : null

  const fileNames = activeTrackIds.map((id) => tracksById[id].file?.name ?? null)
  const exportFormat = userExportFormat ?? defaultExportFormat(fileNames)
  const fileName = userFileName ?? defaultOutputFileName(fileNames)

  async function loadFile(id: TrackId, file: File) {
    setError(null)
    try {
      const audioBuffer = await decodeFile(file)
      const mono = toMono(audioBuffer)
      setTracksById((prev) => ({ ...prev, [id]: { file, mono, sampleRate: audioBuffer.sampleRate } }))
    } catch {
      setError(`${file.name} を音声として読み込めませんでした。対応形式のファイルを選択してください。`)
    }
  }

  function addTrack(): TrackId | null {
    if (activeTrackIds.length >= MAX_TRACKS) return null
    const next = TRACK_ORDER.find((id) => !activeTrackIds.includes(id))
    if (!next) return null
    setActiveTrackIds((prev) => [...prev, next])
    return next
  }

  function removeTrack(id: TrackId) {
    if ((BASE_TRACK_IDS as TrackId[]).includes(id)) return
    setActiveTrackIds((prev) => prev.filter((t) => t !== id))
    setTracksById((prev) => ({ ...prev, [id]: EMPTY_TRACK }))
    setChannelAssignments((prev) => ({ ...prev, [id]: { includeLeft: false, includeRight: false } }))
  }

  function setChannelAssignment(id: TrackId, side: 'left' | 'right', value: boolean) {
    setChannelAssignments((prev) => ({
      ...prev,
      [id]: { ...prev[id], [side === 'left' ? 'includeLeft' : 'includeRight']: value },
    }))
  }

  useEffect(() => {
    if (loadedTrackIds.length === 0 || sampleRate === null) return

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
            const loaded = loadedTrackIds.map((id) => ({ id, mono: tracksById[id].mono! }))

            const result =
              preset === 'separate'
                ? renderSeparateMix({
                    tracks: loaded.map(({ id, mono }) => ({
                      id,
                      mono,
                      includeLeft: channelAssignments[id].includeLeft,
                      includeRight: channelAssignments[id].includeRight,
                    })),
                    sampleRate,
                  })
                : renderTogetherMix({
                    tracks: loaded,
                    segments,
                    sampleRate,
                    compensated: useCompensated,
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
    // loadedTrackIds is derived fresh every render from activeTrackIds/tracksById,
    // so depend on those source states directly rather than the derived array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrackIds, tracksById, channelAssignments, segments, preset, sampleRate, exportFormat, useCompensated])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  return {
    activeTrackIds,
    tracksById,
    loadedTrackIds,
    sampleRate,
    channelAssignments,
    setChannelAssignment,
    preset,
    setPreset,
    segments,
    setSegments,
    exportFormat,
    setExportFormat: setUserExportFormat,
    fileName,
    setFileName: setUserFileName,
    loadFile,
    addTrack,
    removeTrack,
    objectUrl,
    previewSamples,
    useCompensated,
    setUseCompensated,
    isProcessing,
    error,
  }
}
