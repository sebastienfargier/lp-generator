/**
 * Génère les dérivés de la banque d'images Email V2 à partir des sources
 * 2016×1344 (`ressources/email/assets/`, hors dépôt) et de `crops.json`.
 *
 * Les recadrages sont décidés une fois pour toutes dans `crops.json` (hors
 * génération, vérifiés à l'œil) : ce script ne choisit rien. Il vérifie
 * l'empreinte de chaque source, extrait le rectangle, le redimensionne à 2x
 * le cadre exact du template et écrit un JPEG dans `public/images/email/v2/`.
 * Aucune source n'est copiée.
 *
 * Usage : node scripts/email-image-bank/build.mjs
 * `sharp` vient des dépendances de Next ; il n'est pas utilisé à l'exécution.
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const sourceDir = join(root, "ressources", "email", "assets")
const outDir = join(root, "public", "images", "email", "v2")

const manifest = JSON.parse(readFileSync(join(here, "crops.json"), "utf8"))
const { sourceWidth, sourceHeight, scale } = manifest.output

mkdirSync(outDir, { recursive: true })

for (const [image, source] of Object.entries(manifest.sources)) {
  const bytes = readFileSync(join(sourceDir, source.file))
  const md5 = createHash("md5").update(bytes).digest("hex")
  if (md5 !== source.md5) throw new Error(`Source modifiée pour "${image}" : empreinte inattendue.`)
}

let count = 0
for (const { image, format, rect } of manifest.derivatives) {
  const [frameWidth, frameHeight] = manifest.frames[format]
  const [left, top, width, height] = rect
  if (left < 0 || top < 0 || left + width > sourceWidth || top + height > sourceHeight) throw new Error(`${image}--${format} : rectangle hors de la source.`)
  if (Math.abs(width / height - frameWidth / frameHeight) > 0.005) throw new Error(`${image}--${format} : rectangle au mauvais ratio.`)
  if (width < frameWidth * scale) throw new Error(`${image}--${format} : rectangle trop petit (rééchantillonnage vers le haut).`)
  const buffer = await sharp(join(sourceDir, manifest.sources[image].file))
    .extract({ left, top, width, height })
    .resize(frameWidth * scale, frameHeight * scale, { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: 82, mozjpeg: true, progressive: false })
    .toBuffer()
  writeFileSync(join(outDir, `${image}--${format}.jpg`), buffer)
  count += 1
}
console.log(`${count} dérivés écrits dans public/images/email/v2/`)
