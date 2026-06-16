import type { Plan, Unit } from "./types.js";

export type ValidationError =
  | { kind: "empty_task_summary" }
  | { kind: "empty_units" }
  | { kind: "invalid_slug"; slug: string }
  | { kind: "invalid_unit_id_format"; id: string; path: string }
  | {
      kind: "duplicate_unit_id";
      id: string;
      first_path: string;
      second_path: string;
    }
  | { kind: "empty_unit_title"; unit_id: string; path: string }
  | { kind: "empty_unit_summary"; unit_id: string; path: string }
  | {
      kind: "unit_blocked_by_not_found";
      unit_id: string;
      referenced_id: string;
      path: string;
    }
  | { kind: "unit_self_dependency"; unit_id: string; path: string }
  | { kind: "unit_cyclic_dependency"; cycle: string[]; path: string };

export function formatError(e: ValidationError): string {
  switch (e.kind) {
    case "empty_task_summary":
      return "task_summary must be a non-empty string";
    case "empty_units":
      return "units must be a non-empty array";
    case "invalid_slug":
      return `invalid slug '${e.slug}': must be 1-60 chars, lowercase alphanumeric or '-', no leading/trailing hyphen`;
    case "invalid_unit_id_format":
      return `invalid unit id '${e.id}' at ${e.path}: must match ^[0-9]{2}-[a-z0-9-]+$`;
    case "duplicate_unit_id":
      return `duplicate unit id '${e.id}' at ${e.first_path} and ${e.second_path}`;
    case "empty_unit_title":
      return `unit '${e.unit_id}' at ${e.path} has an empty title`;
    case "empty_unit_summary":
      return `unit '${e.unit_id}' at ${e.path} has an empty summary`;
    case "unit_blocked_by_not_found":
      return `unit '${e.unit_id}' at ${e.path} references unknown blocked_by id '${e.referenced_id}'`;
    case "unit_self_dependency":
      return `unit '${e.unit_id}' at ${e.path} blocks itself`;
    case "unit_cyclic_dependency":
      return `cyclic unit dependency at ${e.path}: ${e.cycle.join(" -> ")}`;
  }
}

const AGENT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SLUG_BODY_RE = /^[a-z0-9-]+$/;
const UNIT_ID_RE = /^[0-9]{2}-[a-z0-9-]+$/;

export function isValidId(id: string): boolean {
  return id.length > 0 && AGENT_ID_RE.test(id);
}

export function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > 60) return false;
  if (slug.startsWith("-") || slug.endsWith("-")) return false;
  return SLUG_BODY_RE.test(slug);
}

export function isValidUnitId(id: string): boolean {
  return UNIT_ID_RE.test(id);
}

export function validatePlan(plan: Plan): ValidationError[] {
  const errors: ValidationError[] = [];

  if (plan.task_summary.length === 0) {
    errors.push({ kind: "empty_task_summary" });
  }
  if (!isValidSlug(plan.slug)) {
    errors.push({ kind: "invalid_slug", slug: plan.slug });
  }
  if (plan.units.length === 0) {
    errors.push({ kind: "empty_units" });
  }

  const seenUnitIds = new Map<string, string>();
  for (let i = 0; i < plan.units.length; i++) {
    const unit = plan.units[i]!;
    const path = `units[${i}]`;

    if (!isValidUnitId(unit.id)) {
      errors.push({ kind: "invalid_unit_id_format", id: unit.id, path });
    }

    const firstPath = seenUnitIds.get(unit.id);
    if (firstPath !== undefined) {
      errors.push({
        kind: "duplicate_unit_id",
        id: unit.id,
        first_path: firstPath,
        second_path: path,
      });
    } else {
      seenUnitIds.set(unit.id, path);
    }

    if (unit.title.length === 0) {
      errors.push({ kind: "empty_unit_title", unit_id: unit.id, path });
    }
    if (unit.summary.length === 0) {
      errors.push({ kind: "empty_unit_summary", unit_id: unit.id, path });
    }
  }

  const unitIds = new Set(plan.units.map((u) => u.id));
  for (let i = 0; i < plan.units.length; i++) {
    const unit = plan.units[i]!;
    const path = `units[${i}]`;
    for (const blocker of unit.blocked_by) {
      if (blocker === unit.id) {
        errors.push({ kind: "unit_self_dependency", unit_id: unit.id, path });
      } else if (!unitIds.has(blocker)) {
        errors.push({
          kind: "unit_blocked_by_not_found",
          unit_id: unit.id,
          referenced_id: blocker,
          path,
        });
      }
    }
  }

  detectUnitCycles(plan.units, errors);

  return errors;
}

type Color = "white" | "gray" | "black";

function detectUnitCycles(units: Unit[], errors: ValidationError[]): void {
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const color = new Map<string, Color>(
    units.map((u) => [u.id, "white" as Color]),
  );

  const dfs = (node: string, stack: string[]): void => {
    color.set(node, "gray");
    stack.push(node);

    const unit = unitMap.get(node);
    if (unit) {
      for (const dep of unit.blocked_by) {
        const depColor = color.get(dep);
        if (depColor === "gray") {
          const cycleStart = stack.indexOf(dep);
          if (cycleStart >= 0) {
            errors.push({
              kind: "unit_cyclic_dependency",
              cycle: stack.slice(cycleStart),
              path: "units",
            });
          }
        } else if (depColor === "white" && unitMap.has(dep)) {
          dfs(dep, stack);
        }
      }
    }

    stack.pop();
    color.set(node, "black");
  };

  for (const unit of units) {
    if (color.get(unit.id) === "white") {
      dfs(unit.id, []);
    }
  }
}
