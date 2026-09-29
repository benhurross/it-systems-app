import type { RelationType } from "./domain";

export type Relation = { sourceId: number; targetId: number; type: RelationType };

/** Relations along which a failure travels: if the target fails, the source is affected. */
const PROPAGATES: ReadonlySet<RelationType> = new Set(["depends_on", "runs_on", "connects_to"]);

/**
 * Every configuration item affected when `id` fails, found breadth first through the
 * relations that carry failure. A backup relation does not: losing the backup server
 * does not stop what it backs up. Cycles are safe.
 */
export function impactOf(id: number, relations: Relation[]): number[] {
  const affected = new Set<number>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const r of relations) {
      if (r.targetId === current && PROPAGATES.has(r.type) && r.sourceId !== id && !affected.has(r.sourceId)) {
        affected.add(r.sourceId);
        queue.push(r.sourceId);
      }
    }
  }
  return [...affected];
}

/** Direct relations of one item: what it relies on, and what relies on it. */
export function neighbours(id: number, relations: Relation[]) {
  return {
    reliesOn: relations.filter((r) => r.sourceId === id),
    reliedOnBy: relations.filter((r) => r.targetId === id),
  };
}
