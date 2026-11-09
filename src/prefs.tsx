import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'ko' | 'en'
type Theme = 'light' | 'dark'

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

interface Prefs {
  lang: Lang
  toggleLang: () => void
  theme: Theme
  toggleTheme: () => void
  /** 한국어/영어 문구 중 현재 언어에 맞는 것을 반환 */
  t: (ko: string, en: string) => string
  locale: string
}

const PrefsContext = createContext<Prefs | null>(null)

const systemTheme = (): Theme =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (read('pref-lang') === 'en' ? 'en' : 'ko'))
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = read('pref-theme')
    return saved === 'light' || saved === 'dark' ? saved : systemTheme()
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next = l === 'ko' ? 'en' : 'ko'
      write('pref-lang', next)
      return next
    })
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((th) => {
      const next = th === 'dark' ? 'light' : 'dark'
      write('pref-theme', next)
      return next
    })
  }, [])

  const value = useMemo<Prefs>(
    () => ({
      lang,
      toggleLang,
      theme,
      toggleTheme,
      t: (ko, en) => (lang === 'ko' ? ko : en),
      locale: lang === 'ko' ? 'ko-KR' : 'en-US',
    }),
    [lang, theme, toggleLang, toggleTheme],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider')
  return ctx
}
