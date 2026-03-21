import { apiClient } from './api/client'

export const dashboardService = {
  getSummary() {
    return apiClient.get('/dashboard/summary')
  },
}
