import { FileUp, X } from 'lucide-react'
import { useRef } from 'react'

/** An optional receipt picker inside a form: shows the chosen file name and lets it be cleared. */
export default function FilePicker({ file, onChange, label = 'Receipt (optional)', hint }) {
  const ref = useRef(null)
  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={ref}
        type="file"
        accept="image/*,.pdf"
        hidden
        onChange={(e) => onChange(e.target.files[0] || null)}
      />
      <div className="file-picker">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ref.current?.click()}>
          <FileUp size={14} /> {file ? 'Change file' : 'Choose photo or PDF'}
        </button>
        {file && (
          <span className="file-picker-name">
            {file.name}
            <button
              type="button"
              className="icon-btn"
              aria-label="Clear file"
              onClick={() => {
                onChange(null)
                if (ref.current) ref.current.value = ''
              }}
            >
              <X size={13} />
            </button>
          </span>
        )}
      </div>
      {hint && <small className="field-note">{hint}</small>}
    </label>
  )
}
