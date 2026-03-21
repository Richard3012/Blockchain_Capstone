import crypto from 'crypto'

const sortValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = sortValue(value[key])
        return accumulator
      }, {})
  }

  return value
}

export const canonicalizeRecord = (value) => JSON.stringify(sortValue(value))

export const hashRecord = (value) =>
  `0x${crypto.createHash('sha256').update(canonicalizeRecord(value)).digest('hex')}`
