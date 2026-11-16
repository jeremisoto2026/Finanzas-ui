import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Error al mostrar Finanzas-ui:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
          <section className="mx-auto mt-12 max-w-xl rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-xl">
            <h1 className="text-xl font-bold text-rose-300">No se pudo mostrar Finanzas-ui</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              La aplicación encontró un error al cargar una pantalla. Tus datos financieros no se han borrado.
            </p>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-rose-200">
              {this.state.error?.message || 'Error de visualización no identificado.'}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Volver a cargar
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot(rootElement)

root.render(
  <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-300">
    Iniciando Finanzas-ui…
  </main>
)

// Load the app dynamically so startup/import errors are also displayed instead
// of leaving the user with an empty page background.
Promise.all([
  import('./App'),
  import('./lib/supabase'),
])
  .then(([{ default: App }, { installAuthenticatedApiFetch }]) => {
    installAuthenticatedApiFetch()
    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>
    )
  })
  .catch((error) => {
    console.error('No se pudo iniciar Finanzas-ui:', error)
    root.render(
      <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
        <section className="mx-auto mt-12 max-w-xl rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-xl">
          <h1 className="text-xl font-bold text-rose-300">Finanzas-ui no pudo iniciarse</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Se produjo un error al preparar la aplicación. Tus datos financieros siguen guardados en la base de datos.
          </p>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-rose-200">
            {error?.message || 'Error de inicio no identificado.'}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Volver a cargar
          </button>
        </section>
      </main>
    )
  })
