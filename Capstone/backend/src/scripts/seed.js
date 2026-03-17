import 'dotenv/config'

import bcrypt from 'bcryptjs'

import { connectDatabase } from '../config/database.js'
import { ROLES } from '../constants/roles.js'
import Company from '../models/company.model.js'
import { Customer } from '../models/customer.model.js'
import { Product } from '../models/product.model.js'
import { Store } from '../models/store.model.js'
import { Supplier } from '../models/supplier.model.js'
import { User } from '../models/user.model.js'
import { logger } from '../utils/logger.js'

const run = async () => {
  await connectDatabase()

  const company = await Company.findOneAndUpdate(
    { code: 'BLOCKERP' },
    { name: 'BlockERP Retail', code: 'BLOCKERP' },
    { new: true, upsert: true },
  )

  const store = await Store.findOneAndUpdate(
    { code: 'MAIN-STORE' },
    { companyId: company._id, name: 'Main Store', code: 'MAIN-STORE', type: 'store' },
    { new: true, upsert: true },
  )

  await User.findOneAndUpdate(
    { email: 'admin@blockerp.local' },
    {
      name: 'BlockERP Admin',
      email: 'admin@blockerp.local',
      passwordHash: await bcrypt.hash('ChangeMe123!', 10),
      role: ROLES.ADMIN,
      companyId: company._id,
      storeId: store._id,
      isActive: true,
    },
    { upsert: true },
  )

  await Supplier.findOneAndUpdate(
    { code: 'SUP-001' },
    { companyId: company._id, code: 'SUP-001', name: 'Retail Source Ltd', paymentTermsDays: 30 },
    { upsert: true },
  )

  await Product.findOneAndUpdate(
    { sku: 'SKU-001' },
    { companyId: company._id, sku: 'SKU-001', name: 'Point of Sale Scanner', costPrice: 2500, salePrice: 3400, reorderLevel: 5, currentStock: 18 },
    { upsert: true },
  )

  await Customer.findOneAndUpdate(
    { code: 'CUST-001' },
    { companyId: company._id, code: 'CUST-001', name: 'Default Retail Customer', email: 'customer@blockerp.local' },
    { upsert: true },
  )

  logger.info('seed.completed', { companyId: company._id.toString(), storeId: store._id.toString() })
  process.exit(0)
}

run().catch((error) => {
  logger.error('seed.failed', { message: error.message, stack: error.stack })
  process.exit(1)
})
