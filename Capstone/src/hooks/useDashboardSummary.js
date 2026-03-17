import { useEffect, useState } from 'react'

import { dashboardService } from '../services/dashboardService'

export function useDashboardSummary() {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let mounted = true

    dashboardService
      .getSummary()
      .then((data) => {
        if (mounted) {
          setState({ data, loading: false, error: null })
        }
      })
      .catch((error) => {
        if (mounted) {
          setState({ data: null, loading: false, error: error.message })
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  return state
}
