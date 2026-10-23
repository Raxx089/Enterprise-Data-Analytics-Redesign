import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react'

const sub = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const get = () => window.location.hash.slice(1) || '/overview'

export function useRoute() {
  const full = useSyncExternalStore(sub, get)
  const [path, qs = ''] = full.split('?')
  const parts = path.split('/').filter(Boolean)
  return { path, parts, query: new URLSearchParams(qs) }
}

let dirty = false
let guard: null | (() => Promise<boolean>) = null
export const setGuard = (g: () => Promise<boolean>) => { guard = g }

/** Mark the current screen as having unsaved changes; navigation via go()/Link will ask for confirmation. */
export function useDirty(flag: boolean) {
  useEffect(() => {
    dirty = flag
    const warn = (e: BeforeUnloadEvent) => { if (flag) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); dirty = false }
  }, [flag])
}

export async function go(to: string) {
  if (dirty && guard) {
    if (!(await guard())) return
    dirty = false
  }
  window.location.hash = to
}

export function Link({ to, children, onClick, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      href={'#' + to}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        go(to)
      }}
    >
      {children}
    </a>
  )
}
