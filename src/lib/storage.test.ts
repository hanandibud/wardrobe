import { describe, expect, it } from 'vitest'
import { formatBytes, isQuotaError } from './storage'

describe('formatBytes', () => {
  it('reports nothing used as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('treats invalid or negative sizes as 0 B', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  it('keeps bytes as whole numbers', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('shows one decimal place below ten units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('drops the decimal at ten units and above', () => {
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(16 * 1024 * 1024)).toBe('16 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
  })

  it('does not go past terabytes', () => {
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB')
    expect(formatBytes(1024 ** 5)).toBe('1024 TB')
  })
})

describe('isQuotaError', () => {
  it('recognises the standard quota error', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
  })

  it('recognises the Firefox quota error', () => {
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
  })

  it('recognises a real DOMException', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isQuotaError(new Error('DatabaseClosedError'))).toBe(false)
    expect(isQuotaError({ name: 'DatabaseClosedError' })).toBe(false)
    expect(isQuotaError({})).toBe(false)
  })

  it('ignores values that are not objects', () => {
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
    expect(isQuotaError('QuotaExceededError')).toBe(false)
    expect(isQuotaError(new Error('QuotaExceededError'))).toBe(false)
  })
})
