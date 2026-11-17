export interface StorageUsage {
  supported: boolean
  usage: number
  quota: number
  percent: number
  persisted: boolean
}

export async function getStorageUsage(): Promise<StorageUsage> {
  if (!navigator.storage?.estimate) {
    return {
      supported: false,
      usage: 0,
      quota: 0,
      percent: 0,
      persisted: false,
    }
  }

  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted
      ? navigator.storage.persisted().catch(() => false)
      : Promise.resolve(false),
  ])

  const usage = estimate.usage ?? 0
  const quota = estimate.quota ?? 0

  return {
    supported: true,
    usage,
    quota,
    percent: quota > 0 ? Math.min(100, (usage / quota) * 100) : 0,
    persisted,
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false

  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 || value >= 10 ? 0 : 1

  return `${value.toFixed(digits)} ${units[exponent]}`
}

export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const name =
    'name' in error ? String((error as { name?: unknown }).name) : ''

  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}
