import { SUPPORTED_EXPORT_FORMATS, sanitizeFileName, type ExportFormat } from '../audio/format'

interface ExportButtonProps {
  objectUrl: string | null
  exportFormat: ExportFormat
  onExportFormatChange: (format: ExportFormat) => void
  fileName: string
  onFileNameChange: (fileName: string) => void
  useCompensated: boolean
  onUseCompensatedChange: (value: boolean) => void
  isProcessing: boolean
}

export function ExportButton({
  objectUrl,
  exportFormat,
  onExportFormatChange,
  fileName,
  onFileNameChange,
  useCompensated,
  onUseCompensatedChange,
  isProcessing,
}: ExportButtonProps) {
  const disabled = !objectUrl || isProcessing
  const downloadName = `${sanitizeFileName(fileName)}${useCompensated ? '-compensated' : ''}.${exportFormat}`

  return (
    <div className="export-controls">
      <div className="export-controls__filename-group">
        <label htmlFor="export-filename" className="export-controls__filename-label">
          ダウンロードするファイル名
        </label>
        <input
          id="export-filename"
          className="export-controls__filename"
          type="text"
          value={fileName}
          onChange={(event) => onFileNameChange(event.target.value)}
          placeholder="ファイル名"
        />
      </div>

      <label className="export-controls__compensated">
        <input
          type="checkbox"
          checked={useCompensated}
          onChange={(event) => onUseCompensatedChange(event.target.checked)}
        />
        音量補正版としてダウンロード
        <span
          className="export-controls__info-mark"
          title="片方だけの音声が残る区間を自動で約1.4倍(+3dB)に底上げします。両方残っている区間との音量差を減らせますが、素材によっては聴き比べの精度が変わったり、音量の大きい素材ではクリッピング（音割れ）が発生することがあります。"
        >
          ⓘ
        </span>
      </label>

      <div className="export-controls__action-row">
        <select
          className="export-controls__format"
          value={exportFormat}
          onChange={(event) => onExportFormatChange(event.target.value as ExportFormat)}
          aria-label="ダウンロード形式"
        >
          {SUPPORTED_EXPORT_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format.toUpperCase()}
            </option>
          ))}
        </select>
        <a
          className={`export-button${disabled ? ' export-button--disabled' : ''}`}
          href={disabled ? undefined : objectUrl}
          download={disabled ? undefined : downloadName}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) event.preventDefault()
          }}
        >
          ダウンロード ({exportFormat.toUpperCase()})
        </a>
      </div>
    </div>
  )
}
