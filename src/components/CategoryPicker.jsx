import { catalogTaxonomy } from '../data/catalogTaxonomy.js'

export default function CategoryPicker({ value, onChange, additionalCategories = [], dark = false }) {
  const selectedGroup = catalogTaxonomy.find((group) => value === group.name || group.items.some((item) => value === `${group.name} / ${item}`))
  const parent = selectedGroup?.name || value
  const extras = [...new Set([...additionalCategories, ...(!selectedGroup && value ? [value] : [])])]
    .filter((name) => name && !catalogTaxonomy.some((group) => name === group.name || group.items.some((item) => name === `${group.name} / ${item}`)))
    .sort((a, b) => a.localeCompare(b))
  const buttonClass = (selected) => `rounded-lg border px-3 py-2 text-left text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6a9c7a] ${selected ? (dark ? 'border-[#c8f135] bg-[#c8f135] text-[#102016]' : 'border-[#263d35] bg-[#263d35] text-white') : (dark ? 'border-[#3b5140] bg-[#07120b] text-white' : 'border-[#d9dbd5] bg-white hover:border-[#263d35]')}`
  return <div className="space-y-3">
    <fieldset>
      <legend className="text-sm font-semibold">Category <span className="font-normal opacity-70">(required)</span></legend>
      <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-[#d9dbd5] p-2">
        {[...catalogTaxonomy.map((group) => group.name), ...extras].map((name) => <button key={name} type="button" aria-pressed={parent === name} onClick={() => onChange(name)} className={buttonClass(parent === name)}>{name}</button>)}
      </div>
    </fieldset>
    {selectedGroup && <fieldset>
      <legend className="text-sm font-semibold">Subcategory <span className="font-normal opacity-70">(optional)</span></legend>
      <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-[#d9dbd5] p-2">
        <button type="button" aria-pressed={value === selectedGroup.name} onClick={() => onChange(selectedGroup.name)} className={buttonClass(value === selectedGroup.name)}>All {selectedGroup.name}</button>
        {selectedGroup.items.map((item) => <button key={item} type="button" aria-pressed={value === `${selectedGroup.name} / ${item}`} onClick={() => onChange(`${selectedGroup.name} / ${item}`)} className={buttonClass(value === `${selectedGroup.name} / ${item}`)}>{item}</button>)}
      </div>
    </fieldset>}
    <p className="text-xs opacity-70">{value ? `Selected: ${value}` : 'Choose a category, then a subcategory if needed.'}</p>
  </div>
}
