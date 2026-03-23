import { Router } from 'express'

import { accountingController } from '../controllers/accounting.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/initialize', accountingController.initializeAccounts)
router.get('/accounts', accountingController.getAccounts)
router.post('/accounts', accountingController.createAccount)
router.post('/journal-entries', accountingController.createJournalEntry)
router.get('/journal-entries', accountingController.getJournalEntries)
router.get('/journal-entries/:id', accountingController.getJournalEntry)
router.get('/trial-balance', accountingController.getTrialBalance)
router.get('/profit-and-loss', accountingController.getProfitAndLoss)
router.get('/balance-sheet', accountingController.getBalanceSheet)

export default router
