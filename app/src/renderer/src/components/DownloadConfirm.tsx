import { useEffect, useRef, useState } from 'react'
import { button, Dialog } from './ui'
import { t } from '../../../shared/i18n'
import type { DownloadInfo } from '../../../shared/types'
import { hob } from '../api'

/**
 * Khaled Chat: the one way a download starts. Shows what would be downloaded (name, size or a labelled estimate,
 * source, destination, license) and asks. Guards against a stray click: focus starts on Cancel, and the download
 * button only works ACTIVATION_DELAY_MS after the dialog appears. The OK goes to the main process
 * (downloads.approve), which won't download anything without it.
 */
export const ACTIVATION_DELAY_MS = 1200

type Pending = { key: string; resolve(yes: boolean): void }
let show: ((p: Pending) => void) | undefined

/** resolves true once the person confirmed and the main process accepted the OK; false otherwise */
export function confirmDownload(key: string): Promise<boolean> {
  return new Promise((resolve) => { if (show) show({ key, resolve }); else resolve(false) })
}

const size = (gb: number) => (gb >= 1 ? t('{size} GB', { size: gb.toFixed(2) }) : t('{size} MB', { size: Math.max(1, Math.round(gb * 1000)) }))

/** rendered once in each top-level screen (onboarding and the app) */
export function DownloadConfirmHost() {
  const [p, setP] = useState<Pending | null>(null)
  useEffect(() => { show = setP; return () => { show = undefined } }, [])
  if (!p) return null
  return <DownloadConfirmDialog key={p.key} pending={p} onDone={() => setP(null)} />
}

function DownloadConfirmDialog({ pending, onDone }: { pending: Pending; onDone(): void }) {
  const [info, setInfo] = useState<DownloadInfo | { error: string } | null>(null)
  const [armed, setArmed] = useState(false)
  const shownAt = useRef(performance.now())
  const settled = useRef(false)
  const finish = (yes: boolean) => {
    if (settled.current) return
    settled.current = true
    pending.resolve(yes)
    onDone()
  }
  useEffect(() => { void hob.downloads.info(pending.key).then(setInfo) }, [pending.key])
  // the button only works after the delay, counted from when the details are on screen
  useEffect(() => {
    if (!info || 'error' in info) return
    shownAt.current = performance.now()
    const timer = setTimeout(() => setArmed(true), ACTIVATION_DELAY_MS)
    return () => clearTimeout(timer)
  }, [info])

  const confirm = async (e: React.MouseEvent) => {
    // ignore clicks that land before the delay, even if the button rendered enabled
    if (!armed || performance.now() - shownAt.current < ACTIVATION_DELAY_MS || !e.isTrusted) return
    if (!info || 'error' in info) return
    finish(await hob.downloads.approve(info.key))
  }

  const title = t('Download {name}?', { name: info && !('error' in info) ? info.name : t('this') })
  return (
    <div className="relative z-50">
      <Dialog title={title} onClose={() => finish(false)} testId="download-confirm">
        {!info && <p className="text-ui text-muted">{t('Checking…')}</p>}
        {info && 'error' in info && <p data-testid="download-confirm-error" className="text-ui text-ink-soft">{info.error}</p>}
        {info && !('error' in info) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-ui">
            <dt className="text-muted">{t('Download')}</dt>
            <dd data-testid="download-confirm-name">{info.name}</dd>
            <dt className="text-muted">{t('Size')}</dt>
            <dd data-testid="download-confirm-size">
              {info.sizeEstimated ? t('About {size} (estimate)', { size: size(info.sizeGB) }) : size(info.sizeGB)}
              {info.partialGB ? <span className="text-muted"> · {t('{size} already downloaded; it continues from there', { size: size(info.partialGB) })}</span> : null}
            </dd>
            <dt className="text-muted">{t('From')}</dt>
            <dd data-testid="download-confirm-source" className="break-all">{info.sources.join(', ')}</dd>
            <dt className="text-muted">{t('Saved to')}</dt>
            <dd data-testid="download-confirm-destination" className="break-all">{info.destination}</dd>
            <dt className="text-muted">{t('License')}</dt>
            <dd data-testid="download-confirm-license">{info.license ?? t('Not stated')}</dd>
          </dl>
        )}
        {info && !('error' in info) && info.parts.length > 0 && (
          <details className="mt-3 text-meta text-ink-soft">
            <summary className="cursor-pointer">{t('Files')} ({info.parts.length})</summary>
            <ul className="mt-2 space-y-1">
              {info.parts.map((part) => (
                <li key={part.name} className="break-all"><span className="text-ink">{part.name}</span>{part.sizeGB !== undefined ? ` · ${size(part.sizeGB)}` : ''}{part.license ? ` · ${part.license}` : ''}<br /><span className="text-muted">{part.source}</span></li>
              ))}
            </ul>
          </details>
        )}
        {info && !('error' in info) && info.note && <p className="mt-3 text-meta text-muted">{info.note}</p>}
        <p className="mt-3 text-meta text-muted">{t('Nothing is downloaded unless you choose Download. You can cancel while it downloads.')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button data-testid="download-confirm-cancel" autoFocus className={button.quiet} onClick={() => finish(false)}>{t('Cancel')}</button>
          <button data-testid="download-confirm-ok" className={button.primary} disabled={!armed || !info || 'error' in info}
            aria-disabled={!armed} onClick={(e) => void confirm(e)}>{t('Download')}</button>
        </div>
      </Dialog>
    </div>
  )
}
