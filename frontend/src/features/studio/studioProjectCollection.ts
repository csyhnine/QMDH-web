import type { Project } from "../../api";

export type ProjectMutation = { type: "upsert"; project: Project } | { type: "delete"; code: string };
export type ProjectRead = { collection: StudioProjectCollection; revision: number; serial: number };

/** Local observation only: successful mutations cannot be undone by older list reads. */
export class StudioProjectCollection {
  active = false;
  items: Project[];
  private revision = 0;
  private serial = 0;
  private deleted = new Set<string>();

  constructor(initial: Project[]) { this.items = [...initial]; }
  read(): ProjectRead { return { collection: this, revision: this.revision, serial: ++this.serial }; }
  accept(ticket: ProjectRead, incoming: Project[]): Project[] {
    if (!this.active || ticket.collection !== this || ticket.revision !== this.revision || ticket.serial !== this.serial) return this.items;
    const codes = new Set(incoming.map((project) => project.code));
    const next = incoming.filter((project) => !this.deleted.has(project.code));
    for (const code of this.deleted) if (!codes.has(code)) this.deleted.delete(code);
    this.items = next;
    return this.items;
  }
  mutate(change: ProjectMutation): Project[] {
    if (!this.active) return this.items;
    this.revision += 1;
    this.serial += 1;
    if (change.type === "delete") {
      this.deleted.add(change.code);
      this.items = this.items.filter((project) => project.code !== change.code);
    } else {
      this.deleted.delete(change.project.code);
      const exists = this.items.some((project) => project.code === change.project.code);
      this.items = exists
        ? this.items.map((project) => project.code === change.project.code ? change.project : project)
        : [...this.items, change.project];
    }
    return this.items;
  }
}
