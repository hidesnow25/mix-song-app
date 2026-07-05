interface ExportButtonProps {
  objectUrl: string | null
}

export function ExportButton({ objectUrl }: ExportButtonProps) {
  return (
    <a
      className={`export-button${objectUrl ? '' : ' export-button--disabled'}`}
      href={objectUrl ?? undefined}
      download={objectUrl ? 'mixed-song.wav' : undefined}
      aria-disabled={!objectUrl}
      onClick={(event) => {
        if (!objectUrl) event.preventDefault()
      }}
    >
      ダウンロード (WAV)
    </a>
  )
}
