import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { buildApp } from './app.js'

loadEnvironment()

const port = Number.parseInt(process.env.PORT ?? '8787', 10)
const app = buildApp()

app.listen(port, () => {
  console.log(`stanki server listening on http://localhost:${port}`)
})

function loadEnvironment() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env.local'),
    path.resolve(process.cwd(), '..', '.env'),
  ]

  for (const envFile of envCandidates) {
    if (!existsSync(envFile)) {
      continue
    }

    process.loadEnvFile(envFile)
    break
  }
}
