import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('ms_token')
      localStorage.removeItem('ms_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Turn any API error into a readable sentence.
export function apiError(err) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = (d.loc || []).filter((p) => p !== 'body').join(' → ')
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join('; ')
  }
  if (err?.message === 'Network Error')
    return 'Cannot reach the server. Is the backend running on port 8000?'
  return err?.message || 'Something went wrong.'
}

export const fmtMoney = (n) =>
  'Rs ' +
  Number(n ?? 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

export const fmtDay = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

// ---------------------------------------------------------------- manual dates
// Every record date is typed by hand as a plain local day. The API takes the
// YYYY-MM-DD plus the browser's timezone offset and stores it as UTC.
export const tzOffset = () => new Date().getTimezoneOffset()

export const isoDay = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const todayISO = () => isoDay(new Date())

/** ISO timestamp from the API -> YYYY-MM-DD in local time, for a date input. */
export const toDayInput = (iso) => (iso ? isoDay(new Date(iso)) : todayISO())

/** Upload a single file as multipart/form-data to `url` (POST). */
export const uploadFile = (url, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(url, form)
}

export default api
