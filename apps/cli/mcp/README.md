# Cogbox MCP (Model Context Protocol) Server

Cogbox MCP Server allows AI agents to utilize:

- Cogbox Sandbox Management (Create, Destroy)
- Execute commands in Cogbox Sandboxes
- File Operations in Cogbox sandboxes
- Generate preview links for web applications running in Cogbox Sandboxes

## Prerequisites

- Cogbox account
- Cogbox CLI installed
- A compatible AI agent (Claude Desktop App, Claude Code, Cursor, Windsurf)

## Steps to Integrate Cogbox MCP Server with an AI Agent

1. **Install the Cogbox CLI:**

**Mac/Linux**

```bash
OS=$(uname -s | tr '[:upper:]' '[:lower:]'); ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/'); sudo curl -fL "https://github.com/cognifyi/cogbox/releases/latest/download/cogbox-${OS}-${ARCH}" -o /usr/local/bin/cogbox && sudo chmod +x /usr/local/bin/cogbox
```

**Windows**

```bash
powershell -Command "Invoke-WebRequest -Uri https://github.com/cognifyi/cogbox/releases/latest/download/cogbox-windows-amd64.exe -OutFile cogbox.exe"
```

2. **Log in to your Cogbox account:**

```bash
cogbox login
```

3. **Initialize the Cogbox MCP server with Claude Desktop/Claude Code/Cursor/Windsurf:**

```bash
cogbox mcp init [claude/cursor/windsurf]
```

4. **Open Agent App**

## Integrating with Other AI Agents Apps

**Run the following command to get a JSON Cogbox MCP configuration which you can c/p to your agent configuration:**

```bash
cogbox mcp config
```

**Command outputs the following:**

```json
{
  "mcpServers": {
    "cogbox-mcp": {
      "command": "cogbox",
      "args": ["mcp", "start"],
      "env": {
        "HOME": "${HOME}",
        "PATH": "${HOME}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
      },
      "logFile": "${HOME}/Library/Logs/cogbox/cogbox-mcp-server.log"
    }
  }
}
```

Note: if you are running Cogbox MCP Server on Windows OS, add the following to the env field of the configuration:

```json
"APPDATA": "${APPDATA}"
```

**Finally, open or restart your AI agent**

## Available Tools

### Sandbox Management

- `create_sandbox`: Create a new sandbox with Cogbox

  - Parameters:
    - `id` (optional): Sandbox ID - if provided, an existing sandbox will be used, new one will be created otherwise
    - `target` (optional): Target region of the sandbox (if not provided, default region of the organization is used)
    - `image`: Image of the sandbox (optional)
    - `auto_stop_interval` (default: "15"): Auto-stop interval in minutes (0 means disabled)
    - `auto_archive_interval` (default: "10080"): Auto-archive interval in minutes (0 means the maximum interval will be used)
    - `auto_delete_interval` (default: "-1"): Auto-delete interval in minutes (negative value means disabled, 0 means delete immediately upon stopping)

- `destroy_sandbox`: Destroy a sandbox with Cogbox

### File Operations

- `upload_file`: Upload a file to the Cogbox sandbox

  - Files can be text or base64-encoded binary content
  - Creates necessary parent directories automatically
  - Files persist during the session and have appropriate permissions
  - Supports overwrite controls and maintains original files formats
  - Parameters:
    - `id` (optional): Sandbox ID
    - `file_path`: Path to the file to upload
    - `content`: Content of the file to upload
    - `encoding`: Encoding of the file to upload
    - `overwrite`: Overwrite the file if it already exists

- `download_file`: Download a file from the Cogbox sandbox

  - Returns file content as text or base64 encoded image
  - Handles special cases like matplotlib plots stored as JSON
  - Parameters:
    - `id` (optional): Sandbox ID
    - `file_path`: Path to the file to download

- `create_folder`: Create a new folder in the Cogbox sandbox

  - Parameters:
    - `id` (optional): Sandbox ID
    - `folder_path`: Path to the folder to create
    - `mode`: Mode of the folder to create (defaults to 0755)

- `get_file_info`: Get information about a file in the Cogbox sandbox

  - Parameters:
    - `id` (optional): Sandbox ID
    - `file_path`: Path to the file to get information about

- `list_files`: List files in a directory in the Cogbox sandbox

  - Parameters:
    - `id` (optional): Sandbox ID
    - `path`: Path to the directory to list files from (defaults to current directory)

- `move_file`: Move or rename a file in the Cogbox sandbox

  - Parameters:
    - `id` (optional): Sandbox ID
    - `source_path`: Source path of the file to move
    - `dest_path`: Destination path where to move the file

- `delete_file`: Delete a file or directory in the Cogbox sandbox

  - Parameters:
    - `id` (optional): Sandbox ID
    - `file_path`: Path to the file or directory to delete

### Git Operations

- `git_clone`: Clone a Git repository into the Cogbox sandbox

  - Parameters:
    - `id` (optional): Sandbox ID
    - `url`: URL of the Git repository to clone
    - `path`: Directory to clone the repository into (defaults to current directory)
    - `branch`: Branch to clone
    - `commit_id`: Commit ID to clone
    - `username`: Username to clone the repository with
    - `password`: Password to clone the repository with

### Command Execution

- `execute_command`: Execute shell commands in the ephemeral Cogbox Linux environment

  - Returns full stdout and stderr output with exit codes
  - Commands have sandbox user permissions
  - Parameters:
    - `id` (optional): Sandbox ID
    - `command`: Command to execute

### Preview

- `preview_link`: Generate accessible preview URLs for web applications running in the Cogbox sandbox

  - Creates a secure tunnel to expose local ports externally without configuration
  - Validates if a server is actually running on the specified port
  - Provides diagnostic information for troubleshooting
  - Supports custom descriptions and metadata for better organization of multiple services
  - Parameters:
    - `id` (optional): Sandbox ID
    - `port`: Port to expose
    - `description`: Description of the service
    - `check_server`: Check if a server is running

## Troubleshooting

- **Authentication issues:** Run `cogbox login` to refresh your credentials
- **Connection errors:** Ensure that the Cogbox MCP Server is properly configured
- **Sandbox errors:** Check sandbox status with `cogbox sandbox list`

## Support

For more information, visit [cogbox.pazity.com](https://cogbox.pazity.com) or contact support at support@pazity.com.
