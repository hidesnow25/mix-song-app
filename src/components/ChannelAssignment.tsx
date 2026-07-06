import { TRACK_COLORS } from '../audio/trackColors'
import type { TrackId } from '../audio/trackIds'
import type { ChannelAssignmentState } from '../hooks/useMixEngine'

interface ChannelAssignmentProps {
  tracks: { id: TrackId; fileName: string }[]
  assignments: Record<TrackId, ChannelAssignmentState>
  onChange: (id: TrackId, side: 'left' | 'right', value: boolean) => void
}

export function ChannelAssignment({ tracks, assignments, onChange }: ChannelAssignmentProps) {
  if (tracks.length === 0) {
    return (
      <section className="channel-assignment">
        <p className="channel-assignment__hint">音声ファイルを読み込むと左右の再生チャンネルを選べます</p>
      </section>
    )
  }

  return (
    <section className="channel-assignment">
      <p className="channel-assignment__hint">
        左右にチェックしたファイルの数に偏りがあっても、自動で音量を調整して左右が同じ大きさに聴こえるようにします。
      </p>
      {tracks.map(({ id, fileName }) => (
        <div key={id} className="channel-assignment__row">
          <span className="channel-assignment__file">
            <span className="channel-assignment__swatch" style={{ background: TRACK_COLORS[id] }} />
            {id}: {fileName}
          </span>
          <label className="channel-assignment__checkbox">
            <input
              type="checkbox"
              checked={assignments[id].includeLeft}
              onChange={(event) => onChange(id, 'left', event.target.checked)}
            />
            左
          </label>
          <label className="channel-assignment__checkbox">
            <input
              type="checkbox"
              checked={assignments[id].includeRight}
              onChange={(event) => onChange(id, 'right', event.target.checked)}
            />
            右
          </label>
        </div>
      ))}
    </section>
  )
}
