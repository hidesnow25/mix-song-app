import { useRef, useState, type ChangeEvent } from 'react'
import { diffTrackAssignments, parsePartConfig, serializePartConfig, type PartConfig } from '../audio/partConfig'
import { sanitizeFileName } from '../audio/format'
import type { TrackId } from '../audio/trackIds'
import type { usePartRecorder } from '../hooks/usePartRecorder'

interface PartConfigShareProps {
  tracks: { id: TrackId; fileName: string }[]
  recorder: ReturnType<typeof usePartRecorder>
  compensated: boolean
  onCompensatedChange: (value: boolean) => void
  /** Base name for the downloaded config, kept in sync with the mix's output file name. */
  fileName: string
}

export function PartConfigShare({
  tracks,
  recorder,
  compensated,
  onCompensatedChange,
  fileName,
}: PartConfigShareProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function handleDownload() {
    const config: PartConfig = { compensated, tracks, parts: recorder.parts }
    const blob = new Blob([serializePartConfig(config)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${sanitizeFileName(fileName)}-parts.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    setError(null)

    const result = parsePartConfig(await file.text())
    if (!result.ok) {
      setError(result.error)
      return
    }

    const diff = diffTrackAssignments(result.config.tracks, tracks)
    const problems: string[] = [
      ...diff.missing.map((t) => `音声ファイル ${t.id} に「${t.fileName}」が登録されていません`),
      ...diff.renamed.map((r) => `音声ファイル ${r.id} は「${r.expected}」のはずですが「${r.actual}」が登録されています`),
      ...diff.extra.map((t) => `音声ファイル ${t.id}（${t.fileName}）は設定ファイルに含まれていません`),
    ]

    if (problems.length > 0) {
      const proceed = window.confirm(
        `登録中のファイルが設定ファイルの内容と一致しません:\n・${problems.join('\n・')}\n\nこのまま読み込むと、元と同じ合成結果にならない可能性があります。読み込みますか？`,
      )
      if (!proceed) return
    } else if (recorder.parts.length > 0) {
      const proceed = window.confirm('記録済みのパート分けを設定ファイルの内容で置き換えます。よろしいですか？')
      if (!proceed) return
    }

    recorder.restoreParts(result.config.parts)
    onCompensatedChange(result.config.compensated)
  }

  return (
    <section className="part-config-share">
      <p className="part-config-share__label">パート分けの共有</p>
      <p className="part-config-share__hint">
        パート分けの内容（登録したファイル名と、各区間の始点・終点・取り込んだファイル）を設定ファイルとして保存・読み込みできます。音声ファイルそのものは含まれないため、同じ音声ファイルを持っている人が同じ場所（A〜F）に登録してから読み込むと、同じ合成ファイルを再現できます。
      </p>
      <div className="part-config-share__actions">
        <button type="button" disabled={recorder.parts.length === 0} onClick={handleDownload}>
          設定ファイルをダウンロード
        </button>
        <button type="button" disabled={!recorder.isReady} onClick={() => inputRef.current?.click()}>
          設定ファイルを読み込む
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      </div>
      {error && <p className="part-config-share__error">{error}</p>}
    </section>
  )
}
