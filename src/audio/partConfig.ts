// Pure (DOM-free) serialization/validation for the part-splitting share file.
// The audio itself can't be redistributed (rights), so this file carries only
// metadata: which file name was registered to which A-F slot, each recorded
// segment's time range, and which files each segment includes. Someone who
// owns the same audio files can register them in the same slots, import this
// file, and reproduce the identical mix.

import { TRACK_ORDER, type TrackId } from './trackIds'
import type { Segment } from './render'

export interface PartConfigTrack {
  id: TrackId
  fileName: string
}

export interface PartConfig {
  compensated: boolean
  tracks: PartConfigTrack[]
  parts: Segment[]
}

export const PART_CONFIG_TYPE = 'mix-song-app/part-config'
export const PART_CONFIG_VERSION = 1

// Committed parts may butt up against each other exactly; only flag genuine
// overlaps beyond float noise.
const OVERLAP_EPSILON = 1e-6

export function serializePartConfig(config: PartConfig): string {
  return JSON.stringify(
    {
      type: PART_CONFIG_TYPE,
      version: PART_CONFIG_VERSION,
      compensated: config.compensated,
      tracks: config.tracks,
      parts: config.parts,
    },
    null,
    2,
  )
}

export type ParsePartConfigResult = { ok: true; config: PartConfig } | { ok: false; error: string }

function isTrackId(value: unknown): value is TrackId {
  return typeof value === 'string' && (TRACK_ORDER as string[]).includes(value)
}

export function parsePartConfig(text: string): ParsePartConfigResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: '設定ファイルをJSONとして読み込めませんでした。' }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '設定ファイルの形式が不正です。' }
  }
  const data = raw as Record<string, unknown>

  if (data.type !== PART_CONFIG_TYPE) {
    return { ok: false, error: 'このアプリのパート分け設定ファイルではありません。' }
  }
  if (typeof data.version !== 'number' || data.version > PART_CONFIG_VERSION) {
    return { ok: false, error: '新しいバージョンで作成された設定ファイルのため読み込めません。' }
  }
  if (typeof data.compensated !== 'boolean') {
    return { ok: false, error: '設定ファイルの形式が不正です（compensated）。' }
  }

  if (!Array.isArray(data.tracks)) {
    return { ok: false, error: '設定ファイルの形式が不正です（tracks）。' }
  }
  const tracks: PartConfigTrack[] = []
  const trackIds = new Set<TrackId>()
  for (const item of data.tracks) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: '設定ファイルの形式が不正です（tracks）。' }
    }
    const t = item as Record<string, unknown>
    if (!isTrackId(t.id) || typeof t.fileName !== 'string' || t.fileName === '') {
      return { ok: false, error: '設定ファイルの形式が不正です（tracks）。' }
    }
    if (trackIds.has(t.id)) {
      return { ok: false, error: `設定ファイル内で音声ファイル ${t.id} が重複しています。` }
    }
    trackIds.add(t.id)
    tracks.push({ id: t.id, fileName: t.fileName })
  }

  if (!Array.isArray(data.parts)) {
    return { ok: false, error: '設定ファイルの形式が不正です（parts）。' }
  }
  const parts: Segment[] = []
  for (const item of data.parts) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: '設定ファイルの形式が不正です（parts）。' }
    }
    const p = item as Record<string, unknown>
    if (typeof p.start !== 'number' || !Number.isFinite(p.start) || p.start < 0) {
      return { ok: false, error: '設定ファイルの形式が不正です（区間の始点）。' }
    }
    if (typeof p.end !== 'number' || !Number.isFinite(p.end) || p.end <= p.start) {
      return { ok: false, error: '設定ファイルの形式が不正です（区間の終点）。' }
    }
    if (!Array.isArray(p.includedTracks) || !p.includedTracks.every(isTrackId)) {
      return { ok: false, error: '設定ファイルの形式が不正です（区間の取り込みファイル）。' }
    }
    const included = [...new Set(p.includedTracks as TrackId[])]
    if (!included.every((id) => trackIds.has(id))) {
      return { ok: false, error: '設定ファイルの区間が、登録されていない音声ファイルを参照しています。' }
    }
    parts.push({ start: p.start, end: p.end, includedTracks: included })
  }

  parts.sort((a, b) => a.start - b.start)
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].start < parts[i - 1].end - OVERLAP_EPSILON) {
      return { ok: false, error: '設定ファイル内で区間同士が重なっています。' }
    }
  }

  return { ok: true, config: { compensated: data.compensated, tracks, parts } }
}

export interface TrackAssignmentDiff {
  /** In the config but no file is loaded at that slot. */
  missing: PartConfigTrack[]
  /** Loaded at the right slot but under a different file name. */
  renamed: { id: TrackId; expected: string; actual: string }[]
  /** Loaded but not part of the config. */
  extra: PartConfigTrack[]
}

export function diffTrackAssignments(
  configTracks: PartConfigTrack[],
  loadedTracks: PartConfigTrack[],
): TrackAssignmentDiff {
  const loadedById = new Map(loadedTracks.map((t) => [t.id, t.fileName]))
  const configById = new Map(configTracks.map((t) => [t.id, t.fileName]))

  const missing = configTracks.filter((t) => !loadedById.has(t.id))
  const renamed = configTracks
    .filter((t) => loadedById.has(t.id) && loadedById.get(t.id) !== t.fileName)
    .map((t) => ({ id: t.id, expected: t.fileName, actual: loadedById.get(t.id)! }))
  const extra = loadedTracks.filter((t) => !configById.has(t.id))

  return { missing, renamed, extra }
}
