import { computed, onScopeDispose, ref, watch } from 'vue'
import { api } from '../api.js'

export function useMediaLibrary(kind, client = api) {
  const pageSize = computed(() => kind.value === 'video' ? 8 : 24)
  const items = ref([]), total = ref(0), offset = ref(0)
  const query = ref(''), searchTerm = ref(''), loading = ref(true), error = ref('')
  const startDate = ref(''), endDate = ref(''), dateRange = ref({})
  const filtered = computed(() => kind.value === 'video' ? !!(dateRange.value.start || dateRange.value.end) : !!searchTerm.value)
  const hasFilters = computed(() => filtered.value || (kind.value === 'video' ? !!(startDate.value || endDate.value) : !!query.value))
  let version = 0, disposed = false
  let requestedOffset = 0, requestedSearch = ''
  let requestedDates = {}

  async function load(nextOffset = requestedOffset, search = requestedSearch, dates = requestedDates) {
    const current = ++version
    const requestedKind = kind.value
    const size = pageSize.value
    const range = requestedKind === 'video' ? { ...dates } : {}
    if (requestedKind === 'video') search = ''
    requestedOffset = nextOffset
    requestedSearch = search
    requestedDates = range
    loading.value = true
    error.value = ''
    try {
      const params = new URLSearchParams({
        kind: requestedKind, limit: String(size), offset: String(nextOffset),
      })
      if (requestedKind === 'image') params.set('search', search)
      if (range.start) params.set('start_date', range.start)
      if (range.end) params.set('end_date', range.end)
      const data = await client.get(`/admin/api/media?${params}`)
      if (disposed || current !== version || requestedKind !== kind.value) return
      if (data.total > 0 && nextOffset >= data.total) {
        return await load(Math.floor((data.total - 1) / size) * size, search, range)
      }
      items.value = data.items || []
      total.value = data.total || 0
      offset.value = data.total ? nextOffset : 0
      requestedOffset = offset.value
      searchTerm.value = search
      dateRange.value = range
    } catch (e) {
      if (!disposed && current === version) error.value = e.message
    } finally {
      if (!disposed && current === version) loading.value = false
    }
  }
  function search() {
    if (kind.value === 'video' && startDate.value && endDate.value && startDate.value > endDate.value) {
      error.value = '开始日期不能晚于结束日期'
      return
    }
    return load(0, query.value.trim(), { start: startDate.value, end: endDate.value })
  }
  function reset() {
    query.value = ''; startDate.value = ''; endDate.value = ''
    return load(0, '', {})
  }
  watch(kind, () => {
    version++
    items.value = []
    total.value = 0
    offset.value = 0
    query.value = ''
    searchTerm.value = ''
    startDate.value = ''
    endDate.value = ''
    dateRange.value = {}
    requestedOffset = 0
    requestedSearch = ''
    requestedDates = {}
    load(0, '')
  })
  onScopeDispose(() => { disposed = true; version++ })
  return { items, total, offset, query, searchTerm, startDate, endDate, dateRange, filtered, hasFilters, loading, error, pageSize, load, search, reset }
}
