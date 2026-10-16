import { Badge } from '../ui/Badge'
import { statusInfo } from './reportLabels'
import type { ReportStatus } from '../../types'

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const s = statusInfo[status]
  return <span title={s.hint}><Badge variant={s.variant}>{s.label}</Badge></span>
}
