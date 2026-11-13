/**
 * Khaled Chat: is this IPC request from the app's own window (its main frame showing the app's page), and not from
 * another frame or web contents that could reach IPC? Every IPC handler checks this (security.ts guardIpc).
 * isOwnPage, when given, is the exact rule for the app's page (security.ts isAppUrl); without it, any file:// page
 * or the dev server counts.
 */
export function fromAppWindow(
  e: { sender: unknown; senderFrame?: { url: string; parent?: unknown } | null },
  win: { webContents: unknown } | undefined,
  devUrl: string | undefined = process.env.ELECTRON_RENDERER_URL,
  isOwnPage?: (url: string) => boolean,
): boolean {
  if (!win || e.sender !== win.webContents) return false
  // sub-frames never get the preload, but check anyway: only the top frame is the app
  if (e.senderFrame?.parent) return false
  const url = e.senderFrame?.url ?? ''
  if (isOwnPage) return isOwnPage(url)
  return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
}
