import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLivePreviewEngine, type LivePreviewEngine } from '../audio/livePreview'
import { fillSegmentGaps, type Segment } from '../audio/render'
import { TRACK_ORDER, type TrackId } from '../audio/trackIds'

export type Part = Segment

interface UsePartRecorderParams {
  tracks: { id: TrackId; mono: Float32Array }[]
  sampleRate: number | null
  /** Whether the "together" mode loudness compensation should also be reflected in the live preview. */
  compensated: boolean
}

const MIN_PART_SECONDS = 0.05 // floor to prevent zero/negative-length parts

export function usePartRecorder({ tracks, sampleRate, compensated }: UsePartRecorderParams) {
  const [parts, setParts] = useState<Part[]>([])
  const [pendingIncludedTracks, setPendingIncludedTracks] = useState<TrackId[]>([])
  const [recordingStartOverride, setRecordingStartOverride] = useState<number | null>(null)
  const [recordingEnd, setRecordingEndState] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [playbackPosition, setPlaybackPosition] = useState(0)
  const engineRef = useRef<LivePreviewEngine | null>(null)

  const isReady = tracks.length > 0 && sampleRate !== null
  const duration = isReady ? tracks.reduce((max, t) => Math.max(max, t.mono.length), 0) / sampleRate! : 0

  // recordingStart is derived from the last committed part's end, but can be
  // overridden downward (never upward, to avoid ever creating a gap) so the
  // user can reclaim time from the immediately-preceding part.
  const derivedStart = parts.length > 0 ? parts[parts.length - 1].end : 0
  const recordingStart = recordingStartOverride ?? derivedStart
  const overlapPending = recordingStartOverride !== null && recordingStartOverride < derivedStart
  const isComplete = isReady && duration > 0 && recordingStart >= duration

  // Fixed-length (TRACK_ORDER.length) slot array so this dependency list has
  // a stable size across renders regardless of how many tracks are loaded;
  // each slot holds the actual Float32Array reference (or null), so the
  // effect only reruns when audio data is actually (re)loaded/added/removed,
  // not on every parent re-render (which recreates the `tracks` array).
  const monoBySlot = TRACK_ORDER.map((id) => tracks.find((t) => t.id === id)?.mono ?? null)
  const trackIdsKey = tracks.map((t) => t.id).join(',')

  // Rebuild the live-preview engine (and reset all recorded parts) only when
  // the actual audio data changes — i.e. a file was (re)loaded, added, or
  // removed — not on every segment/decision edit.
  useEffect(() => {
    engineRef.current?.dispose()
    engineRef.current = null
    setParts([])
    setPendingIncludedTracks([])
    setRecordingStartOverride(null)
    setRecordingEndState(null)
    setIsPlaying(false)
    setIsPreviewMode(false)
    setPlaybackPosition(0)

    if (tracks.length > 0 && sampleRate) {
      engineRef.current = createLivePreviewEngine({ tracks, sampleRate })
    }

    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleRate, ...monoBySlot])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const ids = tracks.map((t) => t.id)
    const filled = fillSegmentGaps(parts, duration, ids)
    engine.setSegments(filled, compensated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, duration, trackIdsKey, compensated])

  // Polling loop: while playing normally it stops at the track's duration
  // (existing behavior); while confirm-previewing a tentative range, it
  // stops at recordingEnd instead so the preview never plays past the
  // segment being decided.
  useEffect(() => {
    if (!isPlaying) return
    let cancelled = false
    let frame: number

    const tick = () => {
      if (cancelled) return
      const engine = engineRef.current
      if (!engine) return
      const position = engine.getPosition()
      setPlaybackPosition(position)

      const stopAt = isPreviewMode ? recordingEnd : duration
      if (stopAt !== null && position >= stopAt) {
        engine.pause()
        setIsPlaying(false)
        if (isPreviewMode) {
          setIsPreviewMode(false)
        } else {
          setRecordingEndState(duration)
          setPendingIncludedTracks(tracks.map((t) => t.id))
        }
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isPreviewMode, recordingEnd, duration])

  const play = useCallback(() => {
    const engine = engineRef.current
    if (!engine || isPlaying || recordingEnd !== null || isComplete) return
    void engine.play(recordingStart)
    setIsPlaying(true)
  }, [isPlaying, recordingEnd, isComplete, recordingStart])

  const markEnd = useCallback(() => {
    const engine = engineRef.current
    // Excludes isPreviewMode: while confirm-previewing a tentative range,
    // this control must not be clickable, or it would silently overwrite
    // recordingEnd with wherever the preview happened to be when stopped.
    if (!engine || !isPlaying || isPreviewMode) return
    const position = engine.pause()
    setIsPlaying(false)
    setRecordingEndState(position)
    setPendingIncludedTracks(tracks.map((t) => t.id))
  }, [isPlaying, isPreviewMode, tracks])

  const confirmPreview = useCallback(() => {
    const engine = engineRef.current
    if (!engine || recordingEnd === null || isPlaying) return
    void engine.play(recordingStart)
    setIsPlaying(true)
    setIsPreviewMode(true)
  }, [recordingEnd, isPlaying, recordingStart])

  const stopPreview = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.pause()
    setIsPlaying(false)
    setIsPreviewMode(false)
  }, [])

  const setRecordingStart = useCallback(
    (rawValue: number) => {
      const lower = (parts[parts.length - 1]?.start ?? 0) + MIN_PART_SECONDS
      const upper = derivedStart
      const clamped = Math.min(Math.max(rawValue, lower), upper)
      setRecordingStartOverride(clamped >= upper ? null : clamped)
    },
    [parts, derivedStart],
  )

  const resolveOverlap = useCallback(
    (choice: 'trim' | 'keepPrevious') => {
      if (!overlapPending || recordingStartOverride === null) return
      if (choice === 'trim') {
        setParts((prev) => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], end: recordingStartOverride }
          return next
        })
      }
      setRecordingStartOverride(null)
    },
    [overlapPending, recordingStartOverride],
  )

  const setRecordingEnd = useCallback(
    (value: number) => {
      const lower = recordingStart + MIN_PART_SECONDS
      const clamped = Math.min(duration, Math.max(lower, value))
      setRecordingEndState(clamped)
    },
    [recordingStart, duration],
  )

  const nudgeEnd = useCallback(
    (deltaSeconds: number) => {
      if (recordingEnd === null) return
      setRecordingEnd(recordingEnd + deltaSeconds)
    },
    [recordingEnd, setRecordingEnd],
  )

  const jumpEndToDuration = useCallback(() => {
    if (isPlaying || isComplete) return
    setRecordingEndState(duration)
    setPendingIncludedTracks(tracks.map((t) => t.id))
  }, [isPlaying, isComplete, duration, tracks])

  const togglePendingTrack = useCallback((id: TrackId) => {
    setPendingIncludedTracks((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }, [])

  const selectAllPending = useCallback(() => {
    setPendingIncludedTracks(tracks.map((t) => t.id))
  }, [tracks])

  const deselectAllPending = useCallback(() => {
    setPendingIncludedTracks([])
  }, [])

  const commit = useCallback(() => {
    if (recordingEnd === null || overlapPending) return
    setParts((prev) => [...prev, { start: recordingStart, end: recordingEnd, includedTracks: pendingIncludedTracks }])
    setRecordingEndState(null)
    setRecordingStartOverride(null)
    setPendingIncludedTracks([])
  }, [recordingEnd, recordingStart, overlapPending, pendingIncludedTracks])

  const reset = useCallback(() => {
    engineRef.current?.pause()
    setIsPlaying(false)
    setIsPreviewMode(false)
    setParts([])
    setRecordingEndState(null)
    setRecordingStartOverride(null)
    setPlaybackPosition(0)
    setPendingIncludedTracks([])
  }, [])

  /** Replaces all recorded parts wholesale — used when importing a shared part-config file. */
  const restoreParts = useCallback(
    (next: Part[]) => {
      engineRef.current?.pause()
      setIsPlaying(false)
      setIsPreviewMode(false)
      // The same files can decode to fractionally different durations across
      // machines (different AudioContext sample rates), so clamp to this
      // machine's duration instead of rejecting the config.
      const clamped = next.map((p) => ({ ...p, end: Math.min(p.end, duration) })).filter((p) => p.start < p.end)
      setParts(clamped)
      setRecordingEndState(null)
      setRecordingStartOverride(null)
      setPendingIncludedTracks([])
      setPlaybackPosition(0)
    },
    [duration],
  )

  const segments: Segment[] = useMemo(() => parts, [parts])

  return {
    parts,
    segments,
    pendingIncludedTracks,
    duration,
    recordingStart,
    recordingEnd,
    overlapPending,
    isPlaying,
    isPreviewMode,
    playbackPosition,
    isReady,
    isComplete,
    play,
    markEnd,
    confirmPreview,
    stopPreview,
    setRecordingStart,
    setRecordingEnd,
    nudgeEnd,
    jumpEndToDuration,
    resolveOverlap,
    togglePendingTrack,
    selectAllPending,
    deselectAllPending,
    commit,
    reset,
    restoreParts,
  }
}
