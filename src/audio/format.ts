export type ExportFormat = 'wav' | 'mp3'

export const SUPPORTED_EXPORT_FORMATS: ExportFormat[] = ['wav', 'mp3']

export function extensionFromFileName(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

function isSupportedExportFormat(ext: string): ext is ExportFormat {
  return (SUPPORTED_EXPORT_FORMATS as string[]).includes(ext)
}

/** Defaults to the primary (A) input's extension, falling back to B's, then WAV. */
export function defaultExportFormat(fileNameA: string | null, fileNameB: string | null): ExportFormat {
  const extA = fileNameA ? extensionFromFileName(fileNameA) : ''
  if (isSupportedExportFormat(extA)) return extA

  const extB = fileNameB ? extensionFromFileName(fileNameB) : ''
  if (isSupportedExportFormat(extB)) return extB

  return 'wav'
}
