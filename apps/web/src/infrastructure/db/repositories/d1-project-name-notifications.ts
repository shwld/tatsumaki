import type {
  ProjectNameNotification,
  ProjectNameNotifications,
} from "../../../application/ports/project-name-notifications";
export class D1ProjectNameNotifications implements ProjectNameNotifications {
  constructor(private readonly db: D1Database) {}
  async listPending(limit: number): Promise<ProjectNameNotification[]> {
    const rows = await this.db
      .prepare(
        "SELECT project_id, name, revision FROM project_name_notifications WHERE notified_revision != revision ORDER BY last_attempt_at, project_id LIMIT ?",
      )
      .bind(limit)
      .all<{ project_id: string; name: string; revision: number }>();
    return rows.results.map((row) => ({
      projectId: row.project_id,
      name: row.name,
      revision: row.revision,
    }));
  }
  async markDelivered(notification: ProjectNameNotification): Promise<void> {
    await this.db
      .prepare(
        "UPDATE project_name_notifications SET notified_revision = ? WHERE project_id = ? AND revision = ?",
      )
      .bind(
        notification.revision,
        notification.projectId,
        notification.revision,
      )
      .run();
  }
  async markAttempt(projectId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE project_name_notifications SET last_attempt_at = ? WHERE project_id = ?",
      )
      .bind(new Date().toISOString(), projectId)
      .run();
  }
}
