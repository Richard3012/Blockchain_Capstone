export const createCrudService = (Model, populate = '') => ({
  async list() {
    return Model.find().populate(populate).sort({ createdAt: -1 })
  },

  async getById(id) {
    const record = await Model.findById(id).populate(populate)
    if (!record) {
      const error = new Error(`${Model.modelName} not found`)
      error.statusCode = 404
      throw error
    }
    return record
  },

  async create(payload) {
    return Model.create(payload)
  },

  async update(id, payload) {
    const record = await Model.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).populate(populate)
    if (!record) {
      const error = new Error(`${Model.modelName} not found`)
      error.statusCode = 404
      throw error
    }
    return record
  },

  async remove(id) {
    const record = await Model.findByIdAndDelete(id)
    if (!record) {
      const error = new Error(`${Model.modelName} not found`)
      error.statusCode = 404
      throw error
    }
    return record
  },
})
