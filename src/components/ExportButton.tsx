import { SUPPORTED_EXPORT_FORMATS, type ExportFormat } from '../audio/format'

interface ExportButtonProps {
  objectUrl: string | null
  exportFormat: ExportFormat
  onExportFormatChange: (format: ExportFormat) => void
  isProcessing: boolean
}

export function ExportButton({ objectUrl, exportFormat, onExportFormatChange, isProcessing }: ExportButtonProps) {
  const disabled = !objectUrl || isProcessing

  return (
    <div className="export-controls">
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
        download={disabled ? undefined : `mixed-song.${exportFormat}`}
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
