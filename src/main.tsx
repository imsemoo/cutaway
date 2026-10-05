import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/schibsted-grotesk/400.css'
import '@fontsource/schibsted-grotesk/500.css'
import '@fontsource/schibsted-grotesk/600.css'
import '@fontsource/fragment-mono/400.css'
// Arabic letters only: the browser fetches these files when Arabic text is on the page.
import '@fontsource/vazirmatn/arabic-400.css'
import '@fontsource/vazirmatn/arabic-500.css'
import '@fontsource/vazirmatn/arabic-600.css'
import './styles.css'
import App from './App'
import { setLang, startingLang } from './i18n'

// The clinic, a real building read from its BIM model, is a page of its own; its code loads only when it is asked for.
const page = new URLSearchParams(location.search).get('building') === 'clinic' ? import('./clinic/ClinicApp').then((m) => m.default) : Promise.resolve(App)

// An Arabic visit loads its catalogue before the first paint, so the page never flashes English.
// A promise rather than a top-level await, which would make the bundler split every shared module into a chunk of its own.
void Promise.all([page, startingLang() === 'ar' ? setLang('ar') : undefined]).then(([Page]) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  ),
)
