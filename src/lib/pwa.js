const IS_PRODUCTION = import.meta.env?.PROD === true
const VITE_BASE_URL = import.meta.env?.BASE_URL || '/'

function hasWindow() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined'
}

export function getPwaBaseUrl() {
  if (!hasWindow()) return null

  const manifestLink = document.querySelector('link[rel="manifest"]')
  if (manifestLink?.href) return new URL('.', manifestLink.href)

  return new URL(VITE_BASE_URL, window.location.href)
}

export function getConnectivityState() {
  const isOnline = !hasWindow() || navigator.onLine !== false
  return { isOnline, canUseNetworkFeatures: isOnline }
}

export function subscribeToConnectivity(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') {
    throw new TypeError('A connectivity listener is required.')
  }

  if (!hasWindow()) {
    if (emitCurrent) listener(getConnectivityState())
    return () => {}
  }

  const update = () => listener(getConnectivityState())
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  if (emitCurrent) update()

  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}

export function isStandalonePwa() {
  if (!hasWindow()) return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true
    || navigator.standalone === true
  )
}

function isIosDevice() {
  if (!hasWindow()) return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export async function unregisterSuperflowServiceWorker() {
  if (!hasWindow() || !('serviceWorker' in navigator)) return false

  const baseUrl = getPwaBaseUrl()
  const workerUrl = new URL('sw.js', baseUrl).href
  const registrations = await navigator.serviceWorker.getRegistrations()
  const matchesSuperflow = (registration) => {
    const workers = [registration.installing, registration.waiting, registration.active]
    return (
      registration.scope === baseUrl.href
      || workers.some((worker) => worker?.scriptURL === workerUrl)
    )
  }

  const results = await Promise.all(
    registrations.filter(matchesSuperflow).map((registration) => registration.unregister()),
  )
  return results.some(Boolean)
}

export async function registerPwa() {
  if (!IS_PRODUCTION || !hasWindow() || !('serviceWorker' in navigator)) return null

  const baseUrl = getPwaBaseUrl()
  return navigator.serviceWorker.register(new URL('sw.js', baseUrl), {
    scope: baseUrl.href,
    updateViaCache: 'none',
  })
}

export async function setupPwa() {
  if (!hasWindow() || !('serviceWorker' in navigator)) return null

  if (!IS_PRODUCTION) {
    await unregisterSuperflowServiceWorker()
    return null
  }

  if (document.readyState === 'complete') return registerPwa()

  return new Promise((resolve, reject) => {
    window.addEventListener(
      'load',
      () => registerPwa().then(resolve, reject),
      { once: true },
    )
  })
}

export function createInstallController() {
  let deferredPrompt = null
  let disposed = false
  const listeners = new Set()

  const getState = () => {
    const isInstalled = isStandalonePwa()
    return {
      canInstall: !isInstalled && deferredPrompt !== null,
      isInstalled,
      needsManualIosInstall: !isInstalled && deferredPrompt === null && isIosDevice(),
    }
  }

  const emit = () => {
    const state = getState()
    for (const listener of listeners) listener(state)
  }

  const handleBeforeInstallPrompt = (event) => {
    event.preventDefault()
    deferredPrompt = event
    emit()
  }

  const handleInstalled = () => {
    deferredPrompt = null
    emit()
  }

  if (hasWindow()) {
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
  }

  return {
    getState,

    subscribe(listener, { emitCurrent = true } = {}) {
      if (disposed) throw new Error('The install controller has been disposed.')
      if (typeof listener !== 'function') throw new TypeError('An install listener is required.')
      listeners.add(listener)
      if (emitCurrent) listener(getState())
      return () => listeners.delete(listener)
    },

    async prompt() {
      if (disposed || !deferredPrompt) return { outcome: 'unavailable' }

      const promptEvent = deferredPrompt
      deferredPrompt = null
      emit()
      await promptEvent.prompt()
      return promptEvent.userChoice
    },

    dispose() {
      if (disposed) return
      disposed = true
      deferredPrompt = null
      listeners.clear()
      if (hasWindow()) {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.removeEventListener('appinstalled', handleInstalled)
      }
    },
  }
}
