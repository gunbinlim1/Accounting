import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface Command {
  id: string
  label: string
  hint?: string
  icon?: ReactNode
  keywords?: string
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  commands: Command[]
  placeholder: string
  emptyText: string
}

export default function CommandPalette(props: Props) {
  return props.open ? <PaletteDialog {...props} /> : null
}

function PaletteDialog({ onClose, commands, placeholder, emptyText }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q))
  }, [commands, query])

  const run = (c: Command | undefined) => {
    if (!c) return
    onClose()
    c.run()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                run(filtered[index])
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {filtered.length === 0 && <li className="palette-empty">{emptyText}</li>}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'selected' : ''}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
            >
              <span className="palette-icon">{c.icon}</span>
              <span className="palette-label">{c.label}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
              {i === index && <CornerDownLeft size={14} className="palette-enter" aria-hidden />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
