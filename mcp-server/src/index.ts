import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// The name and version are sent to the client in the `initialize` response.
const server = new McpServer({ name: "travel-planner", version: "0.1.0" });

// Tools, resources, and prompts get registered here in later steps.

// stdio transport: the host starts this process and exchanges JSON-RPC messages
// over stdin and stdout. Stdout belongs to the protocol, so log only to stderr.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("travel-planner MCP server running on stdio");
