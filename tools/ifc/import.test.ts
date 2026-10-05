import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
  The committed building file must be what the importer makes of the model.
  The model itself is not in the repository (docs/buildings.md fetches it),
  so where it is absent, as in CI, this is skipped.
*/
const SOURCE = 'tools/ifc/source/Clinic_Architectural.ifc'

describe.skipIf(!existsSync(SOURCE))('importing the clinic', () => {
  it('makes exactly the committed building file', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'cutaway-')), 'clinic.json')
    execFileSync(process.execPath, ['--import', 'tsx', 'tools/ifc/import.ts', SOURCE, out], { stdio: 'pipe' })
    expect(readFileSync(out, 'utf8')).toBe(readFileSync('public/buildings/clinic.json', 'utf8'))
  }, 120_000)
})
