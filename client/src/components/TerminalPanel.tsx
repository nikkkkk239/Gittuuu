import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";
import { X } from "lucide-react";

interface TerminalPanelProps {
  initialCwd?: string;
  onClose?: () => void;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ initialCwd, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>();
  const fitAddon = useRef<FitAddon | null>(null);
  const webLinksAddon = useRef<WebLinksAddon | null>(null);
  const terminalIdRef = useRef<number | null>(null);
  const [currentCwd, setCurrentCwd] = useState<string>("");
  const commandBuffer = useRef<string>("");
  const commandHistory = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);
  const isInitialized = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const processEndedUnsubscribeRef = useRef<(() => void) | null>(null);
  const isProcessRunning = useRef<boolean>(false);
  const lastRunningCheckRef = useRef<{ time: number; result: boolean }>({ time: 0, result: false });
  
  // Function to execute a command programmatically (called from parent)
  const executeCommandProgrammatically = useRef<((command: string, cwd?: string) => void) | null>(null);
  
  // Check if process is running with caching to avoid too many IPC calls
  const checkIfProcessRunningRef = useRef<(() => Promise<boolean>) | null>(null);
  
  // Store handleRunCommand handler so it can be cleaned up
  const handleRunCommandRef = useRef<((event: Event) => void) | null>(null);

  useEffect(() => {
    if (!terminalRef.current || isInitialized.current) return;
    
    isInitialized.current = true;

    // Create new FitAddon instance for this mount
    fitAddon.current = new FitAddon();
    webLinksAddon.current = new WebLinksAddon((event, uri) => {
      event.preventDefault();
      window.electronAPI.openExternal(uri);
    });

    // Initialize xterm
    term.current = new Terminal({
      cursorBlink: true,
      scrollback: 10000,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#ffffff",
        cursor: "#ffffff",
        black: "#000000",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#d19a66",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#d19a66",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      },
    });

    if (fitAddon.current) {
      term.current.loadAddon(fitAddon.current);
    }
    if (webLinksAddon.current) {
      term.current.loadAddon(webLinksAddon.current);
    }
    term.current.open(terminalRef.current);
    
    // Use requestAnimationFrame to ensure DOM is ready, then fit
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          if (fitAddon.current && term.current && terminalRef.current) {
            fitAddon.current.fit();
          }
        } catch (err) {
          console.warn("Failed to fit terminal:", err);
        }
      }, 100);
    });

    // Create terminal session first
    window.electronAPI.terminal.create().then(async (result: any) => {
      terminalIdRef.current = result.id;
      
      // Now set up output listener with the terminal ID
      unsubscribeRef.current = window.electronAPI.terminal.onOutput(
        (id: number, data: string) => {
          // Only process output for our terminal
          if (id === terminalIdRef.current && term.current) {
            term.current.write(data.replace(/\n/g, "\r\n"));
            // When we receive output, the process is definitely running
            // This helps keep state in sync
            isProcessRunning.current = true;
          }
        }
      );
      
      // Listen for process ended events
      processEndedUnsubscribeRef.current = window.electronAPI.terminal.onProcessEnded(
        (id: number) => {
          if (id === terminalIdRef.current) {
            isProcessRunning.current = false;
            // Get updated CWD and write prompt after a small delay to ensure output is complete
            setTimeout(() => {
              window.electronAPI.terminal.getCwd(terminalIdRef.current).then((updatedCwd) => {
                if (updatedCwd) {
                  setCurrentCwd(updatedCwd);
                  writePrompt(updatedCwd);
                } else {
                  writePrompt(currentCwd);
                }
              });
            }, 50);
          }
        }
      );
      
      // Expose function to execute commands programmatically
      executeCommandProgrammatically.current = (command: string, cwd?: string) => {
        if (terminalIdRef.current !== null) {
          if (cwd && cwd !== currentCwd) {
            // Change to the specified directory first
            window.electronAPI.terminal.chdir(terminalIdRef.current, cwd).then((result) => {
              if (result.success) {
                setCurrentCwd(result.cwd);
                executeCommand(command);
              } else {
                executeCommand(command); // Execute anyway
              }
            });
          } else {
            executeCommand(command);
          }
        }
      };
      
      // Listen for runCommand custom events from parent component
      handleRunCommandRef.current = (event: Event) => {
        const customEvent = event as CustomEvent;
        const { command, cwd } = customEvent.detail;
        if (executeCommandProgrammatically.current) {
          // Small delay to ensure terminal is ready
          setTimeout(() => {
            executeCommandProgrammatically.current!(command, cwd);
          }, term.current ? 100 : 500);
        }
      };
      
      window.addEventListener('terminal:runCommand', handleRunCommandRef.current);
      
      // If initialCwd is provided, change to that directory
      if (initialCwd) {
        console.log("Setting initial directory to:", initialCwd);
        const cdResult = await window.electronAPI.terminal.chdir(result.id, initialCwd);
        console.log("CD result:", cdResult);
        if (cdResult.success) {
          setCurrentCwd(cdResult.cwd);
          writePrompt(cdResult.cwd);
        } else {
          // If cd fails, use default cwd
          console.warn("Failed to cd to initial directory, using default");
          setCurrentCwd(result.cwd);
          writePrompt(result.cwd);
        }
      } else {
        console.log("No initial directory provided, using default:", result.cwd);
        setCurrentCwd(result.cwd);
        writePrompt(result.cwd);
      }
      
      // Define check function and store in ref for use by onData handler
      checkIfProcessRunningRef.current = async (): Promise<boolean> => {
        if (terminalIdRef.current === null) return false;
        
        // Cache for 50ms to avoid excessive IPC calls while still being responsive
        const now = Date.now();
        if (now - lastRunningCheckRef.current.time < 50) {
          return lastRunningCheckRef.current.result || isProcessRunning.current;
        }
        
        try {
          const result = await window.electronAPI.terminal.isRunning(terminalIdRef.current);
          lastRunningCheckRef.current = { time: now, result: result.isRunning };
          isProcessRunning.current = result.isRunning;
          return result.isRunning;
        } catch (err) {
          console.error("Error checking if process is running:", err);
          return isProcessRunning.current;
        }
      };

    // Handle user input
    term.current.onData(async (data) => {
      if (!term.current || terminalIdRef.current === null) return;

      // Check if process is actually running (with caching to avoid too many checks)
      // This ensures we catch cases where process is waiting for input
      const processIsRunning = checkIfProcessRunningRef.current 
        ? await checkIfProcessRunningRef.current()
        : isProcessRunning.current;

      // If process is running, send input directly to stdin
      if (processIsRunning) {
        // Update local state
        isProcessRunning.current = true;
        
        // Process is running - send input directly to stdin
        const code = data.charCodeAt(0);
        
        // Handle Ctrl+C separately
        if (code === 3) { // Ctrl+C
          term.current.write("^C\r\n");
          window.electronAPI.terminal.write(terminalIdRef.current, data).catch((err) => {
            console.error("Failed to send Ctrl+C:", err);
          });
          return;
        }
        
        // For interactive programs, echo characters as user types
        // Python's input() doesn't echo, so we need to manually echo
        if (code === 13) { // Enter key - send newline
          term.current.write("\r\n"); // Echo the newline
          window.electronAPI.terminal.write(terminalIdRef.current, "\n").then((result) => {
            if (!result.success) {
              console.error("Failed to write to process:", result.error);
              isProcessRunning.current = false;
            }
          }).catch((err) => {
            console.error("Error writing to process:", err);
            isProcessRunning.current = false;
          });
        } else {
          // Echo regular characters since Python input() doesn't echo
          term.current.write(data);
          window.electronAPI.terminal.write(terminalIdRef.current, data).then((result) => {
            if (!result.success) {
              console.error("Failed to write to process:", result.error);
              isProcessRunning.current = false;
            }
          }).catch((err) => {
            console.error("Error writing to process:", err);
            isProcessRunning.current = false;
          });
        }
        return;
      }

      // No process running - handle as command input
      const code = data.charCodeAt(0);

      // Enter key
      if (code === 13) {
        const command = commandBuffer.current.trim();
        term.current.write("\r\n");

        if (command) {
          // Add to history
          commandHistory.current.push(command);
          historyIndex.current = commandHistory.current.length;

          // Handle built-in commands
          if (command.startsWith("cd ")) {
            const newDir = command.substring(3).trim();
            console.log("CD command detected. Full command:", JSON.stringify(command), "Extracted dir:", JSON.stringify(newDir), "Current CWD:", currentCwd);
            handleCd(newDir);
          } else if (command === "clear") {
            term.current.clear();
            writePrompt(currentCwd);
          } else {
            // Execute command
            // Mark as running BEFORE execution - important for interactive programs
            isProcessRunning.current = true;
            // Execute without awaiting - this allows interactive programs to continue running
            executeCommand(command);
          }
        } else {
          writePrompt(currentCwd);
        }

        commandBuffer.current = "";
      }
      // Backspace
      else if (code === 127) {
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1);
          term.current.write("\b \b");
        }
      }
      // Up arrow (previous command)
      else if (data === "\x1b[A") {
        if (historyIndex.current > 0) {
          historyIndex.current--;
          const prevCommand = commandHistory.current[historyIndex.current];
          replaceCommandLine(prevCommand);
        }
      }
      // Down arrow (next command)
      else if (data === "\x1b[B") {
        if (historyIndex.current < commandHistory.current.length - 1) {
          historyIndex.current++;
          const nextCommand = commandHistory.current[historyIndex.current];
          replaceCommandLine(nextCommand);
        } else {
          historyIndex.current = commandHistory.current.length;
          replaceCommandLine("");
        }
      }
      // Ctrl+C
      else if (code === 3) {
        term.current.write("^C\r\n");
        commandBuffer.current = "";
        writePrompt(currentCwd);
      }
      // Ctrl+L (clear)
      else if (code === 12) {
        term.current.clear();
        commandBuffer.current = "";
        writePrompt(currentCwd);
      }
      // Regular character
      else if (code >= 32 && code < 127) {
        commandBuffer.current += data;
        term.current.write(data);
      }
    });
    
    }); // Close the .then() callback

    // Resize handler
    const handleResize = () => {
      try {
        fitAddon.current?.fit();
      } catch (err) {
        // Ignore fit errors during resize
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (processEndedUnsubscribeRef.current) {
        processEndedUnsubscribeRef.current();
      }
      if (handleRunCommandRef.current) {
        window.removeEventListener('terminal:runCommand', handleRunCommandRef.current);
      }
      if (terminalIdRef.current !== null) {
        window.electronAPI.terminal.close(terminalIdRef.current);
      }
      term.current?.dispose();
      window.removeEventListener("resize", handleResize);
      isInitialized.current = false;
      fitAddon.current = null;
      webLinksAddon.current = null;
      terminalIdRef.current = null;
    };
  }, []);

  const writePrompt = (cwd: string) => {
    if (!term.current) return;
    const prompt = `\x1b[32m${getShortPath(cwd)}\x1b[0m $ `;
    term.current.write(prompt);
  };

  const getShortPath = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : path;
  };

  const replaceCommandLine = (newCommand: string) => {
    if (!term.current) return;

    // Clear current line
    const currentLength = commandBuffer.current.length;
    for (let i = 0; i < currentLength; i++) {
      term.current.write("\b \b");
    }

    // Write new command
    commandBuffer.current = newCommand;
    term.current.write(newCommand);
  };

  const handleCd = async (newDir: string) => {
    if (terminalIdRef.current === null) return;

    // Just pass the raw input to the backend - it will handle all path resolution
    // This ensures proper handling of relative paths, ~, .., etc. using Node's path module
    const result = await window.electronAPI.terminal.chdir(terminalIdRef.current, newDir);
    
    if (result.success) {
      setCurrentCwd(result.cwd);
      writePrompt(result.cwd);
    } else {
      term.current?.write(`cd: ${result.error}\r\n`);
      writePrompt(currentCwd);
    }
  };

  const executeCommand = async (command: string) => {
    if (terminalIdRef.current === null) return;

    try {
      const result = await window.electronAPI.terminal.execute(
        terminalIdRef.current,
        command,
        currentCwd
      );

      // Get the updated cwd from the terminal session after command execution
      const updatedCwd = await window.electronAPI.terminal.getCwd(terminalIdRef.current);
      if (updatedCwd && updatedCwd !== currentCwd) {
        console.log("CWD updated after command:", updatedCwd);
        setCurrentCwd(updatedCwd);
      }

      // Output already sent via terminal:output event
      // Prompt will be written when process-ended event is received
      if (term.current && result.exitCode !== 0) {
        term.current.write(`\x1b[31m[Exit code: ${result.exitCode}]\x1b[0m\r\n`);
      }
    } catch (err: any) {
      term.current?.write(`\r\nError: ${err.message}\r\n`);
      writePrompt(currentCwd);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#1e1e1e",
        borderRadius: "4px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Close button in top-right corner */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1 hover:bg-white/20 rounded transition-colors duration-150 flex items-center justify-center"
          title="Close Terminal"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          }}
        >
          <X size={14} className="text-white" />
        </button>
      )}
      <div
        ref={terminalRef}
        style={{
          width: "100%",
          height: "100%",
          padding: "8px",
        }}
      />
    </div>
  );
};

export default TerminalPanel;

