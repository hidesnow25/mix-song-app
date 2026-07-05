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
      <input
        className="export-controls__filename"
        type="text"
        value={fileName}
        onChange={(event) => onFileNameChange(event.target.value)}
        aria-label="ダウンロードファイル名"
        placeholder="ファイル名"
      />
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
  )
}
