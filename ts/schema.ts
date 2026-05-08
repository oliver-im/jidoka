/**
 * Hand-authored JSON Schema for the Topology input shape. We don't generate
 * this from `topologySchema` because the Zod schema embeds runtime transforms
 * (e.g., `output: "inline" | { file }` → `Output`) that `z.toJSONSchema`
 * cannot represent. Keep this file in sync with `types.ts` when fields move.
 */
export const topologyJsonSchema: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Topology",
  type: "object",
  required: ["task_summary", "execution_mode", "agents"],
  properties: {
    task_summary: { type: "string", minLength: 1 },
    execution_mode: { type: "string", enum: ["team", "subagents"] },
    agents: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/Agent" },
    },
  },
  $defs: {
    Agent: {
      type: "object",
      required: ["id", "role", "model", "tools", "blocked_by", "background"],
      properties: {
        id: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
        role: { type: "string", minLength: 1 },
        model: { type: "string", enum: ["haiku", "sonnet", "opus"] },
        tools: { type: "array", items: { type: "string" } },
        blocked_by: { type: "array", items: { type: "string" } },
        background: { type: "boolean" },
        output: {
          oneOf: [
            { const: "inline" },
            {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", minLength: 1 } },
              additionalProperties: false,
            },
          ],
          default: "inline",
        },
        produces: { type: "string" },
        execution_mode: { type: "string", enum: ["team", "subagents"] },
        agents: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/Agent" },
        },
      },
    },
  },
};
