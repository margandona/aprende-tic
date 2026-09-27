import { ref, watch, type Ref } from 'vue'

export interface AsyncResult<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  reload: () => Promise<void>
}

/** Carga asíncrona con estados de carga, error y datos. */
export function useAsync<T>(loader: () => Promise<T>, deps: () => unknown[]): AsyncResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function run(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      data.value = await loader()
    } catch (err) {
      data.value = null
      error.value = err instanceof Error ? err.message : 'Error desconocido'
    } finally {
      loading.value = false
    }
  }

  watch(deps, run, { immediate: true })

  return { data, loading, error, reload: run }
}
