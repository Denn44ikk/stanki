import { buildApp } from './app.js'

const port = Number.parseInt(process.env.PORT ?? '8787', 10)
const app = buildApp()

app.listen(port, () => {
  console.log(`stanki server listening on http://localhost:${port}`)
})
