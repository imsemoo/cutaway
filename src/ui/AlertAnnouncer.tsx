import { useEffect, useState } from 'react'
import { plural, say } from '../i18n'
import { alertTitle } from '../lib/alerts'
import { alertWing } from '../lib/query'
import { alertPlace, alertWatch } from '../lib/watch'
import { shows } from '../state/scope'
import { useWard } from '../state/store'

/**
  Says the alerts that open in the place on show while the day runs, playing or live. They are
  gathered for a few seconds at a time, so a fast replay does not bury a screen reader in them.
*/
export default function AlertAnnouncer() {
  const [text, setText] = useState('')
  useEffect(() => {
    const watch = alertWatch()
    let waiting: string[] = []
    let last = 0
    let timer = 0
    const flush = () => {
      timer = 0
      last = performance.now()
      const n = waiting.length
      setText(
        n === 1
          ? say('New alert: {alert}.', { alert: waiting[0] })
          : say('{count}: {alerts}.', { count: plural(n, '{n} new alert', '{n} new alerts'), alerts: `${waiting.slice(0, 3).join('; ')}${n > 3 ? '…' : ''}` }),
      )
      waiting = []
    }
    const stop = useWard.subscribe((s) => {
      const { opened } = watch(s)
      for (const a of opened) if (s.day && shows(s.scope, alertWing(a) ?? '')) waiting.push(`${alertTitle(a)}, ${alertPlace(a, s.day)}`)
      if (waiting.length && !timer) timer = window.setTimeout(flush, Math.max(0, last + 4000 - performance.now()))
    })
    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [])
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  )
}
