import { Component, type ReactNode } from 'react'
import { Button } from './Button'

export class PageLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" style={{ padding: 24 }}>
          <p style={{ marginBottom: 16 }}>โหลดหน้านี้ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p>
          <Button onClick={() => window.location.reload()}>โหลดหน้าใหม่</Button>
        </div>
      )
    }
    return this.props.children
  }
}
