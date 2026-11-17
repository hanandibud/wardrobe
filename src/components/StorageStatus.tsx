import { HardDrive, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  formatBytes,
  getStorageUsage,
  requestPersistentStorage,
  type StorageUsage,
} from '../lib/storage'

interface StorageStatusProps {
  itemCount: number
}

export function StorageStatus({ itemCount }: StorageStatusProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [failed, setFailed] = useState(false)
  const [persisting, setPersisting] = useState(false)
  const [persistMessage, setPersistMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    getStorageUsage()
      .then((next) => {
        if (!active) return
        setUsage(next)
        setFailed(false)
      })
      .catch(() => {
        if (!active) return
        setFailed(true)
      })

    return () => {
      active = false
    }
  }, [itemCount])

  async function handlePersist() {
    setPersisting(true)
    setPersistMessage(null)

    try {
      const granted = await requestPersistentStorage()
      setPersistMessage(
        granted
          ? 'This browser will keep your wardrobe unless you clear site data.'
          : 'The browser did not grant persistent storage. Keep a backup.',
      )
      setUsage(await getStorageUsage())
    } catch {
      setPersistMessage('Could not request persistent storage.')
    } finally {
      setPersisting(false)
    }
  }

  const loading = usage === null && !failed
  const supported = usage?.supported ?? false
  const percent = usage?.percent ?? 0
  const warning = supported && percent >= 85

  return (
    <div className="mt-6 border-t border-line/70 pt-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-muted">
            <HardDrive className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-xs font-medium text-ink">Local storage</p>
            {loading && (
              <p className="mt-1 text-xs text-muted">Checking this browser…</p>
            )}
            {failed && (
              <p className="mt-1 text-xs text-muted">
                Could not read storage usage.
              </p>
            )}
            {usage && !usage.supported && (
              <p className="mt-1 text-xs text-muted">
                This browser does not report storage usage.
              </p>
            )}
            {usage && usage.supported && (
              <p className="mt-1 text-xs text-muted">
                {formatBytes(usage.usage)} of {formatBytes(usage.quota)} used
              </p>
            )}
          </div>
        </div>

        {usage && usage.supported && (
          <button
            type="button"
            onClick={() => void handlePersist()}
            disabled={persisting || usage.persisted}
            title={
              usage.persisted
                ? 'This browser will keep the wardrobe unless you clear site data.'
                : undefined
            }
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-line bg-card px-3 py-2 text-[11px] font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-70"
          >
            {persisting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {usage.persisted
              ? 'Kept by browser'
              : persisting
                ? 'Requesting…'
                : 'Protect local data'}
          </button>
        )}
      </div>

      {usage && usage.supported && (
        <div
          role="progressbar"
          aria-label="Local storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/70"
        >
          <div
            className={[
              'h-full rounded-full transition-[width] duration-500',
              warning ? 'bg-red-600' : 'bg-forest',
            ].join(' ')}
            style={{ width: `${Math.max(1, Math.min(100, percent))}%` }}
          />
        </div>
      )}

      {warning && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
        >
          Storage is getting full. Export a backup, then remove a few pieces or
          free space in this browser.
        </p>
      )}

      {persistMessage && (
        <p role="status" className="mt-3 text-xs leading-5 text-muted">
          {persistMessage}
        </p>
      )}
    </div>
  )
}
