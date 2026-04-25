import type { SystemStatus } from '../../../shared/domain/contracts.js'
import { requestJson } from './client'

export function getSystemStatus() {
  return requestJson<SystemStatus>('/api/system/status')
}
