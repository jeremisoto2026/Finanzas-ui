import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

const ConfirmationDialogContext = createContext(null)

export function useConfirmationDialog() {
  const context = useContext(ConfirmationDialogContext)
  if (!context) {
    throw new Error('useConfirmationDialog debe utilizarse dentro de ConfirmationDialogProvider.')
  }
  return context.confirm
}

export function ConfirmationDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolveRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const previousFocusRef = useRef(null)

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    // Only one confirmation can be open at a time.
    if (resolveRef.current) {
      resolve(false)
      return
    }

    resolveRef.current = resolve
    setDialog({
      title: options.title || '¿Eliminar este registro?',
      description: options.description || 'Esta acción no se puede deshacer.',
      confirmLabel: options.confirmLabel || 'Eliminar',
      cancelLabel: options.cancelLabel || 'Cancelar',
    })
  }), [])

  const settle = useCallback((approved) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setDialog(null)
    resolve?.(approved)
  }, [])

  useEffect(() => {
    if (!dialog) return undefined

    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    cancelButtonRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        settle(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [dialog, settle])

  useEffect(() => () => {
    const resolve = resolveRef.current
    resolveRef.current = null
    resolve?.(false)
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmationDialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) settle(false)
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="finance-confirmation-title"
            aria-describedby="finance-confirmation-description"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/40 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-300">
                  Confirmación
                </p>
                <h2 id="finance-confirmation-title" className="mt-1 text-lg font-semibold text-white">
                  {dialog.title}
                </h2>
              </div>
            </div>

            <p id="finance-confirmation-description" className="mt-4 text-sm leading-6 text-slate-300">
              {dialog.description}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => settle(false)}
                className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                {dialog.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {dialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmationDialogContext.Provider>
  )
}
