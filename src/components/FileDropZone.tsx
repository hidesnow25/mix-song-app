import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'

interface FileDropZoneProps {
  label: string
  file: File | null
  onFileSelected: (file: File) => void
}

export function FileDropZone({ label, file, onFileSelected }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped) onFileSelected(dropped)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) onFileSelected(selected)
  }

  return (
    <div
      className={`drop-zone${isDragOver ? ' drop-zone--active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
    >
      <p className="drop-zone__label">{label}</p>
      <p className="drop-zone__hint">{file ? file.name : 'ドラッグ&ドロップ、またはクリックしてファイルを選択'}</p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
