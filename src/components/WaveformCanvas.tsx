import { useEffect, useMemo, useRef, useState } from 'react'
import { computePeaks } from '../audio/peaks'

export interface ColoredRegion {
  start: number
  end: number
  color: string
}

interface WaveformCanvasProps {
  label: string
  samples: Float32Array | null
  duration: number
  regions?: ColoredRegion[]
  playheadPosition?: number | null
  height?: number
}

const WAVE_COLOR = '#8b5cf6'
const PLAYHEAD_COLOR = '#ef4444'

export function WaveformCanvas({
  label,
  samples,
  duration,
  regions = [],
  playheadPosition = null,
  height = 96,
}: WaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.max(0, Math.round(entries[0].contentRect.width)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const peaks = useMemo(() => {
    if (!samples || width === 0) return []
    return computePeaks(samples, width)
  }, [samples, width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    if (duration > 0) {
      for (const region of regions) {
        const x1 = (region.start / duration) * width
        const x2 = (region.end / duration) * width
        ctx.fillStyle = region.color
        ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height)
      }
    }

    ctx.fillStyle = WAVE_COLOR
    const mid = height / 2
    for (let x = 0; x < peaks.length; x++) {
      const { min, max } = peaks[x]
      const y1 = mid - max * mid
      const y2 = mid - min * mid
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }

    if (playheadPosition != null && duration > 0) {
      const x = (playheadPosition / duration) * width
      ctx.fillStyle = PLAYHEAD_COLOR
      ctx.fillRect(x, 0, 2, height)
    }
  }, [peaks, width, height, regions, playheadPosition, duration])

  return (
    <div className="waveform-canvas">
      <p className="waveform-canvas__label">{label}</p>
      <div ref={containerRef} className="waveform-canvas__container">
        <canvas ref={canvasRef} className="waveform-canvas__canvas" />
      </div>
    </div>
  )
}
