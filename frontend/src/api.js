const TOKEN_KEY = 'agnes_admin_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

async function request(method, url, body, isForm = false) {
  const headers = { 'X-Admin-Token': getToken() }
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && location.hash !== '#/login') {
    setToken('')
    location.hash = '#/login'
    throw new Error('登录已失效，请重新登录')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    /* 空响应 */
  }
  if (!res.ok) throw new Error(data?.error?.message || data?.detail || `HTTP ${res.status}`)
  return data
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b),
  postForm: (u, fd) => request('POST', u, fd, true),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
}

export const fmtNum = (v) => (Number(v) || 0).toLocaleString()
export const fmtCost = (v) => '¥' + (Number(v) || 0).toFixed(4)
export const fmtTime = (ts) => (ts ? ts.slice(5, 19) : '-')
