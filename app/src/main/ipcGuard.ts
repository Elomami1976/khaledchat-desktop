/**
 * Khaled Chat: is this IPC request from the app's own window (its main frame showing the app's page), and not from
 * another frame or web contents that could reach IPC? Used for the one call that grants a download.
 */
export function fromAppWindow(
  e: { sender: unknown; senderFrame?: { url: string } | null },
  win: { webContents: unknown } | undefined,
  devUrl: string | undefined = process.env.ELECTRON_RENDERER_URL,
): boolean {
  if (!win || e.sender !== win.webContents) return false
  const url = e.senderFrame?.url ?? ''
  return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
}
