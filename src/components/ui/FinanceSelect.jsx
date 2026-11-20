import { Children, Fragment, isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight, Banknote, BookOpen, Briefcase, Calendar, Car, Check, ChevronDown,
  CreditCard, Film, Gift, Heart, Home, Landmark, Laptop, MoreHorizontal, Receipt,
  Shirt, ShoppingCart, Smartphone, Users, Wallet, Wifi, Zap,
} from 'lucide-react'
import './FinanceSelect.css'

const ICON_RULES = [
  { pattern: /aliment|comida|compra|mercad|supermerc|restaur|caf[eé]/, Icon: ShoppingCart, tone: 'emerald' },
  { pattern: /educaci|estudio|formaci|libro|curso/, Icon: BookOpen, tone: 'sky' },
  { pattern: /familia|hijo|niñ|bebe|mascota/, Icon: Users, tone: 'pink' },
  { pattern: /ocio|cine|entreten|juego|streaming|m[uú]sica/, Icon: Film, tone: 'violet' },
  { pattern: /ropa|calzado|vestir|textil/, Icon: Shirt, tone: 'fuchsia' },
  { pattern: /salud|farmacia|m[eé]dic|dent|hospital/, Icon: Heart, tone: 'rose' },
  { pattern: /servicio|suscrip|factura|internet|telefon|luz|agua|gas/, Icon: Receipt, tone: 'amber' },
  { pattern: /tecnolog|inform[aá]tic|ordenador|port[aá]til|electr[oó]nic/, Icon: Laptop, tone: 'cyan' },
  { pattern: /transporte|gasolina|combustible|coche|patinete|taxi|parking|viaje|bus|metro/, Icon: Car, tone: 'amber' },
  { pattern: /hogar|vivienda|alquiler|casa|mueble|reparaci[oó]n/, Icon: Home, tone: 'orange' },
  { pattern: /n[oó]mina|trabajo|reparto|salario|ingreso laboral/, Icon: Briefcase, tone: 'blue' },
  { pattern: /regalo|donaci[oó]n|celebraci[oó]n/, Icon: Gift, tone: 'pink' },
  { pattern: /bbva|revolut|banco|bank|entidad/, Icon: Landmark, tone: 'sky' },
  { pattern: /efectivo|cash|billete/, Icon: Banknote, tone: 'emerald' },
  { pattern: /tarjeta|cr[eé]dito|d[eé]bito|card/, Icon: CreditCard, tone: 'violet' },
  { pattern: /bizum|transfer|traspaso|movimiento entre/, Icon: ArrowLeftRight, tone: 'cyan' },
  { pattern: /monedero|wallet|google pay|google wallet/, Icon: Wallet, tone: 'emerald' },
  { pattern: /ahorro|hucha|reserva/, Icon: Wallet, tone: 'teal' },
  { pattern: /mes|fecha|d[ií]a|hora|vencimiento|periodo|frecuencia/, Icon: Calendar, tone: 'sky' },
  { pattern: /m[oó]vil|smartphone|tel[eé]fono/, Icon: Smartphone, tone: 'cyan' },
  { pattern: /wifi|internet/, Icon: Wifi, tone: 'cyan' },
  { pattern: /electricidad|energ[ií]a/, Icon: Zap, tone: 'amber' },
]

const TONE_CLASSES = {
  emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/15',
  sky: 'bg-sky-500/10 text-sky-300 ring-sky-500/15',
  pink: 'bg-pink-500/10 text-pink-300 ring-pink-500/15',
  violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/15',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/15',
  rose: 'bg-rose-500/10 text-rose-300 ring-rose-500/15',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/15',
  cyan: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/15',
  orange: 'bg-orange-500/10 text-orange-300 ring-orange-500/15',
  blue: 'bg-blue-500/10 text-blue-300 ring-blue-500/15',
  teal: 'bg-teal-500/10 text-teal-300 ring-teal-500/15',
}

function nodeText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement(node)) return nodeText(node.props.children)
  return ''
}

function parseOptions(children) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return []
    if (child.type === Fragment) return parseOptions(child.props.children)
    if (child.type === 'optgroup') {
      return [{
        type: 'group',
        key: child.key || child.props.label,
        label: child.props.label || '',
        options: parseOptions(child.props.children),
      }]
    }
    if (child.type !== 'option') return []
    const label = nodeText(child.props.children).trim()
    const optionValue = child.props.value === undefined ? label : String(child.props.value)
    return [{
      type: 'option',
      key: child.key || `${optionValue}-${label}`,
      value: optionValue,
      label,
      disabled: Boolean(child.props.disabled),
      selected: Boolean(child.props.selected),
    }]
  })
}

function flattenOptions(items) {
  return items.flatMap((item) => item.type === 'group' ? flattenOptions(item.options) : [item])
}

function getOptionIcon(label = '') {
  const normalized = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return ICON_RULES.find((item) => item.pattern.test(normalized)) || { Icon: MoreHorizontal, tone: 'emerald' }
}

export default function FinanceSelect({
  children, value, defaultValue, onChange, name, id, required = false, disabled = false,
  className = '', placeholder, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...buttonProps
}) {
  const options = useMemo(() => parseOptions(children), [children])
  const flatOptions = useMemo(() => flattenOptions(options), [options])
  const [internalValue, setInternalValue] = useState(() => {
    if (defaultValue !== undefined) return String(defaultValue ?? '')
    const selected = flatOptions.find((option) => option.selected)
    return selected?.value ?? flatOptions.find((option) => !option.disabled)?.value ?? ''
  })
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const currentValue = value !== undefined ? String(value ?? '') : internalValue
  const selectedOption = flatOptions.find((option) => option.value === currentValue)
  const selectedLabel = selectedOption?.label || placeholder || flatOptions[0]?.label || 'Seleccionar'
  const selectedIcon = getOptionIcon(selectedLabel)
  const SelectedIcon = selectedIcon.Icon

  useEffect(() => {
    if (!open) return undefined
    const closeWhenOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    document.addEventListener('focusin', closeWhenOutside)
    const activeOption = menuRef.current?.querySelector('[aria-selected="true"]:not(:disabled)')
      || menuRef.current?.querySelector('[role="option"]:not(:disabled)')
    activeOption?.focus()
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      document.removeEventListener('focusin', closeWhenOutside)
    }
  }, [open])

  const chooseOption = (option) => {
    if (option.disabled || disabled) return
    if (value === undefined) setInternalValue(option.value)
    onChange?.({ target: { name, value: option.value } })
    setOpen(false)
    triggerRef.current?.focus()
  }

  const focusRelativeOption = (event, direction) => {
    const available = Array.from(menuRef.current?.querySelectorAll('[role="option"]:not(:disabled)') || [])
    if (!available.length) return
    const currentIndex = available.indexOf(document.activeElement)
    const nextIndex = direction === 'first' ? 0 : direction === 'last'
      ? available.length - 1 : (currentIndex + direction + available.length) % available.length
    event.preventDefault()
    available[nextIndex]?.focus()
  }

  const renderOption = (option) => {
    const { Icon, tone } = getOptionIcon(option.label)
    const selected = option.value === currentValue
    return (
      <button
        key={option.key}
        type="button"
        role="option"
        aria-selected={selected}
        disabled={option.disabled}
        onClick={() => chooseOption(option)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') focusRelativeOption(event, 1)
          if (event.key === 'ArrowUp') focusRelativeOption(event, -1)
          if (event.key === 'Home') focusRelativeOption(event, 'first')
          if (event.key === 'End') focusRelativeOption(event, 'last')
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            triggerRef.current?.focus()
          }
        }}
        className={`finance-select-option flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${selected ? 'is-selected' : ''}`}
      >
        <span className={`finance-select-option-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${TONE_CLASSES[tone] || TONE_CLASSES.emerald}`}>
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {selected && <Check size={17} className="shrink-0 text-emerald-300" aria-hidden="true" />}
      </button>
    )
  }

  const renderMenuItems = (items) => items.map((item) => item.type === 'group' ? (
    <div key={item.key} className="finance-select-group">
      {item.label && <div className="finance-select-group-label">{item.label}</div>}
      <div className="space-y-1">{item.options.map(renderOption)}</div>
    </div>
  ) : renderOption(item))

  return (
    <div ref={rootRef} className="finance-select-root relative w-full">
      <button
        {...buttonProps}
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id || name || 'finance-select'}-listbox`}
        aria-required={required || undefined}
        className={`finance-select-trigger flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm outline-none transition ${className}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
          if (event.key === 'Escape') setOpen(false)
          buttonProps.onKeyDown?.(event)
        }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`finance-select-current-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${TONE_CLASSES[selectedIcon.tone] || TONE_CLASSES.emerald}`}>
            <SelectedIcon size={16} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="truncate">{selectedLabel}</span>
        </span>
        <ChevronDown size={17} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`${id || name || 'finance-select'}-listbox`}
          role="listbox"
          aria-label={ariaLabel || 'Opciones'}
          aria-labelledby={ariaLabelledBy}
          className="finance-select-menu absolute left-0 right-0 z-[80] mt-2 max-h-72 overflow-y-auto rounded-2xl p-2 shadow-2xl"
        >
          {renderMenuItems(options)}
        </div>
      )}
      <select
        className="finance-select-native"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={currentValue}
        required={required}
        disabled={disabled}
        onChange={() => {}}
      >
        {children}
      </select>
    </div>
  )
}
