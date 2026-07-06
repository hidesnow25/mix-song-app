import { useEffect, useMemo, useState } from 'react'
import { WaveformCanvas, type ColoredRegion } from './WaveformCanvas'
import { TRACK_COLORS } from '../audio/trackColors'
import type { TrackId } from '../audio/trackIds'
import type { usePartRecorder } from '../hooks/usePartRecorder'

const TENTATIVE_COLOR = 'rgba(124, 58, 237, 0.35)'
const NUDGE_SECONDS = 0.1

interface PartRecorderProps {
  tracks: { id: TrackId; mono: Float32Array; fileName: string }[]
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

export function PartRecorder({ tracks, previewSamples, recorder }: PartRecorderProps) {
  const {
    parts,
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
  } = recorder

  const previewMono = useMemo(() => downmix(previewSamples), [previewSamples])

  if (!isReady) {
    return (
      <section className="part-recorder">
        <p className="part-recorder__hint">音声ファイルを読み込むとパート分けができます</p>
      </section>
    )
  }

  const tentativeRegion: ColoredRegion[] =
    recordingEnd !== null ? [{ start: recordingStart, end: recordingEnd, colors: [TENTATIVE_COLOR] }] : []

  const previewRegions: ColoredRegion[] = [
    ...parts.map((part) => ({
      start: part.start,
      end: part.end,
      colors: part.includedTracks.map((id) => TRACK_COLORS[id]),
    })),
    ...tentativeRegion,
  ]

  const playhead = isPlaying ? playbackPosition : null

  return (
    <section className="part-recorder">
      {tracks.map(({ id, mono, fileName }) => (
        <WaveformCanvas
          key={id}
          label={`音声ファイル ${id}: ${fileName}`}
          samples={mono}
          duration={duration}
          regions={tentativeRegion}
          playheadPosition={playhead}
        />
      ))}
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
            {recordingStart.toFixed(1)}秒 〜 {recordingEnd.toFixed(1)}秒 の区間に含める音声ファイルを選んでください
          </p>
          <button
            type="button"
            className="part-recorder__preview-button"
            onClick={isPreviewMode ? stopPreview : confirmPreview}
            disabled={isPlaying && !isPreviewMode}
          >
            {isPreviewMode ? '■ 停止' : '▶ この範囲を試聴'}
          </button>

          <div className="part-recorder__checkbox-actions">
            <button type="button" onClick={selectAllPending} disabled={isPlaying}>
              全選択
            </button>
            <button type="button" onClick={deselectAllPending} disabled={isPlaying}>
              全解除
            </button>
          </div>

          <div className="part-recorder__checkboxes">
            {tracks.map(({ id, fileName }) => (
              <label key={id} className="part-recorder__checkbox" style={{ borderColor: TRACK_COLORS[id] }}>
                <input
                  type="checkbox"
                  checked={pendingIncludedTracks.includes(id)}
                  disabled={isPlaying}
                  onChange={() => togglePendingTrack(id)}
                />
                <span className="part-recorder__checkbox-swatch" style={{ background: TRACK_COLORS[id] }} />
                {id}: {fileName}
              </label>
            ))}
          </div>

          <button type="button" className="part-recorder__confirm-button" disabled={isPlaying} onClick={commit}>
            この区間を確定する
          </button>
        </div>
      )}

      {isComplete && <p className="part-recorder__done">全区間の割り当てが完了しました。</p>}
    </section>
  )
}
