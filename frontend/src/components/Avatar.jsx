import { useEffect, useState } from 'react'
import api from '../api/client'

// Pictures are served behind the login, so they are fetched with the token and
// cached as object URLs, keyed by user + last change.
const cache = new Map()

async function load(id, version) {
  const key = `${id}:${version}`
  if (cache.has(key)) return cache.get(key)
  const p = api
    .get(`/users/${id}/avatar`, { responseType: 'blob' })
    .then(({ data }) => URL.createObjectURL(data))
    .catch(() => null)
  cache.set(key, p)
  return p
}

const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

/** A round profile picture, falling back to initials. `size` in px. */
export default function Avatar({ user, size = 36, className = '' }) {
  const [src, setSrc] = useState(null)
  const id = user?.id
  const version = user?.avatar_updated_at || ''
  const has = Boolean(user?.has_avatar)

  useEffect(() => {
    let alive = true
    if (!has || id == null) {
      setSrc(null)
      return
    }
    load(id, version).then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [id, version, has])

  const style = { width: size, height: size, fontSize: Math.max(size * 0.4, 11) }
  if (src) return <img className={`avatar ${className}`} style={style} src={src} alt={user?.full_name || ''} />
  return (
    <span className={`avatar avatar--initials ${className}`} style={style} aria-hidden="true">
      {initials(user?.full_name || user?.email)}
    </span>
  )
}
