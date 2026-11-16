import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// The name and version are sent to the client in the `initialize` response.
const server = new McpServer({ name: "travel-planner", version: "0.1.0" });

// Step 3: a hello-world tool to learn tools/list and tools/call.
// The zod shape in `inputSchema` becomes the JSON Schema the client sees in
// tools/list, and the SDK validates `tools/call` arguments against it before
// the handler runs. Registering a tool also adds the `tools` capability.
server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Reply with a greeting. Used to test the connection.",
    inputSchema: { name: z.string().describe("Who to greet") },
    annotations: { readOnlyHint: true },
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}` }],
  }),
);

// stdio transport: the host starts this process and exchanges JSON-RPC messages
// over stdin and stdout. Stdout belongs to the protocol, so log only to stderr.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("travel-planner MCP server running on stdio");
