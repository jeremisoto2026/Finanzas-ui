import { Capacitor, registerPlugin } from '@capacitor/core'

const LocalCaptures = registerPlugin('LocalCaptures')

export const isFinanzasAndroid = () => Capacitor.getPlatform() === 'android'

export async function getLocalCaptureState() {
  if (!isFinanzasAndroid()) {
    return {
      available: false,
      permissionEnabled: false,
      captures: [],
      syncEnabled: false,
    }
  }

  return LocalCaptures.getCaptureState()
}

export async function openNotificationAccessSettings() {
  if (!isFinanzasAndroid()) {
    throw new Error('Esta función está disponible en la aplicación Android.')
  }
  return LocalCaptures.openNotificationSettings()
}

export async function clearLocalCaptures() {
  if (!isFinanzasAndroid()) {
    throw new Error('Esta función está disponible en la aplicación Android.')
  }
  return LocalCaptures.clearCaptures()
}

export function listenForCaptureChanges(callback) {
  if (!isFinanzasAndroid()) return Promise.resolve({ remove: async () => {} })
  return LocalCaptures.addListener('capturesChanged', callback)
}
