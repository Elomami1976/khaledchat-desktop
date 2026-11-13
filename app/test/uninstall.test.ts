import { describe, expect, it } from 'vitest'
import { removalPlan } from '../src/main/uninstall'

const base = { packaged: true, profile: false, appImage: undefined, data: '/Users/sam/Library/Application Support/Khaled Chat' }
const win = { ...base, platform: 'win32' as const, data: 'C:\\Users\\sam\\AppData\\Roaming\\Khaled Chat', downloads: 'C:\\Users\\sam\\AppData\\Roaming\\Khaled Chat', execPath: 'C:\\Users\\sam\\AppData\\Local\\Programs\\hob\\Khaled Chat.exe' }

describe('removalPlan', () => {
  it('on a Mac, deletes the data and moves Khaled Chat.app to the Trash', () => {
    expect(removalPlan({ ...base, downloads: base.data, platform: 'darwin', execPath: '/Applications/Khaled Chat.app/Contents/MacOS/Khaled Chat' }))
      .toEqual({ folders: [base.data], app: '/Applications/Khaled Chat.app' })
  })

  it('on Windows, runs Khaled Chat’s own uninstaller, which also deletes the data', () => {
    expect(removalPlan(win)).toEqual({ folders: [], uninstaller: 'C:\\Users\\sam\\AppData\\Local\\Programs\\hob\\Uninstall Khaled Chat.exe' })
  })

  it('models saved on another drive go too (the uninstaller only knows app data)', () => {
    expect(removalPlan({ ...win, downloads: 'D:\\Khaled Chat' })).toEqual({ folders: ['D:\\Khaled Chat'], uninstaller: 'C:\\Users\\sam\\AppData\\Local\\Programs\\hob\\Uninstall Khaled Chat.exe' })
    expect(removalPlan({ ...base, platform: 'linux', data: '/home/sam/.config/Khaled Chat', downloads: '/mnt/big/Khaled Chat', execPath: '/tmp/.mount_HobXYZ/hob', appImage: '/home/sam/Apps/Khaled Chat.AppImage' }))
      .toEqual({ folders: ['/home/sam/.config/Khaled Chat', '/mnt/big/Khaled Chat'], app: '/home/sam/Apps/Khaled Chat.AppImage' })
  })

  it('on Linux, deletes the data and the AppImage', () => {
    expect(removalPlan({ ...base, platform: 'linux', data: '/home/sam/.config/Khaled Chat', downloads: '/home/sam/.config/Khaled Chat', execPath: '/tmp/.mount_HobXYZ/hob', appImage: '/home/sam/Apps/Khaled Chat-linux-x86_64.AppImage' }))
      .toEqual({ folders: ['/home/sam/.config/Khaled Chat'], app: '/home/sam/Apps/Khaled Chat-linux-x86_64.AppImage' })
  })

  it('in development or a separate profile, deletes only the data, never the app', () => {
    expect(removalPlan({ ...win, packaged: false, execPath: 'C:\\dev\\electron.exe' })).toEqual({ folders: [win.data] })
    expect(removalPlan({ ...base, downloads: base.data, profile: true, platform: 'darwin', execPath: '/Applications/Khaled Chat.app/Contents/MacOS/Khaled Chat' })).toEqual({ folders: [base.data] })
  })
})
