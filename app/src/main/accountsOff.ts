/**
 * Khaled Chat: no Google or Microsoft sign-in. Hob's calendar-and-email accounts feature needs an OAuth app
 * registration (client ID) owned by whoever ships the app; Khaled Chat has none and must never require an account.
 * This stands in for Accounts: nothing is offered, nothing is read from a saved accounts file, nothing is
 * refreshed, and signing in is refused. The Accounts code stays in the tree, unused, to keep upstream merges simple.
 */
import type { AccountsLike } from './accounts'

export const ACCOUNTS_DISABLED_MESSAGE = 'Khaled Chat does not use online accounts.'

export function accountsOff(): AccountsLike {
  return {
    available: () => [],
    current: () => undefined,
    signIn: async () => { throw new Error(ACCOUNTS_DISABLED_MESSAGE) },
    cancelSignIn: () => {},
    signOut: () => {},
    calMail: () => undefined,
  }
}
