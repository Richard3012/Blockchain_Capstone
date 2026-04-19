import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
  <rect width="100%" height="100%" fill="white"/>
  <text x="30" y="60"  font-family="Arial" font-size="34" fill="black" font-weight="bold">ACME CORP</text>
  <text x="30" y="110" font-family="Arial" font-size="22" fill="black">Invoice Number: INV-2026-001</text>
  <text x="30" y="150" font-family="Arial" font-size="22" fill="black">Date: 19/04/2026</text>
  <text x="30" y="190" font-family="Arial" font-size="22" fill="black">GSTIN: 27AAPFU0939F1ZV</text>
  <text x="30" y="260" font-family="Arial" font-size="22" fill="black">Widget A    Qty: 5   Rate: 200   Amount: 1000</text>
  <text x="30" y="300" font-family="Arial" font-size="22" fill="black">Widget B    Qty: 2   Rate: 500   Amount: 1000</text>
  <text x="30" y="380" font-family="Arial" font-size="22" fill="black">Subtotal: 2000</text>
  <text x="30" y="420" font-family="Arial" font-size="22" fill="black">GST 18%: 360</text>
  <text x="30" y="470" font-family="Arial" font-size="28" fill="black" font-weight="bold">Total: 2360</text>
</svg>`

const out = path.join(__dirname, 'sample-invoice.png')
await sharp(Buffer.from(svg)).png().toFile(out)
console.log('wrote', out)
