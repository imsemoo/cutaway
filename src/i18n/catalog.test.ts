import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { WINGS, isBed } from '../data/floorplan'
import { ALERT_TITLE } from '../lib/alerts'
import { ASSET_LABEL, ASSET_STATUS_LABEL, BED_LABEL } from '../lib/query'
import { simulate } from '../sim/simulate'
import arabic from './ar'
import { plural, say, setLang, type Catalog } from '.'

const ar: Catalog = arabic
/** Every source file of the app, as text, by its path from here. */
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./ar.ts'], { query: '?raw', import: 'default', eager: true })

/** Every string the code hands to say() or plural(), and the labels of the switches it maps through say(). */
function keysInCode() {
  const said = new Set<string>()
  const counted = new Set<string>()
  const literals = (node: ts.Node | undefined): string[] =>
    !node
      ? []
      : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? [node.text]
        : ts.isConditionalExpression(node)
          ? [...literals(node.whenTrue), ...literals(node.whenFalse)]
          : ts.isParenthesizedExpression(node)
            ? literals(node.expression)
            : []
  for (const [file, text] of Object.entries(SOURCES)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'say') literals(node.arguments[0]).forEach((k) => said.add(k))
        if (node.expression.text === 'plural') literals(node.arguments[2]).forEach((k) => counted.add(k))
      }
      // The view, layer and mode switches keep their labels in arrays and pass them through say().
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'label' && file.startsWith('../ui/')) {
        literals(node.initializer).forEach((k) => said.add(k))
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return { said, counted }
}

/** Strings that reach say() from data rather than from the code. */
function keysInData() {
  const day = simulate()
  return new Set([
    ...Object.values(BED_LABEL),
    ...Object.values(ASSET_LABEL),
    ...Object.values(ASSET_STATUS_LABEL),
    ...Object.values(ALERT_TITLE),
    ...WINGS[0].rooms.filter((r) => !isBed(r)).map((r) => r.name),
    ...Object.values(day.rooms).flatMap((r) => r.spans.map((s) => s.note).filter((n): n is string => !!n)),
    'critical',
    'warning',
    'info',
  ])
}

const holes = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))

describe('the Arabic catalogue', () => {
  const { said, counted } = keysInCode()
  const data = keysInData()

  it('translates every string the interface says', () => {
    const missing = [...said, ...data].filter((k) => typeof ar[k] !== 'string')
    expect(missing).toEqual([])
  })

  it('gives every count its Arabic forms', () => {
    const missing = [...counted].filter((k) => typeof ar[k] !== 'object')
    expect(missing).toEqual([])
  })

  it('keeps the same placeholders, so no number or name goes missing', () => {
    const wrong = Object.entries(ar).flatMap(([key, value]) => {
      const want = holes(key)
      if (typeof value === 'string') return [...holes(value)].sort().join() === [...want].sort().join() ? [] : [key]
      // A form may leave the count out, as "دقيقتان" does, but never adds one.
      return Object.values(value).some((form) => [...holes(form)].some((h) => !want.has(h))) ? [key] : []
    })
    expect(wrong).toEqual([])
  })

  it('holds nothing the interface no longer says', () => {
    const used = new Set([...said, ...counted, ...data])
    expect(Object.keys(ar).filter((k) => !used.has(k))).toEqual([])
  })

  it('counts in Arabic by its plural rules, and falls back to English for a string it lacks', async () => {
    await setLang('ar')
    const mins = (n: number) => plural(n, '{n} min', '{n} min')
    expect([1, 2, 3, 10, 11, 100].map(mins)).toEqual(['دقيقة واحدة', 'دقيقتان', '3 دقائق', '10 دقائق', '11 دقيقة', '100 دقيقة'])
    expect(say('Needs attention')).toBe('يحتاج انتباهًا')
    expect(say('A string no one wrote {x}', { x: 1 })).toBe('A string no one wrote 1')
    await setLang('en')
    expect(mins(1)).toBe('1 min')
  })
})
