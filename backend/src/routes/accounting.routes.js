import { Router } from 'express'

import { accountingController } from '../controllers/accounting.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()
router.use(requireAuth)

router.post('/initialize', accountingController.initializeAccounts)
router.get('/templates', accountingController.listTemplates)
router.post('/initialize/:templateCode', accountingController.initializeFromTemplate)
router.get('/accounts', accountingController.getAccounts)
router.get('/accounts/tree', accountingController.getAccountsTree)
router.post('/accounts', accountingController.createAccount)
router.post('/journal-entries', accountingController.createJournalEntry)
router.get('/journal-entries', accountingController.getJournalEntries)
router.get('/journal-entries/:id', accountingController.getJournalEntry)
router.post('/journal-entries/:id/post', accountingController.postJournalEntry)
router.post('/journal-entries/:id/reverse', accountingController.reverseJournalEntry)
router.get('/trial-balance', accountingController.getTrialBalance)
router.get('/profit-and-loss', accountingController.getProfitAndLoss)
router.get('/balance-sheet', accountingController.getBalanceSheet)
router.get('/dimensions', accountingController.listDimensions)
router.post('/dimensions', accountingController.createDimension)
router.get('/periods', accountingController.listPeriods)
router.post('/periods/:id/close', accountingController.closePeriod)

export default router
