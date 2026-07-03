/**
 * Expression Engine — n8n-compatible expression resolver
 *
 * Supports:
 *   {{$json.fieldName}}            — current node's input JSON field
 *   {{$json["field name"]}}        — bracket notation
 *   {{$node["NodeLabel"].json.x}}  — reference another node's output
 *   {{$now}}                       — current ISO timestamp
 *   {{$today}}                     — current date (start of day)
 *   {{$runIndex}}                  — current run index
 *   {{$itemIndex}}                 — current item index in batch
 *   {{$workflow.name}}             — workflow name
 *   {{$workflow.id}}               — workflow ID
 *   {{$execution.id}}              — execution ID
 *   {{$input.all()}}               — all input items
 *   {{$input.first()}}             — first input item
 *   {{$input.last()}}              — last input item
 *   {{$binary}}                    — binary data placeholder
 *   {{lead.email}}                 — legacy template (backwards compat)
 *   {{=expression}}                — n8n-style expression prefix
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpressionContext {
  /** Current node's input JSON */
  $json: Record<string, any>;
  /** All node outputs keyed by node label */
  $nodes?: Record<string, { json: Record<string, any> }>;
  /** Current run/loop index */
  $runIndex?: number;
  /** Current item index in batch */
  $itemIndex?: number;
  /** Trigger data */
  $trigger?: Record<string, any>;
  /** Workflow metadata */
  $workflow?: { name?: string; id?: string; active?: boolean };
  /** Execution metadata */
  $execution?: { id?: string; mode?: string };
  /** Binary data placeholder */
  $binary?: Record<string, any>;
  /** Legacy lead object (backwards compat) */
  lead?: Record<string, any>;
  /** Legacy call object (backwards compat) */
  call?: Record<string, any>;
  /** Loop tracking state keyed by loop_items node ID */
  $loopState?: Record<string, { index: number; items: any[] }>;
  /** Input items array */
  $inputItems?: any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the $input accessor from context.
 */
function buildInputAccessor(ctx: ExpressionContext) {
  const items = ctx.$inputItems ?? [ctx.$json];
  return {
    all: () => items.map((d: any) => ({ json: d })),
    first: () => ({ json: items[0] ?? {} }),
    last: () => ({ json: items[items.length - 1] ?? {} }),
    item: { json: items[ctx.$itemIndex ?? 0] ?? items[0] ?? {} },
  };
}

/**
 * Build the $node["Label"] accessor proxy from node output map.
 */
function buildNodeAccessor(
  nodes: Record<string, { json: Record<string, any> }>
): (name: string) => { json: Record<string, any> } {
  return (name: string) => nodes[name] ?? { json: {} };
}

/**
 * Build the scope object for expression evaluation.
 */
function buildScope(ctx: ExpressionContext): Record<string, any> {
  const now = new Date();
  return {
    $json: ctx.$json ?? {},
    $input: buildInputAccessor(ctx),
    $node: buildNodeAccessor(ctx.$nodes ?? {}),
    $now: now.toISOString(),
    $today: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    $runIndex: ctx.$runIndex ?? 0,
    $itemIndex: ctx.$itemIndex ?? 0,
    $trigger: ctx.$trigger ?? {},
    $binary: ctx.$binary ?? {},
    $workflow: {
      name: ctx.$workflow?.name ?? "Untitled Workflow",
      id: ctx.$workflow?.id ?? "",
      active: ctx.$workflow?.active ?? false,
    },
    $execution: {
      id: ctx.$execution?.id ?? "",
      mode: ctx.$execution?.mode ?? "manual",
    },
    lead: ctx.lead ?? ctx.$json?.lead ?? {},
    call: ctx.call ?? ctx.$json?.call ?? {},
  };
}

// ── Expression Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a single expression like `{{$json.email}}` against a context.
 * Returns the resolved value (any type) or the original expression on failure.
 */
export function resolveExpression(expr: string, ctx: ExpressionContext): any {
  const inner = expr.slice(2, -2).trim(); // strip {{ and }}

  try {
    const scope = buildScope(ctx);

    // Build function with scope variables
    const keys = Object.keys(scope);
    const values = Object.values(scope);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${inner});`);
    return fn(...values);
  } catch {
    return expr; // return raw expression if evaluation fails
  }
}

/**
 * Replace all `{{...}}` expressions in a string template.
 * If the entire string is a single expression and evaluates to a non-string,
 * the raw value is returned (preserving types — objects, numbers, etc.)
 */
export function resolveTemplate(template: string, ctx: ExpressionContext): any {
  if (typeof template !== "string") return template;

  // n8n-style: ={{ expression }} prefix
  const n8nMatch = template.match(/^=\{\{(.+)\}\}$/);
  if (n8nMatch) {
    return resolveExpression(`{{${n8nMatch[1]}}}`, ctx);
  }

  const singleExprPattern = /^\{\{.+\}\}$/;
  if (singleExprPattern.test(template.trim())) {
    return resolveExpression(template.trim(), ctx);
  }

  // Multiple expressions — always returns string
  return template.replace(/\{\{([^}]+)\}\}/g, (match) => {
    const resolved = resolveExpression(match, ctx);
    if (resolved === match) return match; // unresolved — keep as-is
    return String(resolved ?? "");
  });
}

/**
 * Recursively resolve all string values in an object using the context.
 */
export function resolveConfigTemplates(
  config: Record<string, any>,
  ctx: ExpressionContext
): Record<string, any> {
  const resolved: Record<string, any> = {};
  for (const [key, val] of Object.entries(config)) {
    if (typeof val === "string") {
      resolved[key] = resolveTemplate(val, ctx);
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      resolved[key] = resolveConfigTemplates(val, ctx);
    } else if (Array.isArray(val)) {
      resolved[key] = val.map((item) =>
        typeof item === "string"
          ? resolveTemplate(item, ctx)
          : typeof item === "object" && item !== null
          ? resolveConfigTemplates(item, ctx)
          : item
      );
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Validate whether a string contains expression syntax.
 */
export function hasExpression(value: string): boolean {
  return /\{\{.+\}\}/.test(value);
}

/**
 * Get all expression tokens from a string (for UI hints).
 */
export function extractExpressions(value: string): string[] {
  const matches = value.match(/\{\{[^}]+\}\}/g);
  return matches ?? [];
}

// ── Switch Rule Evaluation ────────────────────────────────────────────────────

/**
 * Evaluate a Switch rule against a data context.
 */
export function evaluateSwitchRule(
  rule: {
    field: string;
    operator: string;
    value: string;
  },
  ctx: ExpressionContext
): boolean {
  try {
    const fieldVal = resolveTemplate(`{{${rule.field}}}`, ctx);
    const compareVal = resolveTemplate(rule.value, ctx);

    switch (rule.operator) {
      case "equals":
        return String(fieldVal).toLowerCase() === String(compareVal).toLowerCase();
      case "not_equals":
        return String(fieldVal).toLowerCase() !== String(compareVal).toLowerCase();
      case "contains":
        return String(fieldVal).toLowerCase().includes(String(compareVal).toLowerCase());
      case "not_contains":
        return !String(fieldVal).toLowerCase().includes(String(compareVal).toLowerCase());
      case "greater_than":
        return Number(fieldVal) > Number(compareVal);
      case "less_than":
        return Number(fieldVal) < Number(compareVal);
      case "is_empty":
        return fieldVal === null || fieldVal === undefined || String(fieldVal).trim() === "";
      case "is_not_empty":
        return fieldVal !== null && fieldVal !== undefined && String(fieldVal).trim() !== "";
      case "regex":
        return new RegExp(compareVal, "i").test(String(fieldVal));
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ── Code Node Execution ───────────────────────────────────────────────────────

/**
 * Execute a code node's JavaScript safely in the browser.
 * Returns { success, output, error }.
 */
export function executeCodeNode(
  code: string,
  inputData: any
): { success: boolean; output: any; error?: string; executionMs: number } {
  const start = performance.now();
  try {
    const items = Array.isArray(inputData) ? inputData : [inputData];

    // Build $input helper (n8n-compatible)
    const $input = {
      all: () => items.map((d: any) => ({ json: d })),
      first: () => ({ json: items[0] ?? {} }),
      last: () => ({ json: items[items.length - 1] ?? {} }),
      item: { json: items[0] ?? {} },
    };

    const $json = items[0] ?? {};

    // Helper functions available in code nodes
    const helpers = {
      returnJsonArray: (items: any[]) => items.map((d: any) => ({ json: d })),
      $if: (condition: any, trueVal: any, falseVal: any) => condition ? trueVal : falseVal,
      $isEmpty: (val: any) => val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0),
    };

    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "$input", "$json", "helpers",
      `"use strict";\n${code}`
    );
    const result = fn($input, $json, helpers);
    const executionMs = Math.round(performance.now() - start);
    return { success: true, output: result ?? {}, executionMs };
  } catch (err: any) {
    const executionMs = Math.round(performance.now() - start);
    return { success: false, output: null, error: err?.message ?? String(err), executionMs };
  }
}

// ── Expression Autocomplete Data ──────────────────────────────────────────────

/**
 * Available expression variables for autocomplete hints.
 */
export const EXPRESSION_VARIABLES = [
  { name: "$json", description: "Current item's JSON data", type: "object" },
  { name: "$input", description: "Input data from previous node", type: "object" },
  { name: "$input.all()", description: "All input items as array", type: "array" },
  { name: "$input.first()", description: "First input item", type: "object" },
  { name: "$input.last()", description: "Last input item", type: "object" },
  { name: "$node[\"Name\"]", description: "Reference another node's output", type: "object" },
  { name: "$now", description: "Current ISO timestamp", type: "string" },
  { name: "$today", description: "Today's date (start of day)", type: "string" },
  { name: "$runIndex", description: "Current run/loop index", type: "number" },
  { name: "$itemIndex", description: "Current item index in batch", type: "number" },
  { name: "$workflow.name", description: "Workflow name", type: "string" },
  { name: "$workflow.id", description: "Workflow ID", type: "string" },
  { name: "$execution.id", description: "Execution ID", type: "string" },
  { name: "$binary", description: "Binary data", type: "object" },
  { name: "$trigger", description: "Trigger data", type: "object" },
];

/**
 * Available expression functions for autocomplete.
 */
export const EXPRESSION_FUNCTIONS = [
  { name: "$if(condition, trueVal, falseVal)", description: "Conditional expression" },
  { name: "$isEmpty(value)", description: "Check if value is empty" },
  { name: "$toString(value)", description: "Convert to string" },
  { name: "$toNumber(value)", description: "Convert to number" },
  { name: "$isArray(value)", description: "Check if value is an array" },
];
