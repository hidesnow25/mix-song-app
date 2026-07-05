import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLivePreviewEngine, type LivePreviewEngine } from '../audio/livePreview'
import type { MixPreset, SilenceRegion } from '../audio/types'

export interface Part {
  start: number
  end: number
  mute: 'A' | 'B' | 'none'
}

interface UsePartRecorderParams {
  monoA: Float32Array | null
  monoB: Float32Array | null
  sampleRate: number | null
  preset: MixPreset
}

const MIN_PART_SECONDS = 0.05 // floor to prevent zero/negative-length parts

export function usePartRecorder({ monoA, monoB, sampleRate, preset }: UsePartRecorderParams) {
  const [parts, setParts] = useState<Part[]>([])
  const [recordingStartOverride, setRecordingStartOverride] = useState<number | null>(null)
  const [recordingEnd, setRecordingEndState] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [playbackPosition, setPlaybackPosition] = useState(0)
  const engineRef = useRef<LivePreviewEngine | null>(null)

  const isReady = Boolean(monoA && monoB && sampleRate)
  const duration = monoA && monoB && sampleRate ? Math.max(monoA.length, monoB.length) / sampleRate : 0

  // recordingStart is derived from the last committed part's end, but can be
  // overridden downward (never upward, to avoid ever creating a gap) so the
  // user can reclaim time from the immediately-preceding part.
  const derivedStart = parts.length > 0 ? parts[parts.length - 1].end : 0
  const recordingStart = recordingStartOverride ?? derivedStart
  const overlapPending = recordingStartOverride !== null && recordingStartOverride < derivedStart
  const isComplete = isReady && duration > 0 && recordingStart >= duration

  // Rebuild the live-preview engine (and reset all recorded parts) only when
  // the actual audio data changes — i.e. a file was (re)loaded — not on every
  // region edit, since trackA.mono/trackB.mono are stable references across
  // setRegions calls.
  useEffect(() => {
    engineRef.current?.dispose()
    engineRef.current = null
    setParts([])
    setRecordingStartOverride(null)
    setRecordingEndState(null)
    setIsPlaying(false)
    setIsPreviewMode(false)
    setPlaybackPosition(0)

    if (monoA && monoB && sampleRate) {
      engineRef.current = createLivePreviewEngine({ monoA, monoB, sampleRate, preset })
    }

    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // preset is intentionally excluded: changing it shouldn't wipe recorded
    // parts, it's kept in sync by the effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monoA, monoB, sampleRate])

  useEffect(() => {
    engineRef.current?.setPreset(preset)
  }, [preset])

  // Memoized so the returned arrays are reference-stable across renders that
  // don't change `parts` — callers (e.g. App.tsx) depend on these arrays by
  // reference in their own effects, and a fresh array every render would
  // trigger an infinite update loop there.
  const regionsA: SilenceRegion[] = useMemo(
    () => parts.filter((p) => p.mute === 'A').map((p) => ({ start: p.start, end: p.end })),
    [parts],
  )
  const regionsB: SilenceRegion[] = useMemo(
    () => parts.filter((p) => p.mute === 'B').map((p) => ({ start: p.start, end: p.end })),
    [parts],
  )

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setRegionsA(regionsA)
    engine.setRegionsB(regionsB)
  }, [regionsA, regionsB])

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
  }, [isPlaying, isPreviewMode])

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
  }, [isPlaying, isComplete, duration])

  const commit = useCallback(
    (mute: Part['mute']) => {
      if (recordingEnd === null || overlapPending) return
      setParts((prev) => [...prev, { start: recordingStart, end: recordingEnd, mute }])
      setRecordingEndState(null)
      setRecordingStartOverride(null)
    },
    [recordingEnd, recordingStart, overlapPending],
  )

  const reset = useCallback(() => {
    engineRef.current?.pause()
    setIsPlaying(false)
    setIsPreviewMode(false)
    setParts([])
    setRecordingEndState(null)
    setRecordingStartOverride(null)
    setPlaybackPosition(0)
  }, [])

  return {
    parts,
    regionsA,
    regionsB,
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
    commit,
    reset,
  }
}
