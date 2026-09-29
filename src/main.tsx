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

// An Arabic visit loads its catalogue before the first paint, so the page never flashes English.
// A promise rather than a top-level await, which would make the bundler split every shared module into a chunk of its own.
void (startingLang() === 'ar' ? setLang('ar') : Promise.resolve()).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
