import { Download, FileUp, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import api, { apiError, fmtDate, uploadFile } from '../api/client'
import { useToast } from '../context/ToastContext'
import Modal from './Modal'

/**
 * View / attach / replace / remove the receipt on any record.
 *
 * `receipt`  — the record's receipt object ({id, filename, content_type, …}) or null
 * `endpoint` — e.g. `/purchases/12/receipt`; POST attaches, DELETE removes
 * `onChanged(updatedRecord)` — called with the API's updated record
 */
export default function ReceiptModal({ title, subtitle, receipt, endpoint, onChanged, onClose, canEdit = true }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!receipt) {
      setUrl(null)
      return
    }
    let objectUrl = null
    api
      .get(`/receipts/${receipt.id}`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(new Blob([data], { type: receipt.content_type }))
        setUrl(objectUrl)
      })
      .catch((err) => toast.error(apiError(err)))
    return () => objectUrl && URL.revokeObjectURL(objectUrl)
  }, [receipt?.id]) // eslint-disable-line

  const attach = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const { data } = await uploadFile(endpoint, file)
      toast.success(receipt ? 'Receipt replaced.' : 'Receipt attached.')
      onChanged(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove this receipt?')) return
    setBusy(true)
    try {
      const { data } = await api.delete(endpoint)
      toast.success('Receipt removed.')
      onChanged(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = receipt.filename
    a.click()
  }

  const isPdf = receipt?.content_type === 'application/pdf'

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} wide={Boolean(receipt)}>
      <div className="pdf-toolbar receipt-toolbar">
        {receipt && (
          <span className="td-muted receipt-meta">
            {receipt.filename} · {(receipt.size_bytes / 1024).toFixed(0)} KB · uploaded{' '}
            {fmtDate(receipt.uploaded_at)}
          </span>
        )}
        <span className="receipt-actions">
          {receipt && (
            <button className="btn btn-secondary btn-sm" onClick={download} disabled={!url}>
              <Download size={14} /> Download
            </button>
          )}
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                hidden
                onChange={(e) => attach(e.target.files[0])}
              />
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <FileUp size={14} /> {busy ? 'Uploading…' : receipt ? 'Replace' : 'Attach a photo or PDF'}
              </button>
              {receipt && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </>
          )}
        </span>
      </div>

      {!receipt ? (
        <p className="empty-note">No receipt attached yet. Photos are shrunk automatically; PDFs are kept as they are.</p>
      ) : !url ? (
        <p className="field-note">Loading receipt…</p>
      ) : isPdf ? (
        <iframe className="pdf-frame" title={receipt.filename} src={url} />
      ) : (
        <div className="receipt-image-wrap">
          <img className="receipt-image" src={url} alt={receipt.filename} />
        </div>
      )}
    </Modal>
  )
}
