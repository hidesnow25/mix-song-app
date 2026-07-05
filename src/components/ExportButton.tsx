import { SUPPORTED_EXPORT_FORMATS, sanitizeFileName, type ExportFormat } from '../audio/format'

interface ExportButtonProps {
  objectUrl: string | null
  exportFormat: ExportFormat
  onExportFormatChange: (format: ExportFormat) => void
  fileName: string
  onFileNameChange: (fileName: string) => void
  isProcessing: boolean
}

export function ExportButton({
  objectUrl,
  exportFormat,
  onExportFormatChange,
  fileName,
  onFileNameChange,
  isProcessing,
}: ExportButtonProps) {
  const disabled = !objectUrl || isProcessing
  const downloadName = `${sanitizeFileName(fileName)}.${exportFormat}`

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
