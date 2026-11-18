/*
 * Demo wardrobe seeder.
 *
 * This is a browser script, not a Node script: the app stores photos as Blobs in
 * IndexedDB, so the sample garments have to be created where `Blob` and `indexedDB`
 * exist. It is injected into a running page (see docs/devlog.md and the capture
 * notes at the bottom of this file) and fills the `wardrobe` database with a small,
 * believable closet plus two saved looks and two wear events.
 *
 * The garments are simple inline SVG silhouettes — no photos, nothing personal,
 * nothing fetched. They are committed here so the same demo closet can be rebuilt
 * at any time for screenshots.
 *
 * Usage from a Playwright/Puppeteer host:
 *   await page.add_script_tag({ path: 'scripts/demo-seed.mjs' })
 *   await page.evaluate(() => window.__wardrobeSeed())
 * The function resolves to a summary object once the database is written.
 */
;(function () {
  if (typeof window === 'undefined') return

  // One silhouette per category. Filled with the garment colour so the palette
  // panel has something to derive from and the grid reads as real clothing.
  const SILHOUETTES = {
    top: 'M100 92 L142 70 Q152 64 162 70 L204 92 L238 122 L212 152 L196 140 L196 332 Q196 342 186 342 L118 342 Q108 342 108 332 L108 140 L92 152 L66 122 Z',
    outerwear:
      'M96 86 L150 72 L176 104 L202 72 L256 86 L264 340 L208 340 L202 190 L196 340 L150 340 L144 190 L138 340 L92 340 Z',
    bottom:
      'M118 88 L186 88 Q196 88 196 98 L198 206 L188 344 Q187 352 179 352 L152 352 Q144 352 143 344 L138 222 L133 344 Q132 352 124 352 L97 352 Q89 352 88 344 L104 206 L108 98 Q108 88 118 88 Z',
    dress:
      'M140 78 L164 78 L164 96 L180 96 L196 168 L252 362 Q254 372 244 372 L96 372 Q86 372 88 362 L144 168 L160 96 L176 96 L176 78 L200 78 Z',
    shoes:
      'M84 306 Q84 262 126 250 L204 228 Q266 214 276 258 L276 306 Q276 326 254 326 L104 326 Q84 326 84 306 Z',
    accessory:
      'M120 150 Q200 120 280 150 L280 320 Q200 350 120 320 Z M120 150 L104 336 M280 150 L296 336',
  }

  // name, category, colours, warmth, formality, seasons, status, price
  const PIECES = [
    ['Rust linen shirt', 'top', ['#a34f2c'], 1, 3, ['spring', 'summer', 'autumn'], 'clean', 59],
    ['Olive cotton tee', 'top', ['#6b7a4f'], 1, 1, ['spring', 'summer'], 'clean', 25],
    ['Cream knit sweater', 'top', ['#e6d8bf'], 4, 3, ['autumn', 'winter'], 'clean', 88],
    ['White oxford shirt', 'top', ['#f3efe6'], 1, 4, ['spring', 'summer', 'autumn', 'winter'], 'clean', 75],
    ['Navy merino blazer', 'outerwear', ['#2f3e5c'], 3, 5, ['autumn', 'winter', 'spring'], 'clean', 160],
    ['Forest overshirt', 'outerwear', ['#33483b'], 3, 3, ['autumn', 'spring'], 'dirty', 95],
    ['Mid-blue jeans', 'bottom', ['#4a6fa5'], 2, 2, ['spring', 'summer', 'autumn', 'winter'], 'clean', 70],
    ['Charcoal wool trousers', 'bottom', ['#3a3630'], 3, 4, ['autumn', 'winter'], 'clean', 110],
    ['Tan chinos', 'bottom', ['#c8a97e'], 2, 3, ['spring', 'summer', 'autumn'], 'laundry', 65],
    ['Blush summer dress', 'dress', ['#d9a7a0'], 1, 3, ['spring', 'summer'], 'clean', 120],
    ['Brown leather boots', 'shoes', ['#7a5230'], 4, 3, ['autumn', 'winter'], 'clean', 180],
    ['White canvas sneakers', 'shoes', ['#f3efe6'], 1, 1, ['spring', 'summer'], 'clean', 55],
  ]

  function garmentSvg(category, colour) {
    const path = SILHOUETTES[category] ?? SILHOUETTES.top
    const detail =
      category === 'shoes'
        ? `<path d="M126 250 Q150 244 204 232" fill="none" stroke="#00000022" stroke-width="4"/>`
        : category === 'bottom'
          ? `<rect x="108" y="88" width="88" height="18" rx="6" fill="#00000018"/>`
          : category === 'outerwear'
            ? `<path d="M176 104 L164 340 M176 104 L188 340" fill="none" stroke="#00000020" stroke-width="3"/>`
            : ''
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 420" width="340" height="420">` +
      `<path d="${path}" fill="${colour}" stroke="#00000026" stroke-width="3" stroke-linejoin="round"/>` +
      detail +
      `</svg>`
    return new Blob([svg], { type: 'image/svg+xml' })
  }

  function localIso(offsetDays) {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }

  window.__wardrobeSeed = async function seedDemoWardrobe() {
    // Rebuild from scratch so repeat runs are idempotent.
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('wardrobe')
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })

    const now = Date.now()
    const day = 86_400_000

    const items = PIECES.map(([name, category, colors, warmth, formality, seasons, status, price], i) => ({
      name,
      category,
      colors,
      warmth,
      formality,
      seasons,
      status,
      price,
      image: garmentSvg(category, colors[0]),
      // Insert newest-first so the wardrobe grid reads naturally.
      createdAt: now - (PIECES.length - i) * day - i * 3_600_000,
    }))

    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('wardrobe', 1)
      open.onupgradeneeded = () => {
        const d = open.result
        const s = d.createObjectStore('items', { keyPath: 'id', autoIncrement: true })
        s.createIndex('category', 'category')
        s.createIndex('status', 'status')
        s.createIndex('createdAt', 'createdAt')
        s.createIndex('lastWornAt', 'lastWornAt')
        const o = d.createObjectStore('outfits', { keyPath: 'id', autoIncrement: true })
        o.createIndex('createdAt', 'createdAt')
        const w = d.createObjectStore('wearEvents', { keyPath: 'id', autoIncrement: true })
        w.createIndex('outfitId', 'outfitId')
        w.createIndex('wornOn', 'wornOn')
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })

    function tx(store, mode, fn) {
      return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }

    const ids = {}
    for (const item of items) {
      ids[item.name] = await tx('items', 'readwrite', (s) => s.add(item))
    }

    const outfitSeeds = [
      {
        name: 'Weekend uniform',
        itemIds: ['Rust linen shirt', 'Mid-blue jeans', 'White canvas sneakers'],
        occasion: 'casual',
        seasons: ['spring', 'summer'],
        createdAt: now - 5 * day,
      },
      {
        name: 'Office layers',
        itemIds: ['White oxford shirt', 'Charcoal wool trousers', 'Navy merino blazer', 'Brown leather boots'],
        occasion: 'work',
        seasons: ['autumn', 'winter'],
        createdAt: now - 3 * day,
      },
    ]

    const outfitIds = {}
    for (const o of outfitSeeds) {
      const outfit = { ...o, itemIds: o.itemIds.map((n) => ids[n]) }
      outfitIds[o.name] = await tx('outfits', 'readwrite', (s) => s.add(outfit))
    }

    const wearSeeds = [
      { outfit: 'Office layers', wornOn: localIso(-3), feedback: 'loved', createdAt: now - 3 * day },
      { outfit: 'Weekend uniform', wornOn: localIso(-1), feedback: undefined, createdAt: now - 1 * day },
    ]
    const wearCounts = {}
    for (const w of wearSeeds) {
      await tx('wearEvents', 'readwrite', (s) =>
        s.add({ outfitId: outfitIds[w.outfit], wornOn: w.wornOn, feedback: w.feedback, createdAt: w.createdAt }),
      )
      wearCounts[w.outfit] = (wearCounts[w.outfit] ?? 0) + 1
    }

    // Point lastWornAt at the newest wear per piece so the log and cards agree.
    const wornPieces = new Map()
    for (const w of wearSeeds) {
      const outfit = outfitSeeds.find((o) => o.name === w.outfit)
      for (const pieceName of outfit.itemIds) {
        const prev = wornPieces.get(pieceName)
        if (!prev || w.wornOn > prev) wornPieces.set(pieceName, w.wornOn)
      }
    }
    for (const [pieceName, wornOn] of wornPieces) {
      const id = ids[pieceName]
      const store = db.transaction('items', 'readwrite').objectStore('items')
      const getReq = store.get(id)
      await new Promise((resolve, reject) => {
        getReq.onsuccess = () => {
          const rec = getReq.result
          if (rec) {
            rec.lastWornAt = new Date(`${wornOn}T00:00:00`).getTime()
            store.put(rec)
          }
          resolve()
        }
        getReq.onerror = () => reject(getReq.error)
      })
    }

    db.close()

    return {
      pieces: items.length,
      looks: outfitSeeds.length,
      wears: wearSeeds.length,
      ids: Object.keys(ids).length,
    }
  }
})()
