export const companyFilter = (user, extra = {}) => ({
  companyId: user.companyId,
  ...extra,
})

export const storeScopedFilter = (user, field = 'store', extra = {}) => ({
  companyId: user.companyId,
  ...(user.storeId ? { [field]: user.storeId } : {}),
  ...extra,
})
