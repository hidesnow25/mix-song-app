import { Spinner } from './Spinner'

interface PreviewPlayerProps {
  objectUrl: string | null
  isProcessing: boolean
}

export function PreviewPlayer({ objectUrl, isProcessing }: PreviewPlayerProps) {
  return (
    <div className="preview-player">
      <p className="preview-player__label">
        プレビュー
        {isProcessing && (
          <span className="preview-player__processing">
            <Spinner /> 生成中…
          </span>
        )}
      </p>
      {objectUrl ? (
        <audio controls src={objectUrl} style={{ width: '100%' }} />
      ) : (
        <p className="preview-player__hint">音声ファイルを読み込むとここで再生できます</p>
      )}
    </div>
  )
}
