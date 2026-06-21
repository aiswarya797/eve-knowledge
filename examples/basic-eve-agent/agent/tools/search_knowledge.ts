import { defineTool } from "eve/tools";
import { parseSearchKnowledgeInput, searchKnowledge, toModelOutput } from "eve-knowledge";

const inputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "The natural-language knowledge search query.",
    },
    topK: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Maximum number of cited chunks to return.",
    },
    filters: {
      type: "object",
      additionalProperties: true,
      description: "Optional metadata filters such as audience, tenant, or product.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

export default defineTool({
  description: "Search the agent knowledge base and return cited results.",
  inputSchema,
  async execute(input) {
    return searchKnowledge(parseSearchKnowledgeInput(input));
  },
  toModelOutput(output) {
    return toModelOutput(output);
  },
});
