declare module "eve/tools" {
  export function defineTool<TInput, TOutput>(definition: {
    description: string;
    inputSchema: unknown;
    execute(input: TInput): TOutput | Promise<TOutput>;
    toModelOutput(output: Awaited<TOutput>): { type: "json" | "text"; value: unknown };
  }): unknown;
}
