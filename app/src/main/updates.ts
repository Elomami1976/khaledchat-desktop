/**
 * Khaled Chat: automatic updates are off. Hob updated itself from FrigadeHQ's GitHub Releases (electron-updater:
 * a check 30 s after start and every 4 hours, then a silent download and install on quit). Khaled Chat makes no
 * update check, download or install, and never contacts FrigadeHQ for one. A user-started check against Khaled
 * Chat's own releases can come later; until then people update by installing a new version themselves.
 */
export function updatesOn(_o: { packaged: boolean; fake: boolean; profile: boolean; platform: NodeJS.Platform; appImage: boolean }): boolean {
  return false
}
