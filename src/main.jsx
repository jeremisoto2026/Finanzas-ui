import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installAuthenticatedApiFetch } from './lib/supabase'
import './styles/globals.css'

installAuthenticatedApiFetch()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
