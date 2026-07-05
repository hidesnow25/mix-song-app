import type { MixPreset } from '../audio/types'

interface MixControlsProps {
  preset: MixPreset
  onPresetChange: (preset: MixPreset) => void
}

const PRESETS: { value: MixPreset; label: string }[] = [
  { value: 'left', label: '左側からのみ再生' },
  { value: 'right', label: '右側からのみ再生' },
  { value: 'both', label: '左右から再生 (A:左 / B:右)' },
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
