// From Uiverse.io by 3bdel3ziz-T - https://uiverse.io/3bdel3ziz-T/gentle-vampirebat-46
// MIT License, Copyright (c) 3bdel3ziz-T (3bdel3zizT)
import { Children, isValidElement, useId, useLayoutEffect, useRef, useState } from 'react'
import '../styles/uiverse-select.css'

function optionGroups(children) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return []
    const props = child.props
    if (child.type === 'optgroup') {
      return [{ label: props.label, options: optionGroups(props.children).flatMap(group =>
        group.options.map(option => ({ ...option, disabled: props.disabled || option.disabled }))) }]
    }
    if (child.type === 'option') return [{ options: [{
      value: String(props.value ?? props.children),
      label: props.label ?? props.children,
      disabled: props.disabled,
      hidden: props.hidden,
    }] }]
    return optionGroups(props.children)
  })
}

export default function UiverseSelect({ children, className = '', style, value, defaultValue, disabled, onChange, onInvalid, renderOption, ...props }) {
  const id = useId()
  const select = useRef(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  const hoverTimer = useRef(null)
  const hoverOpened = useRef(false)
  const search = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [nativeValue, setNativeValue] = useState(defaultValue)
  const [label, setLabel] = useState('')
  const groups = optionGroups(children)
  const options = groups.flatMap(group => group.options)
  const selected = String(value ?? nativeValue ?? '')
  const current = options.find(option => option.value === selected) ?? options[0]
  const customSupported = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'

  useLayoutEffect(() => {
    const field = select.current
    if (!customSupported) return
    setNativeValue(field.value)
    const labels = Array.from(field.labels ?? [], source => {
      const copy = source.cloneNode(true)
      copy.querySelectorAll('.uiverse-select').forEach(element => element.remove())
      return copy.textContent.trim()
    })
    setLabel(labels.filter(Boolean).join(' '))
    const form = field.form
    const reset = () => queueMicrotask(() => setNativeValue(field.value))
    form?.addEventListener('reset', reset)
    return () => {
      form?.removeEventListener('reset', reset)
      clearTimeout(hoverTimer.current)
    }
  }, [children, customSupported])

  function position() {
    const bounds = trigger.current.getBoundingClientRect()
    const width = Math.min(Math.max(160, bounds.width), window.innerWidth - 16)
    const below = window.innerHeight - bounds.bottom - 8
    const above = bounds.top - 8
    const upward = below < 180 && above > below
    Object.assign(panel.current.style, {
      width: `${width}px`,
      left: `${Math.min(bounds.left, window.innerWidth - width - 8)}px`,
      top: upward ? 'auto' : `${bounds.bottom + 3}px`,
      bottom: upward ? `${window.innerHeight - bounds.top + 3}px` : 'auto',
      maxHeight: `${Math.min(320, Math.max(0, upward ? above : below))}px`,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    const reposition = event => { if (!(event.target instanceof Node && panel.current?.contains(event.target))) position() }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  function show(fromHover = false) {
    clearTimeout(hoverTimer.current)
    if (disabled || panel.current.matches(':popover-open')) return
    hoverOpened.current = fromHover
    position()
    panel.current.showPopover()
    setOpen(true)
  }

  function hide() {
    clearTimeout(hoverTimer.current)
    panel.current?.hidePopover()
  }

  function leave() {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      if (hoverOpened.current && !panel.current?.contains(document.activeElement)) hide()
    }, 130)
  }

  function choose(next) {
    const field = select.current
    field.value = next
    field.dispatchEvent(new Event('change', { bubbles: true }))
    hide()
    trigger.current.focus()
  }

  function navigate(event) {
    if (event.key === 'Tab') {
      if (panel.current.contains(document.activeElement)) trigger.current.focus()
      hide()
      return
    }
    if (event.key === 'Escape') {
      if (!panel.current.matches(':popover-open')) return
      event.preventDefault()
      event.stopPropagation()
      hide()
      trigger.current.focus()
      return
    }
    const typeahead = event.key.length === 1 && event.key.trim() && !event.ctrlKey && !event.metaKey && !event.altKey
    if (!typeahead && !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    show()
    const items = [...panel.current.querySelectorAll('[role="option"]:not(:disabled)')]
    if (!items.length) return
    if (typeahead) {
      const time = Date.now()
      const text = (time - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase()
      search.current = { text, time }
      items.find(item => item.textContent.replace(/^\p{Regional_Indicator}{2}\s*/u, '').trim().toLocaleLowerCase().startsWith(text))?.focus()
      return
    }
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
      event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length)
    items[next].focus()
  }

  const fieldProps = {
    ...props, value, defaultValue, disabled,
    onChange: event => {
      setNativeValue(event.currentTarget.value)
      onChange?.(event)
    },
    onInvalid: event => {
      onInvalid?.(event)
      if (customSupported) trigger.current.focus()
    },
  }
  if (!customSupported) return <select {...fieldProps} ref={select} className={className} style={style}>{children}</select>

  return <span className={`uiverse-select ${className}`} style={style}>
    <select {...fieldProps} ref={select} tabIndex={-1} aria-hidden="true" className="uiverse-select-native"
      onFocus={event => { props.onFocus?.(event); trigger.current.focus() }}>{children}</select>
    <button ref={trigger} type="button" className="uiverse-select-trigger" disabled={disabled}
      aria-label={props['aria-label'] || label || props.name || undefined} aria-labelledby={props['aria-labelledby']}
      aria-description={typeof current?.label === 'string' ? current.label : undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
      onPointerEnter={event => { if (event.pointerType === 'mouse') show(true) }} onPointerLeave={leave}
      onClick={() => {
        if (!panel.current.matches(':popover-open')) show()
        else if (hoverOpened.current) hoverOpened.current = false
        else hide()
      }} onKeyDown={navigate}>
      <span>{current&&(renderOption?renderOption(current):current.label)}</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="uiverse-select-arrow" aria-hidden="true">
        <path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/>
      </svg>
    </button>
    <div id={id} ref={panel} popover="auto" role="listbox" aria-label={props['aria-label'] || label || 'Options'}
      className="uiverse-select-options" onToggle={event => setOpen(event.newState === 'open')}
      onPointerEnter={() => clearTimeout(hoverTimer.current)} onPointerLeave={leave} onKeyDown={navigate}>
      {groups.map((group, index) => {
        const choices = group.options.filter(option => !option.hidden && option !== current)
        if (!choices.length) return null
        return <div key={index} role={group.label ? 'group' : 'presentation'} aria-label={group.label}>
          {group.label && <div className="uiverse-select-group">{group.label}</div>}
          {choices.map(option => <button key={option.value} type="button" role="option" aria-selected={false}
            disabled={option.disabled} tabIndex={-1} onClick={() => choose(option.value)}>{renderOption?renderOption(option):option.label}</button>)}
        </div>
      })}
    </div>
  </span>
}
