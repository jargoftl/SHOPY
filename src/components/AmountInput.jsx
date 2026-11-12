import { useState } from 'react'
import { formatAmountInput } from '../lib/money.js'

const AmountInput = ({ name, className, placeholder }) => {
  const [value, setValue] = useState('')
  return <input name={name} type="text" inputMode="decimal" autoComplete="off" required maxLength={14} placeholder={placeholder} value={value} onChange={(event) => {
    const formatted = formatAmountInput(event.target.value)
    if (formatted !== null) setValue(formatted)
  }} className={className} />
}

export default AmountInput
