import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownCircle, LogOut, Plus, Receipt, ChevronDown, Sparkles } from 'lucide-react'

const pageMeta = {
  Dashboard: { title: 'Resumen financiero', section: 'INICIO', description: 'Consulta tus saldos, compromisos y evolución.' },
  Gastos: { title: 'Gastos', section: 'MOVIMIENTOS', description: 'Controla las salidas de dinero de tus cuentas.' },
  Ingresos: { title: 'Ingresos', section: 'MOVIMIENTOS', description: 'Consulta y registra las entradas de dinero.' },
  Ajustes: { title: 'Ajustes', section: 'SISTEMA', description: 'Personaliza tu aplicación y protege tu acceso.' },
  Calendario: { title: 'Calendario financiero', section: 'PLANIFICACIÓN', description: 'Consulta pagos, cuotas y fechas importantes.' },
  Cuentas: { title: 'Cuentas y saldos', section: 'CUENTAS', description: 'Revisa dónde está tu dinero.' },
  Transferencias: { title: 'Transferencias', section: 'CUENTAS', description: 'Mueve dinero entre tus propias cuentas.' },
  'Deudas y reposiciones': { title: 'Deudas y reposiciones', section: 'SEGUIMIENTO', description: 'Controla importes pendientes y dinero adelantado.' },
  Reservas: { title: 'Reservas de dinero', section: 'SEGUIMIENTO', description: 'Organiza el dinero que has apartado.' },
  Recordatorios: { title: 'Avisos y recordatorios', section: 'SISTEMA', description: 'Gestiona las notificaciones que recibes.' },
  Automatizaciones: { title: 'Reglas automáticas', section: 'AUTOMATIZACIÓN', description: 'Configura cómo se reconocen tus movimientos.' },
  'Compras pendientes': { title: 'Compras por revisar', section: 'AUTOMATIZACIÓN', description: 'Comprueba las detecciones antes de confirmarlas.' },
  'Gestión financiera': { title: 'Pagos y presupuestos', section: 'PLANIFICACIÓN', description: 'Organiza cuotas, pagos fijos y límites de gasto.' },
}

export default function Navbar({ onAdd, onSignOut, activePage = 'Dashboard' }) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 12 })
  const addButtonRef = useRef(null)
  const addMenuRef = useRef(null)
  const currentPage = pageMeta[activePage] || pageMeta.Dashboard

  const openAddMenu = () => {
    const rect = addButtonRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuPosition({
        top: Math.round(rect.bottom + 10),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      })
    }
    setAddMenuOpen((open) => !open)
  }

  useEffect(() => {
    if (!addMenuOpen) return undefined
    const closeOnOutsidePress = (event) => {
      if (!addMenuRef.current?.contains(event.target) && !addButtonRef.current?.contains(event.target)) {
        setAddMenuOpen(false)
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setAddMenuOpen(false)
    }
    const closeOnViewportChange = () => setAddMenuOpen(false)
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [addMenuOpen])

  const seleccionarMovimiento = (tipo) => {
    setAddMenuOpen(false)
    onAdd?.(tipo)
  }

  const addMenu = addMenuOpen ? createPortal(
    <div
      ref={addMenuRef}
      id="finanzas-quick-add-menu"
      role="menu"
      aria-label="Añadir movimiento"
      style={{
        position: 'fixed',
        top: menuPosition.top,
        right: menuPosition.right,
        zIndex: 2147483000,
        width: 'min(19rem, calc(100vw - 1.5rem))',
        boxSizing: 'border-box',
        padding: '12px',
        border: '1px solid #40516a',
        borderRadius: '16px',
        backgroundColor: '#101c2e',
        backgroundImage: 'none',
        color: '#f8fafc',
        opacity: 1,
        filter: 'none',
        isolation: 'isolate',
        boxShadow: '0 24px 64px rgba(0,0,0,.72), 0 4px 14px rgba(0,0,0,.35)',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
      }}
    >
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><Sparkles className="h-4 w-4" /></span>
        <div>
          <p className="text-xs font-semibold" style={{ color: '#ffffff', opacity: 1 }}>Nuevo movimiento</p>
          <p className="text-[10px]" style={{ color: '#c1ccda', opacity: 1 }}>Elige qué quieres registrar</p>
        </div>
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => seleccionarMovimiento('expense')}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition"
        style={{ background: '#1b2b42', border: '1px solid #40536d', color: '#ffffff', opacity: 1 }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300"><Receipt className="h-5 w-5" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold" style={{ color: '#ffffff', opacity: 1 }}>Registrar gasto</span>
          <span className="mt-0.5 block text-xs" style={{ color: '#d0d9e5', opacity: 1 }}>Anotar una salida de dinero</span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => seleccionarMovimiento('income')}
        className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition"
        style={{ background: '#1b2b42', border: '1px solid #40536d', color: '#ffffff', opacity: 1 }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"><ArrowDownCircle className="h-5 w-5" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold" style={{ color: '#ffffff', opacity: 1 }}>Registrar ingreso</span>
          <span className="mt-0.5 block text-xs" style={{ color: '#d0d9e5', opacity: 1 }}>Anotar una entrada de dinero</span>
        </span>
      </button>
    </div>,
    document.body
  ) : null

  return (
    <>
      <header className="app-topbar flex items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400/90">
            Finanzas <span className="px-1 text-slate-600">/</span> {currentPage.section}
          </p>
          <h1 className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-white sm:text-lg">
            {currentPage.title}
          </h1>
          <p className="mt-0.5 hidden truncate text-[11px] text-slate-400 sm:block">
            {currentPage.description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            ref={addButtonRef}
            type="button"
            onClick={openAddMenu}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            aria-controls="finanzas-quick-add-menu"
            className="topbar-add-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-semibold text-white transition sm:px-4 sm:text-sm"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Añadir</span>
            <ChevronDown className={'hidden h-3.5 w-3.5 opacity-75 transition sm:block ' + (addMenuOpen ? 'rotate-180' : '')} />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="topbar-signout inline-flex h-10 w-10 items-center justify-center rounded-xl text-xs font-medium transition sm:w-auto sm:gap-2 sm:px-3"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">Salir</span>
          </button>
        </div>
      </header>
      {addMenu}
    </>
  )
}
