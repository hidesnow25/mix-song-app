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

export function baseNameFromFileName(fileName: string): string {
  const ext = extensionFromFileName(fileName)
  return ext ? fileName.slice(0, -(ext.length + 1)) : fileName
}

/** Defaults to "<A>-<B>" (extensions stripped), falling back to whichever single name is available. */
export function defaultOutputFileName(fileNameA: string | null, fileNameB: string | null): string {
  const baseA = fileNameA ? baseNameFromFileName(fileNameA) : ''
  const baseB = fileNameB ? baseNameFromFileName(fileNameB) : ''

  if (baseA && baseB) return `${baseA}-${baseB}`
  return baseA || baseB || 'mixed-song'
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

/** Strips characters that are invalid in Windows/macOS/Linux file names. */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(INVALID_FILENAME_CHARS, '_').trim().replace(/[. ]+$/, '')
  return cleaned || 'mixed-song'
}
