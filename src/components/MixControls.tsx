import type { MixPreset } from '../audio/types'

interface MixControlsProps {
  preset: MixPreset
  onPresetChange: (preset: MixPreset) => void
}

const PRESETS: { value: MixPreset; label: string }[] = [
  { value: 'separate', label: 'A:左 / B:右で再生' },
  { value: 'together', label: 'A・B両方を左右から再生' },
]

export function MixControls({ preset, onPresetChange }: MixControlsProps) {
  return (
    <div className="mix-controls">
      {PRESETS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`mix-controls__button${preset === value ? ' mix-controls__button--active' : ''}`}
          onClick={() => onPresetChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
