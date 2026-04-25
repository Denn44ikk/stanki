import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Project, ProjectSummary } from '../../shared/domain/contracts.js'
import { projectSchema } from '../../shared/domain/contracts.js'
import {
  buildProjectSummary,
  touchProject,
} from '../../shared/domain/project-engine.js'

interface ProjectRow {
  payload: string
}

export class ProjectStore {
  private readonly db: DatabaseSync

  constructor(dbPath = getDefaultDbPath()) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    }

    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `)
  }

  listProjects(): ProjectSummary[] {
    const rows = this.db
      .prepare('SELECT payload FROM projects ORDER BY updated_at DESC')
      .all() as unknown as ProjectRow[]

    return rows
      .map((row) => projectSchema.parse(JSON.parse(row.payload)))
      .map((project) => buildProjectSummary(project))
  }

  getProject(projectId: string) {
    const row = this.db
      .prepare('SELECT payload FROM projects WHERE id = ?')
      .get(projectId) as ProjectRow | undefined

    if (!row) {
      return null
    }

    return projectSchema.parse(JSON.parse(row.payload))
  }

  saveProject(project: Project) {
    const nextProject = projectSchema.parse(touchProject(project))

    this.db
      .prepare(`
        INSERT INTO projects (id, title, mode, status, updated_at, payload)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          mode = excluded.mode,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `)
      .run(
        nextProject.id,
        nextProject.title,
        nextProject.mode,
        nextProject.status,
        nextProject.updatedAt,
        JSON.stringify(nextProject),
      )

    return nextProject
  }
}

function getDefaultDbPath() {
  return process.env.STANKI_DB_PATH ?? path.join(process.cwd(), 'data', 'projects.sqlite')
}
