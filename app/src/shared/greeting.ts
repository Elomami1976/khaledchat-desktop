/** Khaled Chat: the welcome greeting, from the computer's local time and the optional first name. */
import { msg } from './i18n'

export type DayPart = 'morning' | 'afternoon' | 'evening'

/** 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

const WITH_NAME: Record<DayPart, string> = {
  morning: msg('Good morning, {name}.'),
  afternoon: msg('Good afternoon, {name}.'),
  evening: msg('Good evening, {name}.'),
}
const WITHOUT_NAME: Record<DayPart, string> = {
  morning: msg('Good morning.'),
  afternoon: msg('Good afternoon.'),
  evening: msg('Good evening.'),
}
export const SECONDARY = [
  msg('How can I help today?'),
  msg("What's on your mind?"),
  msg('Ready when you are.'),
  msg('What shall we work on?'),
  msg('Ask anything. It stays on this computer.'),
]

/** English keys for t(): the headline and a secondary line that changes from day to day (and visit to visit via seed) */
export function greeting(now: Date, firstName: string | undefined, seed = 0): { key: string; name?: string; secondary: string } {
  const part = dayPart(now.getHours())
  const name = firstName?.trim()
  const day = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000)
  const secondary = SECONDARY[Math.abs(day + seed) % SECONDARY.length]
  return name ? { key: WITH_NAME[part], name, secondary } : { key: WITHOUT_NAME[part], secondary }
}
