/** Dev mode is on when the URL has ?dev=1 (before or inside the #hash). */
export function isDevMode(location: Location = window.location): boolean {
  const hashQuery = location.hash.includes('?')
    ? location.hash.slice(location.hash.indexOf('?'))
    : ''
  return [location.search, hashQuery].some((q) => new URLSearchParams(q).get('dev') === '1')
}

export const DEV_MODE = typeof window !== 'undefined' && isDevMode()
