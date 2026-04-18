/**
 * COA migration: backfills accounts created before the hierarchy/subtype upgrade.
 *
 * Idempotent — safe to re-run.  Sets `normalSide`, `path`, `level`, and a
 * best-guess `subType` for every account that doesn't already have them.
 *
 * Usage:
 *   node backend/src/scripts/migrate-coa.js
 */

import mongoose from 'mongoose'

import { connectDatabase } from '../config/database.js'
import { Account } from '../models/account.model.js'
import { NORMAL_SIDE } from '../constants/coaTemplates.js'
import { logger } from '../utils/logger.js'

const SUBTYPE_HINTS = [
  [/cash/i, 'cash'],
  [/bank/i, 'bank'],
  [/receivable|debtor/i, 'receivable'],
  [/payable|creditor/i, 'payable'],
  [/inventory|stock/i, 'inventory'],
  [/gst|vat|tax|tds/i, 'tax'],
  [/depreciation/i, 'depreciation'],
  [/cogs|cost of goods|cost of sales/i, 'cogs'],
  [/fixed|equipment|machinery|property/i, 'fixed'],
  [/retained/i, 'retained'],
  [/equity|capital|stock/i, 'capital'],
]

const guessSubType = (account) => {
  for (const [re, st] of SUBTYPE_HINTS) {
    if (re.test(account.name)) return st
  }
  return account.type === 'revenue' || account.type === 'expense' ? 'operating' : 'other'
}

async function run() {
  await connectDatabase()
  let updated = 0
  let scanned = 0

  const cursor = Account.find({}).cursor()
  for await (const account of cursor) {
    scanned += 1
    let dirty = false

    if (!account.normalSide) {
      account.normalSide = NORMAL_SIDE[account.type] || 'debit'
      dirty = true
    }
    if (!account.subType || account.subType === 'other') {
      const guess = guessSubType(account)
      if (guess !== account.subType) { account.subType = guess; dirty = true }
    }
    if (!account.path) {
      account.path = account.code
      dirty = true
    }
    if (account.level === undefined || account.level === null) {
      account.level = 0
      dirty = true
    }
    if (/retained/i.test(account.name) && !account.lockedSystem) {
      account.lockedSystem = true
      dirty = true
    }

    if (dirty) {
      await account.save()
      updated += 1
    }
  }

  logger.info('migrate-coa.complete', { scanned, updated })
  console.log(`COA migration complete — scanned ${scanned}, updated ${updated}`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('COA migration failed:', err)
  process.exit(1)
})
