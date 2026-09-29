import { create } from 'zustand'

/*
  English is the source language and the key. Every string is written in
  English where it is used and passed through say(); the Arabic catalogue maps
  those strings to Arabic. It loads only when Arabic is chosen, and a string
  it lacks falls back to its English, never to a blank or a key.

  Placeholders are named, {level} or {n}, so each language puts them where
  its grammar wants them. Counts go through plural(): English has two forms,
  Arabic six, and Intl.PluralRules picks the Arabic one for a number.
*/

export type Lang = 'en' | 'ar'
/** A count's wording in the Arabic plural forms; `other` covers any form left out. */
export type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
export type Catalog = Record<string, string | Forms>
type Vars = Record<string, string | number>

const KEY = 'ward-twin:lang'
const forms = new Intl.PluralRules('ar')
let catalog: Catalog | undefined

export const useLang = create<{ lang: Lang }>(() => ({ lang: 'en' }))

const arabic = () => (useLang.getState().lang === 'ar' ? catalog : undefined)
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s)

/** A string in the language on show. */
export function say(en: string, vars?: Vars) {
  const ar = arabic()?.[en]
  return fill(typeof ar === 'string' ? ar : en, vars)
}

/** A count with its noun, {n} being the count: "1 alert", "3 alerts"; in Arabic, its form for n. */
export function plural(n: number, one: string, other: string, vars?: Vars) {
  const ar = arabic()?.[other]
  const s = typeof ar === 'object' ? (ar[forms.select(n)] ?? ar.other) : n === 1 ? one : other
  return fill(s, { n: n.toLocaleString('en-US'), ...vars })
}

/** The language a visit opens in: the link's, else the one chosen last time, else English. */
export function startingLang(): Lang {
  const asked = new URLSearchParams(location.search).get('lang')
  if (asked === 'ar' || asked === 'en') return asked
  try {
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

/** Switches the interface: loads the catalogue first, then the page's language, direction, title and link. */
export async function setLang(lang: Lang) {
  if (lang === 'ar' && !catalog) catalog = (await import('./ar')).default
  useLang.setState({ lang })
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.lang = lang
  root.dir = lang === 'ar' ? 'rtl' : 'ltr'
  document.title = say('Ward Twin: a 3D digital twin of a hospital')
  const q = new URLSearchParams(location.search)
  if (lang === 'ar') q.set('lang', 'ar')
  else q.delete('lang')
  const next = q.toString().replace(/%3A/g, ':')
  history.replaceState(null, '', next ? `?${next}` : location.pathname)
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Storage can be off; the link still carries the choice.
  }
}
