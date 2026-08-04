import { useCallback, useEffect, useRef } from 'react'

const LIGHT_SELECTOR =
  '.student-glass-panel:not(.student-glass-popover), .student-glass-chip, .student-glass-btn, .student-glass-nav-item, .student-glass-sidebar, .student-glass-modal'
const TILT_SELECTOR =
  '.student-glass-panel:not(.student-glass-panel--static), .glass-modal-tilt'

type Options = {
  /** 面板 3D 倾斜最大角度，默认 3.5 */
  maxTilt?: number
}

function setGlassPointerVars(el: HTMLElement, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const xRatio = (clientX - rect.left) / rect.width
  const yRatio = (clientY - rect.top) / rect.height
  el.style.setProperty('--glass-x', `${xRatio * 100}%`)
  el.style.setProperty('--glass-y', `${yRatio * 100}%`)
  const angle =
    (Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2)) *
      180) /
      Math.PI +
    90
  el.style.setProperty('--glass-angle', `${angle.toFixed(2)}deg`)
}

export function useStudentGlassPointer(options: Options = {}) {
  const maxTilt = options.maxTilt ?? 3.5
  const rafRef = useRef(0)
  const lastTiltPanel = useRef<HTMLElement | null>(null)
  const pendingRef = useRef<{
    clientX: number
    clientY: number
    panel: HTMLElement | null
    lightEl: HTMLElement | null
  } | null>(null)

  const resetGlassTilt = useCallback(() => {
    if (!lastTiltPanel.current) return
    lastTiltPanel.current.style.transform = ''
    lastTiltPanel.current = null
  }, [])

  const onGlassPointerMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      pendingRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panel: (e.target as HTMLElement).closest(TILT_SELECTOR) as HTMLElement | null,
        lightEl: (e.target as HTMLElement).closest(LIGHT_SELECTOR) as HTMLElement | null,
      }
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const pending = pendingRef.current
        if (!pending) return
        const { clientX, clientY, panel, lightEl } = pending

        if (lastTiltPanel.current && lastTiltPanel.current !== panel) {
          lastTiltPanel.current.style.transform = ''
        }
        lastTiltPanel.current = panel

        const isModal = !!panel?.classList.contains('glass-modal-tilt')
        // 大模态内减少嵌套玻璃高光写入，降低合成压力
        if (lightEl && (!isModal || lightEl === panel)) {
          setGlassPointerVars(lightEl, clientX, clientY)
        }
        if (panel && panel !== lightEl) {
          setGlassPointerVars(panel, clientX, clientY)
        }

        if (panel) {
          const rect = panel.getBoundingClientRect()
          if (!rect.width || !rect.height) return
          const xRatio = (clientX - rect.left) / rect.width
          const yRatio = (clientY - rect.top) / rect.height
          const nx = (xRatio - 0.5) * 2
          const ny = (yRatio - 0.5) * 2
          const span = Math.max(rect.width, rect.height)
          const tiltScale = Math.min(1, (isModal ? 220 : 420) / span)
          const tilt = maxTilt * tiltScale * (isModal ? 0.55 : 1)
          const perspective = Math.round(Math.max(900, span * (isModal ? 2.1 : 1.4)))
          panel.style.transform = `perspective(${perspective}px) rotateX(${(-ny * tilt).toFixed(2)}deg) rotateY(${(nx * tilt).toFixed(2)}deg) translateZ(0)`
        }
      })
    },
    [maxTilt]
  )

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      resetGlassTilt()
    },
    [resetGlassTilt]
  )

  return { onGlassPointerMove, resetGlassTilt }
}
