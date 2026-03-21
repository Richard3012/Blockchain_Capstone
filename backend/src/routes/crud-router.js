import { Router } from 'express'

export const createCrudRouter = (controller) => {
  const router = Router()

  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.patch('/:id', controller.update)
  router.delete('/:id', controller.remove)

  return router
}
