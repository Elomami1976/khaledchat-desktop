// Khaled Chat: Settings → General (first name), Hardware and About.
import { useEffect, useState } from 'react'
import type { SystemInfo } from '../../../shared/types'
import { hob } from '../api'
import { t } from '../../../shared/i18n'
import { Heading, Row, Segmented } from '../screens/Settings'
import { BrandLogo } from './Welcome'
import { button } from './ui'

export const WEBSITE = 'https://khaledchat.com'
export const REPOSITORY = 'https://github.com/Elomami1976/khaledchat-desktop'
export const UPSTREAM = 'https://github.com/FrigadeHQ/hob'

/** the optional first name for the greeting: stored only in this computer's settings file */
export function FirstNameRow() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  useEffect(() => { void hob.settings.get().then((s) => { setValue(s.firstName ?? ''); setSaved(s.firstName ?? '') }) }, [])
  const save = (v: string) => void hob.settings.set({ firstName: v }).then((s) => {
    setValue(s.firstName); setSaved(s.firstName)
    window.dispatchEvent(new Event('kc-settings-changed'))
  })
  return (
    <Row label={t('Your first name')} help={t('Optional. Used only for the greeting, and kept on this computer.')} testId="settings-first-name">
      <div className="flex items-center gap-2">
        <input data-testid="first-name-input" value={value} maxLength={40} placeholder={t('First name')} aria-label={t('Your first name')}
          onChange={(e) => setValue(e.target.value)} onBlur={() => { if (value.trim() !== saved) save(value) }} onKeyDown={(e) => { if (e.key === 'Enter') save(value) }}
          className="w-40 rounded-control border border-line-strong bg-surface px-2 py-1 text-ui outline-none focus-visible:ring-2 focus-visible:ring-focus" />
        {saved && <button data-testid="first-name-clear" className="text-meta text-ink-soft underline underline-offset-2 hover:text-ink" onClick={() => save('')}>{t('Remove')}</button>}
      </div>
    </Row>
  )
}

const backendName = (b: string | null) => !b ? t('Not checked yet') : b === 'cpu' ? t('Processor only (no supported graphics acceleration found)') : b === 'cuda' ? 'NVIDIA CUDA' : b === 'vulkan' ? 'Vulkan' : b === 'metal' ? 'Apple Metal' : b
const gbText = (n: number | null | undefined) => (n == null ? t('Unknown') : t('{size} GB', { size: n.toFixed(1) }))

export function HardwareSettings() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  useEffect(() => { void hob.system.info().then(setInfo) }, [])
  if (!info) return <p className="text-meta text-muted">{t('Checking this computer…')}</p>
  return (
    <>
      <Heading>{t('This computer')}</Heading>
      <p className="mb-2 text-meta text-muted">{t('What Khaled Chat found when it checked this computer. Model recommendations are based on it.')}</p>
      <div data-testid="hardware-info">
        <Row label={t('System')}><span className="text-ui text-ink-soft">{`${info.os} ${info.osVersion} (${info.arch})`}</span></Row>
        <Row label={t('Processor')}><span className="text-ui text-ink-soft">{t('{name}, {count} threads', { name: info.cpuModel, count: info.logicalCores })}</span></Row>
        <Row label={t('Memory (RAM)')}><span className="text-ui text-ink-soft">{t('{total} total, {free} free now', { total: gbText(info.totalRamGB), free: gbText(info.freeRamGB) })}</span></Row>
        <Row label={t('Graphics')}><span className="text-ui text-ink-soft">{info.gpu ? (info.gpu.kind === 'none' || !info.gpu.name ? t('None the engine can use') : info.gpu.name) : t('Not checked yet')}</span></Row>
        <Row label={t('Graphics memory (VRAM)')}><span className="text-ui text-ink-soft">{info.gpu && info.gpu.kind !== 'none' && info.gpu.vramGB > 0 ? gbText(info.gpu.vramGB) : t('Not available')}</span></Row>
        <Row label={t('Acceleration')}><span data-testid="hardware-backend" className="text-ui text-ink-soft">{backendName(info.backend)}</span></Row>
        <Row label={t('Free disk space')}><span className="text-ui text-ink-soft">{gbText(info.freeDiskGB)}</span></Row>
      </div>
    </>
  )
}

export function AboutSettings() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  useEffect(() => { void hob.system.info().then(setInfo) }, [])
  const link = (href: string, label: string, testId: string) => <a data-testid={testId} href={href} target="_blank" rel="noreferrer" className="text-ui underline underline-offset-2 hover:text-ink">{label}</a>
  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3">
        <BrandLogo height={56} />
        <p className="text-body text-ink-soft">{t('Your AI. Your Device. Your Privacy.')}</p>
      </div>
      <Heading>{t('About')}</Heading>
      <div data-testid="about">
        <Row label={t('Version')}><span data-testid="about-version" className="text-ui text-ink-soft">{info ? `${info.appVersion} (Electron ${info.electron})` : '…'}</span></Row>
        <Row label={t('Website')}>{link(WEBSITE, 'khaledchat.com', 'about-website')}</Row>
        <Row label={t('Source code')}>{link(REPOSITORY, 'GitHub', 'about-repo')}</Row>
      </div>
      <Heading>{t('Licenses')}</Heading>
      <p data-testid="about-attribution" className="text-meta text-ink-soft">
        {t('Khaled Chat is free and open source under the MIT License. It is based on Hob by Frigade, also MIT licensed.')}{' '}
        {link(UPSTREAM, 'FrigadeHQ/hob', 'about-upstream')}
      </p>
      <p className="mt-2 text-meta text-muted">{t('Notices for the open-source components it includes are in the THIRD_PARTY_NOTICES file next to the app.')}</p>
      <div className="mt-4"><a href={`${REPOSITORY}/blob/main/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noreferrer" className={button.secondary}>{t('Open-source notices')}</a></div>
    </>
  )
}

/** simple chat: short prompt, no tools, quick thinking. Auto turns it on when there's no graphics acceleration */
export function ChatModeRow() {
  const [mode, setMode] = useState<'auto' | 'simple' | 'full'>('auto')
  const [on, setOn] = useState(false)
  useEffect(() => { void hob.settings.get().then((s) => { setMode(s.chatMode); setOn(s.simpleChat) }) }, [])
  const pick = (chatMode: 'auto' | 'simple' | 'full') => void hob.settings.set({ chatMode }).then((s) => { setMode(s.chatMode); setOn(s.simpleChat) })
  return (
    <Row testId="settings-chat-mode" label={t('Chat mode')}
      help={`${t('Simple answers much faster on older computers: no files, tools or web. Auto uses it when there is no graphics acceleration.')} ${on ? t('Simple chat is on now.') : t('Full chat is on now.')}`}>
      <Segmented<'auto' | 'simple' | 'full'> testId="chat-mode" value={mode} onChange={pick} options={[
        { id: 'auto', label: t('Auto') }, { id: 'simple', label: t('Simple') }, { id: 'full', label: t('Full') },
      ]} />
    </Row>
  )
}
