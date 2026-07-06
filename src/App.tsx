import { useEffect } from 'react'
import { useMixEngine } from './hooks/useMixEngine'
import { usePartRecorder } from './hooks/usePartRecorder'
import { FileDropZone } from './components/FileDropZone'
import { MixControls } from './components/MixControls'
import { ChannelAssignment } from './components/ChannelAssignment'
import { PartRecorder } from './components/PartRecorder'
import { PartConfigShare } from './components/PartConfigShare'
import { PreviewPlayer } from './components/PreviewPlayer'
import { ExportButton } from './components/ExportButton'
import { BASE_TRACK_IDS, MAX_TRACKS, type TrackId } from './audio/trackIds'

export default function App() {
  const {
    activeTrackIds,
    tracksById,
    loadedTrackIds,
    sampleRate,
    channelAssignments,
    setChannelAssignment,
    preset,
    setPreset,
    setSegments,
    exportFormat,
    setExportFormat,
    fileName,
    setFileName,
    loadFile,
    addTrack,
    removeTrack,
    objectUrl,
    previewSamples,
    useCompensated,
    setUseCompensated,
    isProcessing,
    error,
  } = useMixEngine()

  const recorderTracks = loadedTrackIds.map((id) => ({ id, mono: tracksById[id].mono! }))
  const recorder = usePartRecorder({ tracks: recorderTracks, sampleRate, compensated: useCompensated })

  useEffect(() => {
    setSegments(recorder.segments)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.segments])

  // Loading (or reloading) audio data rebuilds the live-preview engine and
  // resets all recorded parts, so warn before silently wiping them — this
  // matters most right after importing a shared part-config file.
  function handleLoadFile(id: TrackId, file: File) {
    if (recorder.parts.length > 0) {
      const confirmed = window.confirm(
        '音声ファイルを読み込み直すと、記録済みのパート分けはリセットされます。よろしいですか？',
      )
      if (!confirmed) return
    }
    void loadFile(id, file)
  }

  function handleAddTrack() {
    if (recorder.parts.length > 0) {
      const confirmed = window.confirm(
        '音声ファイルを追加すると、記録済みのパート分けはリセットされます。よろしいですか？',
      )
      if (!confirmed) return
    }
    addTrack()
  }

  function handleRemoveTrack(id: TrackId) {
    if (recorder.parts.length > 0) {
      const confirmed = window.confirm(
        '音声ファイルを削除すると、記録済みのパート分けはリセットされます。よろしいですか？',
      )
      if (!confirmed) return
    }
    removeTrack(id)
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>音声合成アプリ</h1>
        <p>音声ファイル（最大6個）を読み込んで、左右の再生パターンを選びながら1つのファイルに合成します。</p>
      </header>

      {error && <div className="app__error">{error}</div>}

      <section className="tracks">
        {activeTrackIds.map((id) => (
          <div className="tracks__row" key={id}>
            <FileDropZone
              label={`音声ファイル ${id}`}
              file={tracksById[id].file}
              onFileSelected={(file) => handleLoadFile(id, file)}
            />
            {!(BASE_TRACK_IDS as TrackId[]).includes(id) && (
              <button
                type="button"
                className="tracks__remove-button"
                onClick={() => handleRemoveTrack(id)}
                aria-label={`音声ファイル ${id} を削除`}
              >
                × 削除
              </button>
            )}
          </div>
        ))}
        {activeTrackIds.length < MAX_TRACKS && (
          <button type="button" className="tracks__add-button" onClick={handleAddTrack}>
            ＋ 音声ファイルを追加
          </button>
        )}
      </section>

      <section className="app__controls">
        <MixControls preset={preset} onPresetChange={setPreset} />
      </section>

      {preset === 'separate' ? (
        <ChannelAssignment
          tracks={loadedTrackIds.map((id) => ({ id, fileName: tracksById[id].file!.name }))}
          assignments={channelAssignments}
          onChange={setChannelAssignment}
        />
      ) : (
        <>
          <PartRecorder
            tracks={loadedTrackIds.map((id) => ({
              id,
              mono: tracksById[id].mono!,
              fileName: tracksById[id].file!.name,
            }))}
            previewSamples={previewSamples}
            recorder={recorder}
          />
          <PartConfigShare
            tracks={loadedTrackIds.map((id) => ({ id, fileName: tracksById[id].file!.name }))}
            recorder={recorder}
            compensated={useCompensated}
            onCompensatedChange={setUseCompensated}
            fileName={fileName}
          />
        </>
      )}

      <section className="app__output">
        <PreviewPlayer objectUrl={objectUrl} isProcessing={isProcessing} />
        <ExportButton
          objectUrl={objectUrl}
          exportFormat={exportFormat}
          onExportFormatChange={setExportFormat}
          fileName={fileName}
          onFileNameChange={setFileName}
          useCompensated={useCompensated}
          onUseCompensatedChange={setUseCompensated}
          isProcessing={isProcessing}
          showCompensatedOption={preset === 'together'}
        />
      </section>
    </div>
  )
}
