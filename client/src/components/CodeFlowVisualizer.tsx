import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';
import { CodeFlowGraph, FunctionNode } from '../lib/codeFlowAnalyzer';
import { X, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface CodeFlowVisualizerProps {
  graph: CodeFlowGraph;
  selectedFunctionId?: string;
  onNodeClick?: (functionId: string, node: FunctionNode) => void;
  onClose?: () => void;
  sourceName?: string; // Folder or file name for display
}

const CodeFlowVisualizer: React.FC<CodeFlowVisualizerProps> = ({
  graph,
  selectedFunctionId,
  onNodeClick,
  onClose,
  sourceName = 'Project',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(selectedFunctionId || null);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
  const animationIntervalRef = useRef<number | null>(null);
  const mainGroupRef = useRef<SVGGElement | null>(null);
  const hasSettledRef = useRef<boolean>(false);
  const nodesRef = useRef<any[]>([]);

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    // Reset settled flag when graph changes
    hasSettledRef.current = false;
    
    if (!svgRef.current || graph.functions.size === 0 || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 50, right: 50, bottom: 50, left: 50 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('class', 'main-group')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Store reference for panning
    mainGroupRef.current = g.node() as SVGGElement;

    // Prepare data
    const nodes = Array.from(graph.functions.values()).map((node) => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
      fx: null as number | null,
      fy: null as number | null,
    }));

    const links = graph.edges.map((edge) => ({
      source: nodes.find((n) => n.id === edge.from.id)!,
      target: nodes.find((n) => n.id === edge.to.id)!,
      type: edge.type,
    })).filter((link) => link.source && link.target);

    // Create markers for arrows
    const defs = svg.append('defs');
    
    // Call arrow marker (blue gradient)
    const callMarker = defs
      .append('marker')
      .attr('id', 'arrowhead-call')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 35)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto');
    
    callMarker
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'url(#callGradient)');

    // Import arrow marker (green gradient)
    const importMarker = defs
      .append('marker')
      .attr('id', 'arrowhead-import')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 35)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto');
    
    importMarker
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'url(#importGradient)');

    // Gradients
    const callGradient = defs
      .append('linearGradient')
      .attr('id', 'callGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');
    
    callGradient.append('stop').attr('offset', '0%').attr('stop-color', '#61afef');
    callGradient.append('stop').attr('offset', '100%').attr('stop-color', '#98c379');

    const importGradient = defs
      .append('linearGradient')
      .attr('id', 'importGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');
    
    importGradient.append('stop').attr('offset', '0%').attr('stop-color', '#c678dd');
    importGradient.append('stop').attr('offset', '100%').attr('stop-color', '#e06c75');

    // Force simulation
    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3
          .forceLink(links as any)
          .id((d: any) => d.id)
          .distance(120)
          .strength(0.8)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))
      .alpha(1) // Start with high alpha
      .alphaDecay(0.0228) // Decay rate (lower = slower decay, more stable)
      .velocityDecay(0.4); // Friction (higher = more friction, stops faster)

    // Store nodes reference
    nodesRef.current = nodes;

    // Stop simulation once it settles and freeze all nodes
    let hasSettled = false;
    const originalTickHandler = () => {
      if (!hasSettled) {
        link
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

        node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);

        // Check if simulation has settled
        if (simulation.alpha() < 0.005) {
          hasSettled = true;
          hasSettledRef.current = true;
          simulation.stop();
          // Freeze ALL nodes in their current positions permanently
          nodes.forEach((node: any) => {
            node.fx = node.x;
            node.fy = node.y;
          });
          // Remove tick handler to prevent any further updates
          simulation.on('tick', null);
        }
      }
    };

    simulation.on('tick', originalTickHandler);

    simulationRef.current = simulation;

    // Create links (edges)
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke-width', (d) => {
        const fromHighlighted = highlightedPath.includes(d.source.id);
        const toHighlighted = highlightedPath.includes(d.target.id);
        return fromHighlighted && toHighlighted ? 4 : 1.5;
      })
      .attr('stroke', (d) => {
        const fromHighlighted = highlightedPath.includes(d.source.id);
        const toHighlighted = highlightedPath.includes(d.target.id);
        if (fromHighlighted && toHighlighted) {
          return d.type === 'call' ? '#61afef' : '#c678dd';
        }
        return d.type === 'call' ? 'rgba(97, 175, 239, 0.4)' : 'rgba(198, 120, 221, 0.4)';
      })
      .attr('marker-end', (d) => (d.type === 'call' ? 'url(#arrowhead-call)' : 'url(#arrowhead-import)'));

    // Create nodes (functions)
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, any>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
      );

    // Node circles with glowing effect
    node
      .append('circle')
      .attr('r', 0)
      .attr('fill', (d) => {
        if (selectedNodeId === d.id || selectedFunctionId === d.id) return '#61afef';
        if (highlightedPath.includes(d.id)) return '#98c379';
        return '#3c3c3c';
      })
      .attr('stroke', (d) => {
        if (selectedNodeId === d.id || selectedFunctionId === d.id) return '#61afef';
        if (highlightedPath.includes(d.id)) return '#98c379';
        return '#61afef';
      })
      .attr('stroke-width', (d) => {
        if (selectedNodeId === d.id || highlightedPath.includes(d.id)) return 3;
        return 2;
      })
      .style('opacity', 1)
      .transition()
      .duration(800)
      .ease(d3.easeElasticOut)
      .attr('r', (d) => {
        if (selectedNodeId === d.id || selectedFunctionId === d.id) return 35;
        if (highlightedPath.includes(d.id)) return 32;
        return 28;
      })
      .on('end', function() {
        // Add pulsing animation for highlighted nodes
        if (highlightedPath.includes((this.parentElement as any).__data__.id)) {
          d3.select(this)
            .transition()
            .duration(1000)
            .attr('r', () => {
              const d = (this.parentElement as any).__data__;
              return (selectedNodeId === d.id ? 37 : 34);
            })
            .transition()
            .duration(1000)
            .attr('r', () => {
              const d = (this.parentElement as any).__data__;
              return (selectedNodeId === d.id ? 35 : 32);
            })
            .on('end', arguments.callee);
        }
      });

    // Add glow nodes
    node.each(function(d) {
      const g = d3.select(this);
      
      // Add glow effect for selected/highlighted
      if (selectedNodeId === d.id || highlightedPath.includes(d.id)) {
        g.append('circle')
          .attr('r', () => (selectedNodeId === d.id ? 40 : 37))
          .attr('fill', 'none')
          .attr('stroke', () => (selectedNodeId === d.id ? '#61afef' : '#98c379'))
          .attr('stroke-width', 2)
          .style('opacity', 0.5)
          .style('filter', 'blur(8px)');
      }
    });

    // Node labels
    node
      .append('text')
      .text((d) => d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', 45)
      .attr('fill', '#ffffff')
      .attr('font-size', '11px')
      .attr('font-family', 'Menlo, Monaco, monospace')
      .attr('font-weight', (d) => (selectedNodeId === d.id ? 'bold' : 'normal'));

    // File indicator badge
    node
      .append('text')
      .text((d) => {
        const fileName = d.filePath.split(/[/\\]/).pop()?.substring(0, 10) || '';
        return `📄 ${fileName}`;
      })
      .attr('text-anchor', 'middle')
      .attr('dy', -42)
      .attr('fill', '#888')
      .attr('font-size', '9px')
      .attr('font-family', 'Menlo, Monaco, monospace');

    // Type indicator
    node
      .append('text')
      .text((d) => {
        switch (d.type) {
          case 'function':
            return 'f';
          case 'method':
            return 'm';
          case 'arrow':
            return '→';
          case 'class':
            return 'C';
          default:
            return 'v';
        }
      })
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold');

    // Node click handler
    node.on('click', (event, d) => {
      event.sourceEvent?.stopPropagation();
      setSelectedNodeId(d.id);
      onNodeClick?.(d.id, d);
      animateExecutionPath(d.id);
    });

    // Position updates are handled in originalTickHandler above
    // No need for duplicate handler here

    function dragstarted(event: any, d: any) {
      event.sourceEvent?.stopPropagation(); // Prevent pan from triggering
      // Don't restart simulation - just allow dragging the node
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      event.sourceEvent?.stopPropagation(); // Prevent pan from triggering
      // event.x and event.y are already in the coordinate space of the group (accounting for zoom/pan)
      // D3 drag automatically handles the transform, so we can use event.x/y directly
      d.fx = event.x;
      d.fy = event.y;
      // Update visual immediately (no need to wait for simulation tick since it's stopped)
      d3.select(event.sourceEvent.target.parentElement)
        .attr('transform', `translate(${d.fx},${d.fy})`);
      
      // Update links connected to this node immediately
      link
        .filter((l: any) => l.source === d || l.target === d)
        .attr('x1', (l: any) => l.source.fx !== null && l.source.fx !== undefined ? l.source.fx : l.source.x)
        .attr('y1', (l: any) => l.source.fy !== null && l.source.fy !== undefined ? l.source.fy : l.source.y)
        .attr('x2', (l: any) => l.target.fx !== null && l.target.fx !== undefined ? l.target.fx : l.target.x)
        .attr('y2', (l: any) => l.target.fy !== null && l.target.fy !== undefined ? l.target.fy : l.target.y);
    }

    function dragended(event: any, d: any) {
      event.sourceEvent?.stopPropagation(); // Prevent pan from triggering
      // Keep the node frozen in its new position (don't unfreeze it)
      // This prevents the simulation from restarting
      // fx and fy stay set to keep the node fixed
    }

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [graph, dimensions, highlightedPath, selectedNodeId, selectedFunctionId, onNodeClick]); // Removed zoom and pan - they shouldn't trigger re-render

  // Update transform when pan or zoom changes (only moves the view, doesn't recreate graph)
  useEffect(() => {
    if (mainGroupRef.current && svgRef.current) {
      const margin = { top: 50, right: 50, bottom: 50, left: 50 };
      const g = d3.select(mainGroupRef.current);
      // Update transform - this only changes the view transform, doesn't recreate nodes
      g.attr('transform', `translate(${margin.left + pan.x},${margin.top + pan.y}) scale(${zoom})`);
    }
  }, [pan, zoom]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only pan if clicking on empty space (not on a node)
    if ((e.target as SVGElement).closest('.node')) return;
    
    setIsPanning(true);
    setPanStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    });
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanning) return;
    
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'default';
    }
  };

  const animateExecutionPath = (functionId: string) => {
    setIsAnimating(true);
    setIsPaused(false);
    setHighlightedPath([]);

    const node = graph.functions.get(functionId);
    if (!node) {
      setIsAnimating(false);
      return;
    }

    // Build execution path
    const path: string[] = [functionId];
    const visited = new Set<string>([functionId]);

    const collectCalls = (id: string) => {
      const currentNode = graph.functions.get(id);
      if (!currentNode || !isAnimating || isPaused) return;

      currentNode.calls.forEach((callee) => {
        if (!visited.has(callee.id)) {
          visited.add(callee.id);
          path.push(callee.id);
          collectCalls(callee.id);
        }
      });
    };

    collectCalls(functionId);

    // Animate path highlighting
    let currentIndex = 0;
    
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
    }

    const animate = () => {
      if (currentIndex < path.length && !isPaused) {
        setHighlightedPath((prev) => [...prev, path[currentIndex]]);
        currentIndex++;
      } else if (currentIndex >= path.length) {
        setIsAnimating(false);
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
        }
      }
    };

    animationIntervalRef.current = window.setInterval(animate, 300);
  };

  useEffect(() => {
    if (selectedFunctionId) {
      setSelectedNodeId(selectedFunctionId);
      animateExecutionPath(selectedFunctionId);
    }
  }, [selectedFunctionId]);

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  const handlePlay = () => {
    if (selectedNodeId) {
      animateExecutionPath(selectedNodeId);
    }
  };

  const handleReset = () => {
    setHighlightedPath([]);
    setIsAnimating(false);
    setIsPaused(false);
    setSelectedNodeId(selectedFunctionId || null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
    }
    
    // Restart simulation by unfreezing all nodes
    if (simulationRef.current && nodesRef.current.length > 0) {
      hasSettledRef.current = false;
      nodesRef.current.forEach((node: any) => {
        node.fx = null;
        node.fy = null;
      });
      simulationRef.current.alpha(1).restart();
    }
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#252526]">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">
            Code Flow: {sourceName}
          </h2>
          {isAnimating && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"
            />
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Controls */}
          <button
            onClick={handleReset}
            className="p-2 hover:bg-gray-700 rounded"
            title="Reload Visualization"
          >
            <RotateCcw size={18} />
          </button>
          <div className="w-px h-6 bg-gray-600 mx-1" />
          <button
            onClick={() => setZoom(Math.min(zoom + 0.1, 2))}
            className="p-2 hover:bg-gray-700 rounded"
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}
            className="p-2 hover:bg-gray-700 rounded"
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <div className="w-px h-6 bg-gray-600 mx-1" />
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-600 rounded"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden relative"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
          {/* Animated particles flowing along highlighted edges */}
          <AnimatePresence>
            {graph.edges
              .filter((edge) => {
                const fromHighlighted = highlightedPath.includes(edge.from.id);
                const toHighlighted = highlightedPath.includes(edge.to.id);
                return fromHighlighted && toHighlighted;
              })
              .map((edge, index) => (
                <motion.circle
                  key={`particle-${edge.from.id}-${edge.to.id}`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: index * 0.1,
                  }}
                  r="4"
                  fill="#98c379"
                  className="pointer-events-none"
                />
              ))}
          </AnimatePresence>
        </svg>
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-gray-700 bg-[#252526] text-xs text-gray-400">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span>Selected Function</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span>Execution Path</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-600"></div>
            <span>Other Functions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-0.5 bg-blue-400"></div>
            <span>Function Call</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-0.5 bg-purple-400"></div>
            <span>Import</span>
          </div>
          <div className="ml-auto text-gray-500">
            {graph.functions.size} functions • {graph.edges.length} connections
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeFlowVisualizer;

