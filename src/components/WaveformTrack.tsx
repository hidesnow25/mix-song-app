import { useEffect, useMemo, useRef } from 'react'
import { useWavesurfer } from '@wavesurfer/react'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import type { SilenceRegion } from '../audio/types'

interface WaveformTrackProps {
  label: string
  file: File | null
  onRegionsChange: (regions: SilenceRegion[]) => void
}

export function WaveformTrack({ label, file, onRegionsChange }: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  const regionsPlugin = useMemo(() => RegionsPlugin.create(), [])

  const { wavesurfer } = useWavesurfer({
    container: containerRef,
    url: objectUrl ?? undefined,
    waveColor: '#8b5cf6',
    progressColor: '#6d28d9',
    height: 96,
    plugins: useMemo(() => [regionsPlugin], [regionsPlugin]),
  })

  useEffect(() => {
    if (!wavesurfer) return

    const disableDragSelection = regionsPlugin.enableDragSelection({
      color: 'rgba(239, 68, 68, 0.35)',
    })

    const syncRegions = () => {
      const regions = regionsPlugin.getRegions().map((region) => ({ start: region.start, end: region.end }))
      onRegionsChange(regions)
    }

    const unsubCreated = regionsPlugin.on('region-created', (region) => {
      region.on('dblclick', () => region.remove())
      syncRegions()
    })
    const unsubUpdated = regionsPlugin.on('region-updated', syncRegions)
    const unsubRemoved = regionsPlugin.on('region-removed', syncRegions)

    return () => {
      disableDragSelection()
      unsubCreated()
      unsubUpdated()
      unsubRemoved()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavesurfer, regionsPlugin])

  return (
    <div className="waveform-track">
      <p className="waveform-track__label">{label}</p>
      <div ref={containerRef} className="waveform-track__canvas" />
      <p className="waveform-track__hint">
        波形をドラッグして範囲を選択すると無音化されます（ダブルクリックで削除）
      </p>
    </div>
  )
}
