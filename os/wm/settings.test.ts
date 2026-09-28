import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  type Settings,
} from './settings'

describe('settings', () => {
  it('round-trips', () => {
    const settings: Settings = {
      wallpaper: 'ember',
      accent: 'violet',
      iconSize: 'large',
      showHidden: true,
    }
    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
  })

  it('ends with a newline, so cat reads it cleanly', () => {
    expect(serializeSettings(DEFAULT_SETTINGS).endsWith('\n')).toBe(true)
  })

  it('defaults to what the desktop looked like before settings existed', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.wallpaper).toBe('midnight')
  })

  /**
   * It is a dotfile in a writable filesystem — anything can `echo nonsense >`
   * it. A desktop that will not paint is a far worse failure than a lost accent
   * colour.
   */
  it('falls back entirely for a file that is not an object', () => {
    for (const text of ['', 'not json', '[1,2,3]', '"a string"', 'null']) {
      expect(parseSettings(text)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('falls back field by field, keeping the ones that are valid', () => {
    const text = '{"wallpaper":"ember","accent":"nope","iconSize":42,"showHidden":"yes"}'

    expect(parseSettings(text)).toEqual({
      wallpaper: 'ember',
      accent: DEFAULT_SETTINGS.accent,
      iconSize: DEFAULT_SETTINGS.iconSize,
      showHidden: DEFAULT_SETTINGS.showHidden,
    })
  })

  it('ignores keys it does not know', () => {
    expect(parseSettings('{"wallpaper":"ink","somethingElse":true}')).toEqual({
      ...DEFAULT_SETTINGS,
      wallpaper: 'ink',
    })
  })

  // Half-written JSON is what a save mid-keystroke looks like.
  it('survives a truncated file', () => {
    expect(parseSettings('{"wallpaper":"ink"')).toEqual(DEFAULT_SETTINGS)
  })
})
