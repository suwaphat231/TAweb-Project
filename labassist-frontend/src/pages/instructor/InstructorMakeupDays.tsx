import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { instructorApi } from '../../services/api'
import type { MakeupDayPayload } from '../../types'
import { FilterChips } from '../../components/ui/FilterChips'
import { SkeletonCard } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ReportPageHeader } from '../../components/reports/ReportPageHeader'
import { MakeupDaysPanel } from '../../components/makeup/MakeupDaysPanel'
import { MAKEUP_DAYS_KEY, pendingCount } from '../../components/makeup/makeupRules'

export default function InstructorMakeupDays() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const { data: days = [], isLoading, isError, refetch } = useQuery({
    queryKey: MAKEUP_DAYS_KEY,
    queryFn: instructorApi.makeupDays,
  })
  const pending = pendingCount(days)
  const shown = filter === 'pending' ? days.filter((d) => d.status === 'pending') : days

  const refresh = () => qc.invalidateQueries({ queryKey: MAKEUP_DAYS_KEY })
  const choose = (id: number, data: MakeupDayPayload) => instructorApi.chooseMakeup(id, data).then(refresh)
  const decline = (id: number) => instructorApi.declineMakeup(id).then(refresh)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ReportPageHeader
        title="วันชดเชย"
        subtitle="วันทำงานของ Lab Boy ที่ตรงกับวันหยุดที่เจ้าหน้าที่กำหนด เลือกวันชดเชย (ข้ามเดือนได้) หรือเลือกไม่ชดเชย — Lab Boy จะได้รับแจ้งเตือน หากยังไม่เลือก เจ้าหน้าที่จะเลือกแทนก่อนออกเอกสาร"
      />
      <div style={{ marginBottom: 16 }}>
        <FilterChips
          options={[
            { value: 'pending', label: `รอเลือก (${pending})` },
            { value: 'all', label: `ทั้งหมด (${days.length})` },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as 'pending' | 'all')}
        />
      </div>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <SkeletonCard />
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'ไม่มีวันที่รอเลือกวันชดเชย' : 'ยังไม่มีวันทำงานที่ชนวันหยุด'}
          description="เมื่อเจ้าหน้าที่กำหนดวันหยุดตรงกับวันทำงานของ Lab Boy รายการจะขึ้นที่นี่"
        />
      ) : (
        <MakeupDaysPanel days={shown} mode="instructor" showCourse onChoose={choose} onDecline={decline} />
      )}
    </div>
  )
}
