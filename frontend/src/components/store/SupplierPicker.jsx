import { useMemo, useState } from 'react'

export const EMPTY_SUPPLIER = { name: '', phone: '', address: '', notes: '' }

/**
 * Pick an existing supplier or add a new one on the spot — same idea as the
 * Existing / New Customer switch on the bill form.
 *
 * value = { mode: 'existing' | 'new', supplier_id: '', new_supplier: {...} }
 */
export default function SupplierPicker({ suppliers, value, onChange, error }) {
  const [filter, setFilter] = useState('')
  const set = (patch) => onChange({ ...value, ...patch })
  const setNew = (k) => (e) => set({ new_supplier: { ...value.new_supplier, [k]: e.target.value } })

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return suppliers
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(f) || (s.phone || '').toLowerCase().includes(f)
    )
  }, [suppliers, filter])

  const selected = suppliers.find((s) => String(s.id) === String(value.supplier_id))

  return (
    <div className="span-2">
      <div className="radio-row">
        <label className={`radio-pill ${value.mode === 'existing' ? 'active' : ''}`}>
          <input type="radio" checked={value.mode === 'existing'} onChange={() => set({ mode: 'existing' })} />
          Existing supplier
        </label>
        <label className={`radio-pill ${value.mode === 'new' ? 'active' : ''}`}>
          <input type="radio" checked={value.mode === 'new'} onChange={() => set({ mode: 'new' })} />
          New supplier
        </label>
      </div>

      {value.mode === 'existing' ? (
        <div className="form-grid">
          <label className="field">
            <span>Find supplier</span>
            <input
              placeholder="Type a name or phone to narrow the list…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Supplier *</span>
            <select value={value.supplier_id} onChange={(e) => set({ supplier_id: e.target.value })}>
              <option value="">— Select a supplier —</option>
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.phone ? ` — ${s.phone}` : ''}
                </option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <small className="field-note">No suppliers yet — switch to “New supplier”.</small>
            )}
          </label>
          {selected && (
            <div className="customer-preview span-2">
              <strong>{selected.name}</strong>
              {selected.phone && <span>{selected.phone}</span>}
              {selected.address && <span>{selected.address}</span>}
              {selected.outstanding > 0 && (
                <span className="amount-due">You owe them Rs {Number(selected.outstanding).toLocaleString('en-PK')}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="form-grid">
          <label className="field">
            <span>Supplier Name *</span>
            <input value={value.new_supplier.name} onChange={setNew('name')} placeholder="Person or company" />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={value.new_supplier.phone} onChange={setNew('phone')} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Address</span>
            <input value={value.new_supplier.address} onChange={setNew('address')} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={value.new_supplier.notes} onChange={setNew('notes')} placeholder="Optional" />
          </label>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

/** Shape the picker's value into the API payload fields. */
export function supplierPayload(value) {
  if (value.mode === 'existing') return { supplier_id: Number(value.supplier_id) || null, new_supplier: null }
  return {
    supplier_id: null,
    new_supplier: {
      name: value.new_supplier.name,
      phone: value.new_supplier.phone || null,
      address: value.new_supplier.address || null,
      notes: value.new_supplier.notes || null,
    },
  }
}

export function validateSupplier(value) {
  if (value.mode === 'existing' && !value.supplier_id) return 'Select a supplier.'
  if (value.mode === 'new' && !value.new_supplier.name.trim()) return 'The new supplier needs a name.'
  return ''
}
