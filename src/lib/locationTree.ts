/**
 * Storage locations form a tree: Workshop › Bottom shelf › Right › Bin 3.
 * Rows come from Supabase as a flat list with parent_id; these pure helpers
 * turn that into lookups (no React, no imports, so they're easy to test).
 *
 * The database enforces the same rules (20261111000000_storage_location_hierarchy.sql):
 * at most MAX_DEPTH levels, no cycles, unique sibling names (case-insensitive).
 */

export const MAX_DEPTH = 4;
export const PATH_SEPARATOR = ' › ';

export interface LocationNode {
  id: string;
  name: string;
  parent_id?: string | null;
}

export interface LocationIndex<T extends LocationNode = LocationNode> {
  byId: Map<string, T>;
  /** Top-level nodes (and nodes whose parent isn't in the list), sorted by name. */
  roots: T[];
  /** Direct children of a node, sorted by name. `null` → the roots. */
  children: (parentId: string | null) => T[];
  /** Root → node. Empty when the id is unknown. */
  pathOf: (id: string | null | undefined) => T[];
  /** "Workshop › Bottom shelf › Right", or '' when the id is unknown. */
  pathText: (id: string | null | undefined, sep?: string) => string;
  /** The node and everything inside it. Empty when the id is unknown. */
  descendantIds: (id: string) => Set<string>;
  /** Top level = 1. 0 when the id is unknown. */
  depthOf: (id: string | null | undefined) => number;
  /** Levels below a node: 0 for a leaf. */
  subtreeHeight: (id: string) => number;
  /** Would putting `nodeId` inside `newParentId` make it its own ancestor? */
  wouldCreateCycle: (nodeId: string, newParentId: string | null) => boolean;
  /**
   * Nodes `nodeId` may move inside without a cycle or going deeper than MAX_DEPTH
   * (its current parent included; "top level" is always allowed and not listed).
   */
  validParents: (nodeId: string) => T[];
  /** Nodes that can take a new child (depth < MAX_DEPTH), in tree order. */
  canHoldChildren: () => T[];
  /** Every node in display order (depth-first, siblings by name). */
  flatten: () => T[];
}

const byName = (a: LocationNode, b: LocationNode) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

export function buildIndex<T extends LocationNode>(list: readonly T[]): LocationIndex<T> {
  const byId = new Map<string, T>();
  for (const n of list) byId.set(n.id, n);

  const kids = new Map<string | null, T[]>();
  for (const n of list) {
    // A parent that isn't loaded (deleted, other team) → treat as top level
    const p = n.parent_id && byId.has(n.parent_id) && n.parent_id !== n.id ? n.parent_id : null;
    const arr = kids.get(p) ?? [];
    arr.push(n);
    kids.set(p, arr);
  }
  for (const arr of kids.values()) arr.sort(byName);

  const parentOf = (id: string): string | null => {
    const p = byId.get(id)?.parent_id;
    return p && byId.has(p) && p !== id ? p : null;
  };

  const children = (parentId: string | null) => kids.get(parentId) ?? [];

  const pathOf = (id: string | null | undefined): T[] => {
    if (!id || !byId.has(id)) return [];
    const out: T[] = [];
    const seen = new Set<string>();
    for (let cur: string | null = id; cur && !seen.has(cur); cur = parentOf(cur)) {
      seen.add(cur);
      out.push(byId.get(cur)!);
    }
    return out.reverse();
  };

  const pathText = (id: string | null | undefined, sep = PATH_SEPARATOR) =>
    pathOf(id)
      .map((n) => n.name)
      .join(sep);

  const descendantIds = (id: string): Set<string> => {
    const out = new Set<string>();
    if (!byId.has(id)) return out;
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (out.has(cur)) continue;
      out.add(cur);
      for (const c of children(cur)) stack.push(c.id);
    }
    return out;
  };

  const depthOf = (id: string | null | undefined) => pathOf(id).length;

  const subtreeHeight = (id: string): number => {
    let h = 0;
    const walk = (cur: string, level: number, seen: Set<string>) => {
      for (const c of children(cur)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        h = Math.max(h, level);
        walk(c.id, level + 1, seen);
      }
    };
    walk(id, 1, new Set([id]));
    return h;
  };

  const wouldCreateCycle = (nodeId: string, newParentId: string | null) =>
    !!newParentId && (newParentId === nodeId || pathOf(newParentId).some((n) => n.id === nodeId));

  const flatten = (): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    const walk = (parent: string | null) => {
      for (const n of children(parent)) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        out.push(n);
        walk(n.id);
      }
    };
    walk(null);
    return out;
  };

  const validParents = (nodeId: string): T[] => {
    const inside = descendantIds(nodeId);
    const height = subtreeHeight(nodeId);
    return flatten().filter((p) => !inside.has(p.id) && depthOf(p.id) + 1 + height <= MAX_DEPTH);
  };

  const canHoldChildren = () => flatten().filter((n) => depthOf(n.id) < MAX_DEPTH);

  return {
    byId,
    roots: children(null),
    children,
    pathOf,
    pathText,
    descendantIds,
    depthOf,
    subtreeHeight,
    wouldCreateCycle,
    validParents,
    canHoldChildren,
    flatten,
  };
}

/** Rules the database trigger enforces — its messages are already written for people. */
const TREE_RULE_MESSAGES = [
  'nested at most',
  "can't be inside itself",
  'inside one of its own spots',
  'must belong to the same team',
  'parent location no longer exists',
  "can't move to another team",
];

/**
 * A readable message for a failed location insert/update, or null to fall back
 * to the generic error handler. `where` is e.g. "Workshop" or "the top level".
 */
export function locationSaveError(error: unknown, name: string, where: string): string | null {
  const e = error as { code?: string; message?: string } | null;
  const message = e?.message ?? '';
  if (e?.code === '23505' || /duplicate key|uniq_|uq_storage_locations/i.test(message)) {
    return `"${name.trim()}" already exists in ${where}`;
  }
  const rule = TREE_RULE_MESSAGES.find((m) => message.includes(m));
  return rule ? message : null;
}

/** Same name ignoring case and surrounding spaces (matches the unique index). */
export const sameLocationName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The location a typed/imported text refers to: a full path ("Workshop › Shelf",
 * "Workshop > Shelf", "Workshop / Shelf"), else a top-level place with that name,
 * else a spot with that name if there is exactly one. Null when none or ambiguous.
 */
export function findLocationByText<T extends LocationNode>(text: string, index: LocationIndex<T>): T | null {
  const parts = text
    .split(/\s*(?:›|>|\/)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length > 1) {
    let parent: string | null = null;
    let found: T | undefined;
    for (const part of parts) {
      found = index.children(parent).find((c) => sameLocationName(c.name, part));
      if (!found) break;
      parent = found.id;
    }
    if (found) return found;
  }
  const whole = text.trim();
  const top = index.roots.find((r) => sameLocationName(r.name, whole));
  if (top) return top;
  const named = [...index.byId.values()].filter((n) => sameLocationName(n.name, whole));
  return named.length === 1 ? named[0] : null;
}

export interface Stock {
  count: number;
  value: number;
}

/**
 * Per-node stock (keyed by exact node, '' = no location) rolled up so each node
 * includes everything inside it. The '' entry is carried over unchanged.
 */
export function rollUp<T extends LocationNode>(stock: Map<string, Stock> | undefined, index: LocationIndex<T>) {
  const out = new Map<string, Stock>();
  if (!stock) return out;
  for (const id of index.byId.keys()) {
    let count = 0;
    let value = 0;
    for (const d of index.descendantIds(id)) {
      const s = stock.get(d);
      if (s) {
        count += s.count;
        value += s.value;
      }
    }
    out.set(id, { count, value });
  }
  const none = stock.get('');
  if (none) out.set('', none);
  return out;
}
