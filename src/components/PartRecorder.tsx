import { useEffect, useMemo, useState } from 'react'
import { WaveformCanvas, type ColoredRegion } from './WaveformCanvas'
import type { usePartRecorder } from '../hooks/usePartRecorder'

// Colors reflect which file remains audible, not which was muted: muting A
// leaves only B audible (orange), muting B leaves only A audible (blue).
const MUTE_COLORS: Record<'A' | 'B' | 'none', string> = {
  A: 'rgba(249, 115, 22, 0.35)',
  B: 'rgba(59, 130, 246, 0.35)',
  none: 'rgba(236, 72, 153, 0.35)',
}
const TENTATIVE_COLOR = 'rgba(124, 58, 237, 0.35)'
const NUDGE_SECONDS = 0.1

interface PartRecorderProps {
  monoA: Float32Array | null
  monoB: Float32Array | null
  previewSamples: { left: Float32Array; right: Float32Array } | null
  recorder: ReturnType<typeof usePartRecorder>
}

function downmix(samples: { left: Float32Array; right: Float32Array } | null): Float32Array | null {
  if (!samples) return null
  const { left, right } = samples
  const length = Math.max(left.length, right.length)
  const mono = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    mono[i] = ((i < left.length ? left[i] : 0) + (i < right.length ? right[i] : 0)) / 2
  }
  return mono
}

/** A numeric time field that lets the user type freely; the value is only parsed/clamped on blur or Enter. */
function TimeField({
  value,
  onCommit,
  disabled,
  label,
}: {
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
  label: string
}) {
  const [text, setText] = useState(value.toFixed(2))

  useEffect(() => {
    setText(value.toFixed(2))
  }, [value])

  function commit() {
    const parsed = Number.parseFloat(text)
    if (Number.isFinite(parsed)) onCommit(parsed)
    else setText(value.toFixed(2))
  }

  return (
    <label className="part-recorder__time-field">
      {label}
      <input
        type="number"
        step="0.1"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
      秒
    </label>
  )
}

export function PartRecorder({ monoA, monoB, previewSamples, recorder }: PartRecorderProps) {
  const {
    parts,
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
  } = recorder

  const previewMono = useMemo(() => downmix(previewSamples), [previewSamples])

  if (!isReady) {
    return (
      <section className="part-recorder">
        <p className="part-recorder__hint">2つの音声ファイルを読み込むとパート分けができます</p>
      </section>
    )
  }

  const tentativeRegion: ColoredRegion[] =
    recordingEnd !== null ? [{ start: recordingStart, end: recordingEnd, color: TENTATIVE_COLOR }] : []

  const previewRegions: ColoredRegion[] = [
    ...parts.map((part) => ({ start: part.start, end: part.end, color: MUTE_COLORS[part.mute] })),
    ...tentativeRegion,
  ]

  const playhead = isPlaying ? playbackPosition : null

  return (
    <section className="part-recorder">
      <WaveformCanvas
        label="音声ファイル A"
        samples={monoA}
        duration={duration}
        regions={tentativeRegion}
        playheadPosition={playhead}
      />
      <WaveformCanvas
        label="音声ファイル B"
        samples={monoB}
        duration={duration}
        regions={tentativeRegion}
        playheadPosition={playhead}
      />
      <WaveformCanvas
        label="プレビュー"
        samples={previewMono}
        duration={duration}
        regions={previewRegions}
        playheadPosition={playhead}
      />

      <div className="part-recorder__time-fields">
        <TimeField label="始点" value={recordingStart} onCommit={setRecordingStart} disabled={isPlaying} />
        {recordingEnd !== null && (
          <>
            <TimeField label="終点" value={recordingEnd} onCommit={setRecordingEnd} disabled={isPlaying} />
            <button type="button" onClick={() => nudgeEnd(-NUDGE_SECONDS)} disabled={isPlaying}>
              -0.1秒
            </button>
            <button type="button" onClick={() => nudgeEnd(NUDGE_SECONDS)} disabled={isPlaying}>
              +0.1秒
            </button>
          </>
        )}
      </div>

      {overlapPending && (
        <div className="part-recorder__overlap">
          <p>始点が直前のパートに食い込んでいます。どちらの区間として扱いますか？</p>
          <button type="button" onClick={() => resolveOverlap('trim')}>
            前のパートを短縮する
          </button>
          <button type="button" onClick={() => resolveOverlap('keepPrevious')}>
            変更を取り消す
          </button>
        </div>
      )}

      <div className="part-recorder__transport">
        <button type="button" disabled={isPlaying || recordingEnd !== null || isComplete} onClick={play}>
          ▶ 再生
        </button>
        <button type="button" disabled={!isPlaying || isPreviewMode} onClick={markEnd}>
          終了点を記録
        </button>
        <button type="button" disabled={isPlaying || isComplete} onClick={jumpEndToDuration}>
          曲の最後まで
        </button>
        <button type="button" onClick={reset}>
          やり直す
        </button>
      </div>

      {recordingEnd !== null && !overlapPending && (
        <div className="part-recorder__decision">
          <p className="part-recorder__decision-label">
            {recordingStart.toFixed(1)}秒 〜 {recordingEnd.toFixed(1)}秒 の区間をどうしますか？
          </p>
          <button
            type="button"
            className="part-recorder__preview-button"
            onClick={isPreviewMode ? stopPreview : confirmPreview}
            disabled={isPlaying && !isPreviewMode}
          >
            {isPreviewMode ? '■ 停止' : '▶ この範囲を試聴'}
          </button>
          <button
            type="button"
            className="part-recorder__decision-button part-recorder__decision-button--a"
            disabled={isPlaying}
            onClick={() => commit('A')}
          >
            Aの音声を消す
          </button>
          <button
            type="button"
            className="part-recorder__decision-button part-recorder__decision-button--b"
            disabled={isPlaying}
            onClick={() => commit('B')}
          >
            Bの音声を消す
          </button>
          <button
            type="button"
            className="part-recorder__decision-button part-recorder__decision-button--none"
            disabled={isPlaying}
            onClick={() => commit('none')}
          >
            両方残す
          </button>
        </div>
      )}

      {isComplete && <p className="part-recorder__done">全区間の割り当てが完了しました。</p>}
    </section>
  )
}
