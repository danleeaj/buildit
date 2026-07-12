import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PWA_PUBLIC_ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
]

function contentOfBundleEntry(entry) {
  if (!entry) return null
  if (entry.type === 'chunk') return entry.code
  if (typeof entry.source === 'string') return entry.source
  return Buffer.from(entry.source)
}

function buildItPrecachePlugin() {
  let outputDirectory
  let publicDirectory
  let buildVersion

  return {
    name: 'buildit-precache-manifest',
    apply: 'build',
    enforce: 'post',

    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
      publicDirectory = config.publicDir || null
    },

    generateBundle(_options, bundle) {
      const generatedAssets = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((fileName) => fileName === 'index.html' || /\.(?:css|js)$/.test(fileName))

      const assets = [...new Set([...PWA_PUBLIC_ASSETS, ...generatedAssets])].sort()
      const hash = createHash('sha256')

      for (const asset of assets) {
        hash.update(asset)

        const bundleEntry = Object.values(bundle).find((entry) => entry.fileName === asset)
        const bundleContent = contentOfBundleEntry(bundleEntry)
        if (bundleContent !== null) {
          hash.update(bundleContent)
          continue
        }

        if (!publicDirectory || asset === 'index.html') continue
        hash.update(readFileSync(resolve(publicDirectory, asset)))
      }

      // Include worker logic in the version even though the worker does not
      // precache itself. This prevents a new worker from mutating or deleting
      // the cache still owned by an older worker after a strategy-only change.
      if (publicDirectory) {
        hash.update('sw.js')
        hash.update(readFileSync(resolve(publicDirectory, 'sw.js')))
      }

      buildVersion = hash.digest('hex').slice(0, 16)

      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: `${JSON.stringify({ version: buildVersion, assets }, null, 2)}\n`,
      })
    },

    closeBundle() {
      // Rollup also calls closeBundle after an unrelated build failure. In that
      // case generateBundle never ran, so leave the original error unobscured.
      if (!buildVersion) return

      const serviceWorkerPath = resolve(outputDirectory, 'sw.js')
      const serviceWorker = publicDirectory
        ? readFileSync(resolve(publicDirectory, 'sw.js'), 'utf8')
        : ''

      if (!serviceWorker.includes('__BUILD_VERSION__')) {
        this.error('Could not stamp the BuildIt service worker with its precache version.')
      }

      writeFileSync(
        serviceWorkerPath,
        serviceWorker.replaceAll('__BUILD_VERSION__', buildVersion),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), buildItPrecachePlugin()],
})
