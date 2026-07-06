export type ExportFormat = 'wav' | 'mp3'

export const SUPPORTED_EXPORT_FORMATS: ExportFormat[] = ['wav', 'mp3']

export function extensionFromFileName(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

function isSupportedExportFormat(ext: string): ext is ExportFormat {
  return (SUPPORTED_EXPORT_FORMATS as string[]).includes(ext)
}

/** Defaults to the first registered file's extension (in track order), falling back to WAV. */
export function defaultExportFormat(fileNames: (string | null)[]): ExportFormat {
  for (const name of fileNames) {
    if (!name) continue
    const ext = extensionFromFileName(name)
    if (isSupportedExportFormat(ext)) return ext
  }
  return 'wav'
}

export function baseNameFromFileName(fileName: string): string {
  const ext = extensionFromFileName(fileName)
  return ext ? fileName.slice(0, -(ext.length + 1)) : fileName
}

/** Defaults to all registered file names (extensions stripped) hyphen-joined in track order. */
export function defaultOutputFileName(fileNames: (string | null)[]): string {
  const bases = fileNames.filter((name): name is string => Boolean(name)).map(baseNameFromFileName)
  return bases.length > 0 ? bases.join('-') : 'mixed-song'
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

/** Strips characters that are invalid in Windows/macOS/Linux file names. */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(INVALID_FILENAME_CHARS, '_').trim().replace(/[. ]+$/, '')
  return cleaned || 'mixed-song'
}
