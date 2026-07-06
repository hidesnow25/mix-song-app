import { describe, it, expect } from 'vitest'
import {
  serializePartConfig,
  parsePartConfig,
  diffTrackAssignments,
  PART_CONFIG_TYPE,
  PART_CONFIG_VERSION,
  type PartConfig,
} from './partConfig'

const VALID_CONFIG: PartConfig = {
  compensated: true,
  tracks: [
    { id: 'A', fileName: 'voice-a.wav' },
    { id: 'B', fileName: 'voice-b.wav' },
    { id: 'C', fileName: 'voice-c.wav' },
  ],
  parts: [
    { start: 0, end: 12.5, includedTracks: ['A', 'C'] },
    { start: 12.5, end: 30, includedTracks: ['A', 'B', 'C'] },
  ],
}

describe('serializePartConfig / parsePartConfig', () => {
  it('round-trips a config unchanged', () => {
    const result = parsePartConfig(serializePartConfig(VALID_CONFIG))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config).toEqual(VALID_CONFIG)
  })

  it('embeds the type marker and version', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    expect(raw.type).toBe(PART_CONFIG_TYPE)
    expect(raw.version).toBe(PART_CONFIG_VERSION)
  })

  it('rejects non-JSON input', () => {
    const result = parsePartConfig('not json at all {')
    expect(result.ok).toBe(false)
  })

  it('rejects JSON without the type marker (some unrelated file)', () => {
    const result = parsePartConfig(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
  })

  it('rejects a config from a newer file version', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.version = PART_CONFIG_VERSION + 1
    expect(parsePartConfig(JSON.stringify(raw)).ok).toBe(false)
  })

  it('rejects an invalid track id', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.tracks[0].id = 'Z'
    expect(parsePartConfig(JSON.stringify(raw)).ok).toBe(false)
  })

  it('rejects duplicate track ids', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.tracks[1].id = 'A'
    expect(parsePartConfig(JSON.stringify(raw)).ok).toBe(false)
  })

  it('rejects a part whose end is not after its start', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.parts[0].end = raw.parts[0].start
    expect(parsePartConfig(JSON.stringify(raw)).ok).toBe(false)
  })

  it('rejects a part referencing a file not registered in the config', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.parts[0].includedTracks = ['A', 'F']
    expect(parsePartConfig(JSON.stringify(raw)).ok).toBe(false)
  })

  it('rejects overlapping parts', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.parts[1].start = raw.parts[0].end - 1
    expect(parsePartConfig(JSON.stringify(raw)).ok).toBe(false)
  })

  it('accepts an empty parts list (nothing recorded yet)', () => {
    const result = parsePartConfig(serializePartConfig({ ...VALID_CONFIG, parts: [] }))
    expect(result.ok).toBe(true)
  })

  it('sorts parts by start time so restore logic can rely on order', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.parts.reverse()
    const result = parsePartConfig(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.parts[0].start).toBe(0)
      expect(result.config.parts[1].start).toBe(12.5)
    }
  })

  it('dedupes repeated ids within a part instead of rejecting', () => {
    const raw = JSON.parse(serializePartConfig(VALID_CONFIG))
    raw.parts[0].includedTracks = ['A', 'A', 'C']
    const result = parsePartConfig(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.parts[0].includedTracks).toEqual(['A', 'C'])
  })
})

describe('diffTrackAssignments', () => {
  const configTracks = VALID_CONFIG.tracks

  it('reports no differences for an exact match', () => {
    const diff = diffTrackAssignments(configTracks, [...configTracks])
    expect(diff.missing).toEqual([])
    expect(diff.renamed).toEqual([])
    expect(diff.extra).toEqual([])
  })

  it('reports config tracks with no file loaded at that slot', () => {
    const diff = diffTrackAssignments(configTracks, configTracks.slice(0, 2))
    expect(diff.missing).toEqual([{ id: 'C', fileName: 'voice-c.wav' }])
  })

  it('reports a slot loaded under a different file name', () => {
    const loaded = [configTracks[0], { id: 'B' as const, fileName: 'other.wav' }, configTracks[2]]
    const diff = diffTrackAssignments(configTracks, loaded)
    expect(diff.renamed).toEqual([{ id: 'B', expected: 'voice-b.wav', actual: 'other.wav' }])
  })

  it('reports loaded tracks the config does not know about', () => {
    const loaded = [...configTracks, { id: 'D' as const, fileName: 'voice-d.wav' }]
    const diff = diffTrackAssignments(configTracks, loaded)
    expect(diff.extra).toEqual([{ id: 'D', fileName: 'voice-d.wav' }])
  })
})
