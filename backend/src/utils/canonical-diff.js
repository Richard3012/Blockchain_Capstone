const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date))

export const diffCanonicalObjects = (before, after, prefix = '') => {
  const changes = []

  const walk = (a, b, path) => {
    if (a === b) return
    if (Array.isArray(a) && Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push({
          field: path || '(array)',
          before: a,
          after: b,
        })
      }
      return
    }
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)])
      for (const key of keys) {
        const next = path ? `${path}.${key}` : key
        if (!(key in a)) {
          changes.push({ field: next, before: undefined, after: b[key] })
        } else if (!(key in b)) {
          changes.push({ field: next, before: a[key], after: undefined })
        } else {
          walk(a[key], b[key], next)
        }
      }
      return
    }
    changes.push({ field: path || 'root', before: a, after: b })
  }

  walk(before || {}, after || {}, prefix)
  return changes
}
