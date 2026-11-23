import { useEffect, useRef } from 'react'

/**
 * Keeps the currently opened editor visible after its state is updated.
 * The trigger key lets a parent re-focus the form when switching records
 * while the form remains open.
 */
export function useScrollToForm(isOpen, triggerKey = null) {
  const formRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !formRef.current) return undefined

    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, triggerKey])

  return formRef
}
