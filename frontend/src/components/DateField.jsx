import { todayISO } from '../api/client'

/** Manual date entry: a calendar picker that defaults to today and never allows the future. */
export default function DateField({ label = 'Date', value, onChange, required = true, note, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="date"
        value={value}
        max={todayISO()}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {note && <small className="field-note">{note}</small>}
    </label>
  )
}
