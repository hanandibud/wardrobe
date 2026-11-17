import { Archive, Download, LoaderCircle, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { downloadBackup, importBackup } from '../lib/backup'
import { isQuotaError } from '../lib/storage'
import { StorageStatus } from './StorageStatus'

interface BackupPanelProps {
  itemCount: number
}

interface Status {
  tone: 'success' | 'error'
  message: string
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function BackupPanel({ itemCount }: BackupPanelProps) {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    if (busy) return

    setBusy('export')
    setStatus(null)

    try {
      const count = await downloadBackup()
      setStatus({
        tone: 'success',
        message: `Backed up ${countLabel(count, 'piece', 'pieces')}. Keep the file somewhere safe.`,
      })
    } catch {
      setStatus({
        tone: 'error',
        message: 'Could not create the backup. Try again.',
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return

    setBusy('import')
    setStatus(null)

    try {
      const result = await importBackup(file)
      const details: string[] = []

      if (result.duplicates > 0) {
        details.push(`${countLabel(result.duplicates, 'piece', 'pieces')} already here`)
      }
      if (result.skipped > 0) {
        details.push(`${countLabel(result.skipped, 'piece was', 'pieces were')} skipped`)
      }

      if (result.imported > 0) {
        setStatus({
          tone: 'success',
          message: `Imported ${countLabel(result.imported, 'piece', 'pieces')}${
            details.length > 0 ? ` (${details.join(', ')})` : ''
          }.`,
        })
      } else if (result.duplicates > 0 && result.skipped === 0) {
        setStatus({
          tone: 'success',
          message: 'Everything in that backup is already here.',
        })
      } else {
        setStatus({
          tone: 'error',
          message: `No pieces were imported${details.length > 0 ? `: ${details.join(', ')}` : '.'}`,
        })
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        message: isQuotaError(error)
          ? 'This browser is out of storage. Export a backup, remove a few pieces or free space, then try again.'
          : error instanceof Error
            ? error.message
            : 'Could not import that backup.',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      aria-labelledby="backup-title"
      className="rounded-3xl border border-line/80 bg-card/60 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest/10 text-forest">
            <Archive className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
              Backup
            </p>
            <h2
              id="backup-title"
              className="mt-1.5 font-display text-2xl leading-tight tracking-tight text-ink"
            >
              Keep a copy of your wardrobe
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Export every piece and photo as one JSON file. Import it on another
              device or after clearing browser data. Importing keeps the pieces you
              already have.
            </p>
          </div>
        </div>

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy !== null || itemCount === 0}
            title={itemCount === 0 ? 'Add a piece first' : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-paper transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'export' ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {busy === 'export' ? 'Exporting…' : 'Export backup'}
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'import' ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {busy === 'import' ? 'Importing…' : 'Import backup'}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImport(event)}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a wardrobe backup file"
          />
        </div>
      </div>

      {status && (
        <p
          role={status.tone === 'error' ? 'alert' : 'status'}
          className={[
            'mt-5 rounded-xl border px-4 py-3 text-sm',
            status.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900',
          ].join(' ')}
        >
          {status.message}
        </p>
      )}

      <StorageStatus itemCount={itemCount} />
    </section>
  )
}
