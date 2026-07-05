import { useMixEngine } from './hooks/useMixEngine'
import { FileDropZone } from './components/FileDropZone'
import { WaveformTrack } from './components/WaveformTrack'
import { MixControls } from './components/MixControls'
import { PreviewPlayer } from './components/PreviewPlayer'
import { ExportButton } from './components/ExportButton'

export default function App() {
  const {
    trackAFile,
    trackBFile,
    preset,
    setPreset,
    exportFormat,
    setExportFormat,
    loadFile,
    setRegions,
    objectUrl,
    isProcessing,
    error,
  } = useMixEngine()

  return (
    <div className="app">
      <header className="app__header">
        <h1>音声合成アプリ</h1>
        <p>2つの音声ファイルを読み込んで、左右の再生パターンを選びながら1つのファイルに合成します。</p>
      </header>

      {error && <div className="app__error">{error}</div>}

      <section className="tracks">
        <div className="tracks__row">
          <FileDropZone label="音声ファイル A" file={trackAFile} onFileSelected={(file) => loadFile('A', file)} />
          <WaveformTrack label="A" file={trackAFile} onRegionsChange={(regions) => setRegions('A', regions)} />
        </div>
        <div className="tracks__row">
          <FileDropZone label="音声ファイル B" file={trackBFile} onFileSelected={(file) => loadFile('B', file)} />
          <WaveformTrack label="B" file={trackBFile} onRegionsChange={(regions) => setRegions('B', regions)} />
        </div>
      </section>

      <section className="app__controls">
        <MixControls preset={preset} onPresetChange={setPreset} />
      </section>

      <section className="app__output">
        <PreviewPlayer objectUrl={objectUrl} isProcessing={isProcessing} />
        <ExportButton objectUrl={objectUrl} exportFormat={exportFormat} onExportFormatChange={setExportFormat} />
      </section>
    </div>
  )
}
