import { Router } from 'express'

import { operationsController } from '../controllers/operations.controller.js'
import { requireAuth } from '../middlewares/auth.js'

const router = Router()

router.use(requireAuth)

router.get('/support', operationsController.listSupport)
router.post('/support', operationsController.createSupport)
router.patch('/support/:id', operationsController.updateSupport)

router.get('/documents', operationsController.listDocuments)
router.post('/documents', operationsController.createDocument)
router.patch('/documents/:id', operationsController.updateDocument)
router.delete('/documents/:id', operationsController.removeDocument)

router.get('/workflow-requests', operationsController.listWorkflow)
router.patch('/workflow-requests/:id/status', operationsController.updateWorkflowStatus)

router.get('/assets', operationsController.listAssets)
router.post('/assets', operationsController.createAsset)
router.patch('/assets/:id', operationsController.updateAsset)
router.delete('/assets/:id', operationsController.removeAsset)

router.get('/employees', operationsController.listEmployees)
router.post('/employees', operationsController.createEmployee)
router.patch('/employees/:id', operationsController.updateEmployee)
router.delete('/employees/:id', operationsController.removeEmployee)

router.get('/manufacturing', operationsController.listManufacturing)
router.post('/manufacturing/work-orders', operationsController.createWorkOrder)
router.patch('/manufacturing/work-orders/:id', operationsController.updateWorkOrder)
router.delete('/manufacturing/work-orders/:id', operationsController.removeWorkOrder)

router.get('/projects', operationsController.listProjects)
router.post('/projects', operationsController.createProject)
router.patch('/projects/:id', operationsController.updateProject)
router.delete('/projects/:id', operationsController.removeProject)

router.get('/notifications', operationsController.notifications)

export default router
