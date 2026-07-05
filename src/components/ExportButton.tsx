import { SUPPORTED_EXPORT_FORMATS, type ExportFormat } from '../audio/format'

interface ExportButtonProps {
  objectUrl: string | null
  exportFormat: ExportFormat
  onExportFormatChange: (format: ExportFormat) => void
}

export function ExportButton({ objectUrl, exportFormat, onExportFormatChange }: ExportButtonProps) {
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
        className={`export-button${objectUrl ? '' : ' export-button--disabled'}`}
        href={objectUrl ?? undefined}
        download={objectUrl ? `mixed-song.${exportFormat}` : undefined}
        aria-disabled={!objectUrl}
        onClick={(event) => {
          if (!objectUrl) event.preventDefault()
        }}
      >
        ダウンロード ({exportFormat.toUpperCase()})
      </a>
    </div>
  )
}
