# Payman AI Documentation MCP Server

MCP server that provides easy access to Payman AI's documentation and helps developers build integrations more efficiently.

## Overview

This repository contains the source code for a Payman documentation MCP server. This server allows AI assistants like Claude or Cursor to access Payman's documentation to help developers with their integration questions. By running this server locally, you can enhance your AI assistant's ability to provide accurate and helpful information about Payman's capabilities.

## Prerequisites

-   [Node.js](https://nodejs.org/) (v14 or higher)
-   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
-   Git

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/PaymanAI/payman-doc-mcp-server
    ```

2. Navigate to the project directory:

    ```bash
    cd payman-doc-mcp-server
    ```

3. Install dependencies:
    ```bash
    npm install
    # OR
    yarn install
    ```

## Building the Project

Build the TypeScript code into JavaScript:

```bash
npm run build
# OR
yarn build
```

## Checking Server

Check if the server is properly setup:

```bash
node /ABSOLUTE/PATH/TO/PARENT/FOLDER/payman-doc-mcp-server/build/index.js
```

If everything is good, you can now add the Payman MCP server to any client.

- For Claude Desktop: [Here](https://modelcontextprotocol.io/quickstart/server#claude-for-desktop-integration-issues)
- For Cursor: [Here](https://docs.cursor.com/context/model-context-protocol)
