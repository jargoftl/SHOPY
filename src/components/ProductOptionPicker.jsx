import { useState } from 'react'

export default function ProductOptionPicker({ label, presets, values, onChange }) {
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const toggle = (value) => {
    if (values.includes(value)) { onChange(values.filter((item) => item !== value)); setError(''); return }
    if (values.length >= 12) { setError('Choose up to 12 options.'); return }
    onChange([...values, value]); setError('')
  }
  const addCustom = () => {
    const value = custom.trim()
    if (!value || value.length > 40 || value.includes(',')) { setError('Enter an option up to 40 characters without commas.'); return }
    if (values.some((item) => item.toLowerCase() === value.toLowerCase())) { setError('This option is already selected.'); return }
    if (values.length >= 12) { setError('Choose up to 12 options.'); return }
    onChange([...values, value]); setCustom(''); setError('')
  }
  const options = [...presets, ...values.filter((value) => !presets.includes(value))]
  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold">{label} <span className="font-normal text-[#777]">(choose up to 12)</span></legend>
    <div className="flex flex-wrap gap-2">{options.map((value) => <button type="button" key={value} aria-pressed={values.includes(value)} onClick={() => toggle(value)} className={`rounded-full border px-3 py-2 text-xs ${values.includes(value) ? 'border-[#263d35] bg-[#263d35] text-white' : 'border-[#d9dbd5] bg-white hover:border-[#263d35]'}`}>{value}</button>)}</div>
    <div className="flex gap-2"><label className="sr-only" htmlFor={`custom-${label}`}>Custom {label.toLowerCase()}</label><input id={`custom-${label}`} value={custom} onChange={(event) => setCustom(event.target.value)} maxLength={40} placeholder={`Add custom ${label.toLowerCase()}`} className="min-w-0 flex-1 rounded border border-[#d9dbd5] px-3 py-2 text-sm" /><button type="button" onClick={addCustom} className="rounded border border-[#263d35] px-4 py-2 text-xs">Add</button></div>
    {error && <p role="alert" className="text-xs text-[#a33]">{error}</p>}
  </fieldset>
}
