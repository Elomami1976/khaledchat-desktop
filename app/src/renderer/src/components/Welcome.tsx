// Khaled Chat: the official logo and a greeting by local time, with the optional first name (Settings → General).
import { useEffect, useState } from 'react'
import logoLight from '../assets/brand/logo-light-web.svg'
import logoDark from '../assets/brand/logo-dark-web.svg'
import iconUrl from '../assets/brand/khaled-chat-icon.svg'
import { t } from '../../../shared/i18n'
import { greeting } from '../../../shared/greeting'
import { hob } from '../api'

/** The approved Khaled Chat logo, light or dark to match the theme. */
export function BrandLogo({ height = 56, className = '' }: { height?: number; className?: string }) {
  return (
    <span data-testid="brand-logo" className={`hob-mascot inline-block ${className}`} role="img" aria-label="Khaled Chat">
      <img src={logoLight} alt="" style={{ height }} className="block dark:hidden" draggable={false} />
      <img src={logoDark} alt="" style={{ height }} className="hidden dark:block" draggable={false} />
    </span>
  )
}

/** The K app icon, for small places (the status bar). */
export function BrandIcon({ size = 20 }: { size?: number }) {
  return <img data-testid="brand-icon" src={iconUrl} alt="" aria-hidden width={size * 200 / 224} height={size} draggable={false} />
}

export function useFirstName(): string {
  const [name, setName] = useState('')
  useEffect(() => {
    let live = true
    const load = () => void hob.settings.get().then((s) => { if (live) setName(s.firstName ?? '') })
    load()
    window.addEventListener('kc-settings-changed', load)
    return () => { live = false; window.removeEventListener('kc-settings-changed', load) }
  }, [])
  return name
}

export function Welcome({ seed }: { seed: number }) {
  const firstName = useFirstName()
  const [now, setNow] = useState(() => new Date())
  // the greeting follows the clock if the window stays open across morning → afternoon
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id) }, [])
  const g = greeting(now, firstName, seed)
  return (
    <>
      <div className="mb-6 flex justify-center"><BrandLogo height={64} /></div>
      <h1 data-testid="welcome-greeting" className="text-[clamp(24px,4vw,32px)] font-semibold leading-[1.2] tracking-[-.6px]">
        {g.name ? t(g.key, { name: g.name }) : t(g.key)}
      </h1>
      <p data-testid="welcome-secondary" className="mt-2 text-[14px] leading-[22px] text-ink-soft">{t(g.secondary)}</p>
    </>
  )
}
