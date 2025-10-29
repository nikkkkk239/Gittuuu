import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export interface FunctionNode {
  id: string;
  name: string;
  filePath: string;
  type: 'function' | 'method' | 'arrow' | 'variable' | 'class';
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  calls: Array<{ id: string; filePath: string; name: string }>;
  calledBy: Array<{ id: string; filePath: string; name: string }>;
  imports: Array<{ name: string; from: string }>;
  exports: string[];
}

export interface FileNode {
  path: string;
  name: string;
  functions: Map<string, FunctionNode>;
}

export interface CodeFlowGraph {
  files: Map<string, FileNode>;
  functions: Map<string, FunctionNode>; // All functions across all files
  edges: Array<{
    from: { id: string; filePath: string };
    to: { id: string; filePath: string };
    type: 'call' | 'import';
  }>;
}

export class CodeFlowAnalyzer {
  private graph: CodeFlowGraph;
  private nodeCounter = 0;

  constructor() {
    this.graph = {
      files: new Map(),
      functions: new Map(),
      edges: [],
    };
  }

  // Analyze single file
  async analyzeFile(filePath: string, content: string, language: string = 'javascript'): Promise<CodeFlowGraph> {
    this.reset();
    
    if (!this.isSupportedLanguage(language)) {
      return this.graph;
    }

    try {
      const ast = this.parseCode(content, language);
      if (!ast) return this.graph;

      const fileNode: FileNode = {
        path: filePath,
        name: this.getFileName(filePath),
        functions: new Map(),
      };

      // First pass: collect all functions
      this.collectFunctions(ast, filePath, fileNode, content);

      // Second pass: find calls and relationships
      this.findCalls(ast, filePath, fileNode);

      this.graph.files.set(filePath, fileNode);
      return this.graph;
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      return this.graph;
    }
  }

  // Analyze multiple files (folder)
  async analyzeFolder(
    folderPath: string,
    files: Array<{ path: string; content: string }>
  ): Promise<CodeFlowGraph> {
    this.reset();

    // Analyze each file first
    for (const file of files) {
      if (!this.isSupportedFile(file.path)) continue;

      const language = this.detectLanguage(file.path);
      const ast = this.parseCode(file.content, language);
      if (!ast) continue;

      const fileNode: FileNode = {
        path: file.path,
        name: this.getFileName(file.path),
        functions: new Map(),
      };

      this.collectFunctions(ast, file.path, fileNode, file.content);
      this.graph.files.set(file.path, fileNode);
    }

    // Second pass: find cross-file calls and imports
    for (const file of files) {
      if (!this.isSupportedFile(file.path)) continue;
      const language = this.detectLanguage(file.path);
      const ast = this.parseCode(file.content, language);
      if (!ast) continue;

      const fileNode = this.graph.files.get(file.path);
      if (fileNode) {
        this.findCalls(ast, file.path, fileNode);
        this.findImports(ast, file.path, fileNode, files);
      }
    }

    // Build cross-file relationships
    this.buildCrossFileRelationships(files, folderPath);

    return this.graph;
  }

  // Hybrid mode: Analyze current file + its imports
  async analyzeHybrid(
    currentFilePath: string,
    currentFileContent: string,
    allFiles: Array<{ path: string; content: string }>,
    folderPath?: string
  ): Promise<CodeFlowGraph> {
    this.reset();

    const language = this.detectLanguage(currentFilePath);
    
    // 1. Analyze current file
    const currentAst = this.parseCode(currentFileContent, language);
    if (currentAst) {
      const currentFileNode: FileNode = {
        path: currentFilePath,
        name: this.getFileName(currentFilePath),
        functions: new Map(),
      };

      this.collectFunctions(currentAst, currentFilePath, currentFileNode, currentFileContent);
      this.graph.files.set(currentFilePath, currentFileNode);
    }

    // 2. Find imports in current file
    const imports = this.extractImports(currentFileContent);
    
    // 3. Analyze imported files
    for (const imp of imports) {
      const importedFilePath = this.resolveImportPath(
        imp.from,
        currentFilePath,
        allFiles,
        folderPath
      );

      if (importedFilePath) {
        const importedFile = allFiles.find(f => f.path === importedFilePath);
        if (importedFile) {
          const importedAst = this.parseCode(importedFile.content, this.detectLanguage(importedFilePath));
          if (importedAst) {
            const importedFileNode: FileNode = {
              path: importedFilePath,
              name: this.getFileName(importedFilePath),
              functions: new Map(),
            };

            this.collectFunctions(importedAst, importedFilePath, importedFileNode, importedFile.content);
            this.graph.files.set(importedFilePath, importedFileNode);
          }
        }
      }
    }

    // 4. Find reverse dependencies (files that import current file)
    if (folderPath) {
      for (const file of allFiles) {
        if (file.path === currentFilePath) continue;
        
        const fileImports = this.extractImports(file.content);
        const importsCurrentFile = fileImports.some(imp => {
          const resolvedPath = this.resolveImportPath(imp.from, file.path, allFiles, folderPath);
          return resolvedPath === currentFilePath;
        });

        if (importsCurrentFile) {
          const fileAst = this.parseCode(file.content, this.detectLanguage(file.path));
          if (fileAst) {
            const fileNode: FileNode = {
              path: file.path,
              name: this.getFileName(file.path),
              functions: new Map(),
            };

            this.collectFunctions(fileAst, file.path, fileNode, file.content);
            this.graph.files.set(file.path, fileNode);
          }
        }
      }
    }

    // 5. Build relationships
    if (currentAst) {
      const currentFileNode = this.graph.files.get(currentFilePath);
      if (currentFileNode) {
        this.findCalls(currentAst, currentFilePath, currentFileNode);
        this.findImports(currentAst, currentFilePath, currentFileNode, allFiles);
      }
    }

    for (const file of allFiles) {
      const fileNode = this.graph.files.get(file.path);
      if (fileNode && file.path !== currentFilePath) {
        const fileAst = this.parseCode(file.content, this.detectLanguage(file.path));
        if (fileAst) {
          this.findCalls(fileAst, file.path, fileNode);
          this.findImports(fileAst, file.path, fileNode, allFiles);
        }
      }
    }

    this.buildCrossFileRelationships(allFiles, folderPath);

    return this.graph;
  }

  getExecutionPath(functionId: string): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      path.push(nodeId);

      const node = this.graph.functions.get(nodeId);
      if (node) {
        node.calls.forEach((callee) => {
          const calleeNode = this.graph.functions.get(callee.id);
          if (calleeNode && !visited.has(callee.id)) {
            dfs(callee.id);
          }
        });
      }
    };

    dfs(functionId);
    return path;
  }

  getCallers(functionId: string): string[] {
    const node = this.graph.functions.get(functionId);
    return node ? node.calledBy.map(c => c.id) : [];
  }

  private reset() {
    this.graph = {
      files: new Map(),
      functions: new Map(),
      edges: [],
    };
    this.nodeCounter = 0;
  }

  private parseCode(content: string, language: string) {
    try {
      return parser.parse(content, {
        sourceType: 'module',
        plugins: [
          language === 'typescript' ? 'typescript' : 'javascript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'dynamicImport',
        ],
      });
    } catch (error) {
      return null;
    }
  }

  private isSupportedLanguage(language: string): boolean {
    return ['javascript', 'typescript', 'jsx', 'tsx'].includes(language.toLowerCase());
  }

  private isSupportedFile(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ['js', 'jsx', 'ts', 'tsx'].includes(ext || '');
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'ts' || ext === 'tsx') return 'typescript';
    return 'javascript';
  }

  private getFileName(filePath: string): string {
    return filePath.split(/[/\\]/).pop() || filePath;
  }

  private collectFunctions(
    ast: any,
    filePath: string,
    fileNode: FileNode,
    content: string
  ) {
    traverse(ast, {
      FunctionDeclaration: (path) => {
        if (path.node.id) {
          const nodeId = this.createFunctionNode(
            path.node,
            'function',
            filePath,
            fileNode,
            content
          );
        }
      },
      VariableDeclarator: (path) => {
        if (
          t.isIdentifier(path.node.id) &&
          (t.isArrowFunctionExpression(path.node.init) ||
            t.isFunctionExpression(path.node.init))
        ) {
          this.createFunctionNode(
            path.node.init,
            'arrow',
            filePath,
            fileNode,
            content,
            path.node.id.name
          );
        }
      },
      ClassMethod: (path) => {
        if (t.isIdentifier(path.node.key)) {
          this.createFunctionNode(
            path.node,
            'method',
            filePath,
            fileNode,
            content,
            path.node.key.name
          );
        }
      },
      ClassDeclaration: (path) => {
        if (path.node.id) {
          const nodeId = `func_${this.nodeCounter++}`;
          const node: FunctionNode = {
            id: nodeId,
            name: path.node.id.name,
            filePath,
            type: 'class',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            endLine: path.node.loc?.end.line || 0,
            endColumn: path.node.loc?.end.column || 0,
            calls: [],
            calledBy: [],
            imports: [],
            exports: [],
          };
          fileNode.functions.set(nodeId, node);
          this.graph.functions.set(nodeId, node);
        }
      },
    });
  }

  private createFunctionNode(
    node: any,
    type: FunctionNode['type'],
    filePath: string,
    fileNode: FileNode,
    content: string,
    name?: string
  ): string | null {
    if (!node.loc) return null;

    const nodeName =
      name ||
      (node.id ? node.id.name : `anonymous_${this.nodeCounter}`);
    const nodeId = `func_${this.nodeCounter++}`;

    const funcNode: FunctionNode = {
      id: nodeId,
      name: nodeName,
      filePath,
      type,
      line: node.loc.start.line,
      column: node.loc.start.column,
      endLine: node.loc.end.line,
      endColumn: node.loc.end.column,
      calls: [],
      calledBy: [],
      imports: [],
      exports: [],
    };

    fileNode.functions.set(nodeId, funcNode);
    this.graph.functions.set(nodeId, funcNode);
    return nodeId;
  }

  private findCalls(ast: any, filePath: string, fileNode: FileNode) {
    traverse(ast, {
      CallExpression: (path) => {
        const callerNode = this.findEnclosingFunction(path, filePath);
        if (!callerNode) return;

        const callee = path.node.callee;
        let calleeName: string | null = null;

        if (t.isIdentifier(callee)) {
          calleeName = callee.name;
        } else if (t.isMemberExpression(callee)) {
          if (t.isIdentifier(callee.property)) {
            calleeName = callee.property.name;
          }
        }

        if (calleeName) {
          // Find in same file first
          for (const [nodeId, node] of fileNode.functions) {
            if (node.name === calleeName && nodeId !== callerNode.id) {
              this.addEdge(callerNode.id, filePath, nodeId, filePath, 'call');
              break;
            }
          }

          // If not found in same file, search in imported functions
          // This is handled in buildCrossFileRelationships
        }
      },
    });
  }

  private findImports(
    ast: any,
    filePath: string,
    fileNode: FileNode,
    allFiles: Array<{ path: string; content: string }>
  ) {
    traverse(ast, {
      ImportDeclaration: (path) => {
        const source = path.node.source.value;
        const imports: Array<{ name: string; from: string }> = [];

        path.node.specifiers.forEach((spec) => {
          if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
            imports.push({ name: spec.imported.name, from: source });
          } else if (t.isImportDefaultSpecifier(spec) && t.isIdentifier(spec.local)) {
            imports.push({ name: spec.local.name, from: source });
          }
        });

        const funcNode = fileNode.functions.values().next().value;
        if (funcNode) {
          funcNode.imports.push(...imports);
        }
      },
    });
  }

  private extractImports(content: string): Array<{ name: string; from: string }> {
    const imports: Array<{ name: string; from: string }> = [];
    const importRegex = /import\s+(?:(?:\{([^}]+)\})|(\w+)|(?:(\w+)\s*,\s*\{([^}]+)\}))\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const from = match[5];
      if (match[1]) {
        // Named imports { a, b }
        match[1].split(',').forEach(name => {
          imports.push({ name: name.trim(), from });
        });
      } else if (match[2]) {
        // Default import
        imports.push({ name: match[2].trim(), from });
      }
    }

    return imports;
  }

  private resolveImportPath(
    importPath: string,
    fromFile: string,
    allFiles: Array<{ path: string; content: string }>,
    folderPath?: string
  ): string | null {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
      const resolvedPath = this.normalizePath(fromDir + '/' + importPath);
      
      // Try various extensions
      for (const ext of ['', '.js', '.jsx', '.ts', '.tsx']) {
        const candidate = resolvedPath + ext;
        if (allFiles.some(f => f.path === candidate || f.path.endsWith(candidate))) {
          return allFiles.find(f => f.path === candidate || f.path.endsWith(candidate))?.path || null;
        }
      }
      
      // Try with /index
      for (const ext of ['.js', '.jsx', '.ts', '.tsx']) {
        const candidate = resolvedPath + '/index' + ext;
        if (allFiles.some(f => f.path.includes(candidate))) {
          return allFiles.find(f => f.path.includes(candidate))?.path || null;
        }
      }
    }

    // Handle absolute imports (node_modules, etc.) - simplified
    // In a real implementation, you'd check node_modules
    
    return null;
  }

  private normalizePath(path: string): string {
    const parts = path.split('/');
    const result: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        result.pop();
      } else if (part !== '.' && part !== '') {
        result.push(part);
      }
    }
    
    return result.join('/');
  }

  private buildCrossFileRelationships(
    allFiles: Array<{ path: string; content: string }>,
    folderPath?: string
  ) {
    // Build relationships between functions across files
    // This is a simplified version - in production you'd want more sophisticated matching
    for (const [fromFilePath, fromFileNode] of this.graph.files) {
      for (const [fromFuncId, fromFunc] of fromFileNode.functions) {
        // Check imports
        fromFunc.imports.forEach((imp) => {
          const importedFilePath = this.resolveImportPath(
            imp.from,
            fromFilePath,
            allFiles,
            folderPath
          );

          if (importedFilePath) {
            const importedFileNode = this.graph.files.get(importedFilePath);
            if (importedFileNode) {
              for (const [toFuncId, toFunc] of importedFileNode.functions) {
                if (toFunc.name === imp.name) {
                  this.addEdge(
                    fromFuncId,
                    fromFilePath,
                    toFuncId,
                    importedFilePath,
                    'import'
                  );
                }
              }
            }
          }
        });
      }
    }
  }

  private addEdge(
    fromId: string,
    fromPath: string,
    toId: string,
    toPath: string,
    type: 'call' | 'import'
  ) {
    const fromNode = this.graph.functions.get(fromId);
    const toNode = this.graph.functions.get(toId);

    if (!fromNode || !toNode) return;

    // Add to edges if not exists
    const edgeExists = this.graph.edges.some(
      (e) => e.from.id === fromId && e.to.id === toId
    );

    if (!edgeExists) {
      this.graph.edges.push({
        from: { id: fromId, filePath: fromPath },
        to: { id: toId, filePath: toPath },
        type,
      });
    }

    // Update node relationships
    const callExists = fromNode.calls.some((c) => c.id === toId);
    if (!callExists) {
      fromNode.calls.push({ id: toId, filePath: toPath, name: toNode.name });
    }

    const calledByExists = toNode.calledBy.some((c) => c.id === fromId);
    if (!calledByExists) {
      toNode.calledBy.push({ id: fromId, filePath: fromPath, name: fromNode.name });
    }
  }

  private findEnclosingFunction(path: any, filePath: string): FunctionNode | null {
    let current = path.parentPath;
    while (current) {
      if (
        current.isFunctionDeclaration() ||
        current.isFunctionExpression() ||
        current.isArrowFunctionExpression() ||
        current.isClassMethod()
      ) {
        const name =
          current.node.id?.name ||
          (current.node.key && t.isIdentifier(current.node.key)
            ? current.node.key.name
            : null);

        if (name) {
          for (const node of this.graph.functions.values()) {
            if (node.name === name && node.filePath === filePath) {
              return node;
            }
          }
        }
      }
      current = current.parentPath;
    }
    return null;
  }
}

