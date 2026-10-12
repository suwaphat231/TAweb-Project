import { useId } from 'react'
import { useToast } from '../../hooks/useToast'
import { Icon } from './ReportIcons'

const MAX_FILE = 5 * 1024 * 1024
const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  label?: string
}

// FilePicker is the evidence attachment control used across the report
// pages: a labelled button, the same type/size checks the server applies,
// and a removable list of picked files.
export function FilePicker({ files, onChange, max = 5, label = 'แนบไฟล์' }: Props) {
  const id = useId()
  const showToast = useToast()

  function add(list: FileList | null) {
    const next = [...files]
    for (const f of Array.from(list ?? [])) {
      if (!FILE_TYPES.includes(f.type)) { showToast(`${f.name}: รองรับเฉพาะ .jpg .png .pdf`, 'error'); continue }
      if (f.size > MAX_FILE) { showToast(`${f.name}: ไฟล์ใหญ่เกิน 5MB`, 'error'); continue }
      next.push(f)
    }
    if (next.length > max) showToast(`แนบได้ครั้งละไม่เกิน ${max} ไฟล์`, 'warning')
    onChange(next.slice(0, max))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label htmlFor={id} className="report-file-btn">
          <Icon name="upload" size={15} /> {label}
        </label>
        <input id={id} type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="sr-only"
          onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>.jpg .png .pdf · ไม่เกิน 5MB ต่อไฟล์</span>
      </div>
      {files.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-700)', background: 'var(--primary-50)', borderRadius: 8, padding: '6px 6px 6px 10px' }}>
              <Icon name="paperclip" size={14} style={{ color: 'var(--ink-500)' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`ลบ ${f.name}`} className="report-icon-btn">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
