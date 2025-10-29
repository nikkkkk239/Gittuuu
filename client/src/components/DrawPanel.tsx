import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pencil, Highlighter, Eraser, Type, Trash2, Download, Square, Circle, Minus } from 'lucide-react';

interface DrawPanelProps {
  onClose: () => void;
}

interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
}

type Tool = 'pencil' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line';
type ShapeType = 'rectangle' | 'circle' | 'line';

interface Shape {
  id: string;
  type: ShapeType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lineWidth: number;
}

const DrawPanel: React.FC<DrawPanelProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [activeTextBox, setActiveTextBox] = useState<string | null>(null);
  const [isAddingText, setIsAddingText] = useState(false);
  const [resizingTextBox, setResizingTextBox] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
  const [draggingTextBox, setDraggingTextBox] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [shapeStart, setShapeStart] = useState({ x: 0, y: 0 });
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [draggingShape, setDraggingShape] = useState<string | null>(null);
  const [shapeDragOffset, setShapeDragOffset] = useState({ x: 0, y: 0 });

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      // Redraw everything
      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Redraw canvas with all drawings, shapes, and text boxes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw shapes - always white for visibility on black background
    shapes.forEach((shape) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = shape.lineWidth;
      ctx.beginPath();

      const x1 = shape.x1;
      const y1 = shape.y1;
      const x2 = shape.x2;
      const y2 = shape.y2;

      if (shape.type === 'rectangle') {
        ctx.rect(
          Math.min(x1, x2),
          Math.min(y1, y2),
          Math.abs(x2 - x1),
          Math.abs(y2 - y1)
        );
      } else if (shape.type === 'circle') {
        const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
      } else if (shape.type === 'line') {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }

      ctx.stroke();
    });
  }, [shapes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Check if clicking on a shape (exclude temp shapes)
  const getShapeAtPoint = (x: number, y: number): Shape | null => {
    for (const shape of shapes) {
      // Skip temp shapes when checking for selection
      if (shape.id === 'temp-shape') continue;
      if (shape.type === 'rectangle') {
        const minX = Math.min(shape.x1, shape.x2);
        const maxX = Math.max(shape.x1, shape.x2);
        const minY = Math.min(shape.y1, shape.y2);
        const maxY = Math.max(shape.y1, shape.y2);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          return shape;
        }
      } else if (shape.type === 'circle') {
        const radius = Math.sqrt(Math.pow(shape.x2 - shape.x1, 2) + Math.pow(shape.y2 - shape.y1, 2));
        const dist = Math.sqrt(Math.pow(x - shape.x1, 2) + Math.pow(y - shape.y1, 2));
        if (dist <= radius) {
          return shape;
        }
      } else if (shape.type === 'line') {
        const dist = Math.abs(
          ((shape.y2 - shape.y1) * x - (shape.x2 - shape.x1) * y + shape.x2 * shape.y1 - shape.y2 * shape.x1) /
          Math.sqrt(Math.pow(shape.y2 - shape.y1, 2) + Math.pow(shape.x2 - shape.x1, 2))
        );
        if (dist < 5) {
          const minX = Math.min(shape.x1, shape.x2);
          const maxX = Math.max(shape.x1, shape.x2);
          const minY = Math.min(shape.y1, shape.y2);
          const maxY = Math.max(shape.y1, shape.y2);
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            return shape;
          }
        }
      }
    }
    return null;
  };

  // Drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'text') {
      // Handle text box creation
      handleAddTextBox(e);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Start drawing new shape immediately when using shape tools
    // Don't check for existing shapes - always allow drawing near existing shapes
    if (tool === 'rectangle' || tool === 'circle' || tool === 'line') {
      setIsDrawingShape(true);
      setShapeStart({ x, y });
      setSelectedShape(null);
      setDraggingShape(null); // Cancel any dragging
      return;
    }

    // Only check for shape selection when NOT using shape drawing tools
    // This allows drawing with pencil/highlighter near shapes without selecting them
    if (!isDrawingShape && tool !== 'pencil' && tool !== 'highlighter' && tool !== 'eraser') {
      const clickedShape = getShapeAtPoint(x, y);
      if (clickedShape && clickedShape.id !== 'temp-shape') {
        setSelectedShape(clickedShape.id);
        setDraggingShape(clickedShape.id);
        setShapeDragOffset({
          x: x - clickedShape.x1,
          y: y - clickedShape.y1,
        });
        return;
      }
    }

    setIsDrawing(true);
    setLastPos({ x, y });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    
    if (tool === 'pencil') {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else if (tool === 'highlighter') {
      ctx.strokeStyle = color + '80'; // Add transparency
      ctx.lineWidth = lineWidth * 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'multiply';
    } else if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth * 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'destination-out';
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle shape dragging
    if (draggingShape) {
      const shape = shapes.find((s) => s.id === draggingShape);
      if (shape) {
        const deltaX = x - shape.x1 - shapeDragOffset.x;
        const deltaY = y - shape.y1 - shapeDragOffset.y;
        setShapes((prev) =>
          prev.map((s) =>
            s.id === draggingShape
              ? {
                  ...s,
                  x1: s.x1 + deltaX,
                  y1: s.y1 + deltaY,
                  x2: s.x2 + deltaX,
                  y2: s.y2 + deltaY,
                }
              : s
          )
        );
        setShapeDragOffset({ x: x - shape.x1, y: y - shape.y1 });
      }
      return;
    }

    // Handle shape drawing
    if (isDrawingShape) {
      setShapes((prev) => {
        // Remove any existing temp shape and add/update new one
        const existing = prev.filter((s) => s.id !== 'temp-shape');
        const shapeType: ShapeType =
          tool === 'rectangle' ? 'rectangle' : tool === 'circle' ? 'circle' : 'line';
        const tempShape: Shape = {
          id: 'temp-shape', // Fixed ID so it gets replaced on each update
          type: shapeType,
          x1: shapeStart.x,
          y1: shapeStart.y,
          x2: x,
          y2: y,
          color: '#ffffff', // Always white for shapes
          lineWidth,
        };
        return [...existing, tempShape];
      });
      return;
    }

    if (!isDrawing || tool === 'text') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();

    setLastPos({ x, y });
  };

  const stopDrawing = () => {
    if (draggingShape) {
      setDraggingShape(null);
      return;
    }

    if (isDrawingShape) {
      // Finalize the shape only if it has minimum size
      setShapes((prev) => {
        const tempShape = prev.find((s) => s.id === 'temp-shape');
        if (tempShape) {
          const width = Math.abs(tempShape.x2 - tempShape.x1);
          const height = Math.abs(tempShape.y2 - tempShape.y1);
          const minSize = 5; // Minimum size to create shape
          
          if (width >= minSize || height >= minSize || tempShape.type === 'line') {
            // Remove temp shape and add finalized one
            const finalShape: Shape = {
              ...tempShape,
              id: Date.now().toString(),
              color: '#ffffff', // Ensure white color
            };
            return [...prev.filter((s) => s.id !== 'temp-shape'), finalShape];
          } else {
            // Too small, just remove temp shape
            return prev.filter((s) => s.id !== 'temp-shape');
          }
        }
        return prev;
      });
      setIsDrawingShape(false);
      setShapeStart({ x: 0, y: 0 });
      return;
    }

    if (tool !== 'text') {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    setIsDrawing(false);
  };

  // Text box functions
  const handleAddTextBox = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newBox: TextBox = {
      id: Date.now().toString(),
      x,
      y,
      width: 200,
      height: 50,
      text: '',
      fontSize: 16,
    };

    setTextBoxes([...textBoxes, newBox]);
    setActiveTextBox(newBox.id);
    setIsAddingText(true);
  };

  const handleTextBoxClick = (boxId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTextBox(boxId);
    
    const box = textBoxes.find((b) => b.id === boxId);
    if (box && textAreaRef.current) {
      textAreaRef.current.value = box.text;
    }
  };

  // Start dragging text box
  const startDraggingTextBox = (boxId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const box = textBoxes.find((b) => b.id === boxId);
    if (!box) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDraggingTextBox(boxId);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setActiveTextBox(boxId);
  };

  // Handle text box drag
  const handleTextBoxDrag = useCallback(
    (e: MouseEvent) => {
      if (!draggingTextBox) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;

      setTextBoxes((prev) =>
        prev.map((box) =>
          box.id === draggingTextBox ? { ...box, x: Math.max(0, x), y: Math.max(0, y) } : box
        )
      );
    },
    [draggingTextBox, dragOffset]
  );

  const stopDraggingTextBox = useCallback(() => {
    setDraggingTextBox(null);
  }, []);

  const handleTextBoxChange = (boxId: string, text: string) => {
    setTextBoxes((prev) =>
      prev.map((box) => (box.id === boxId ? { ...box, text } : box))
    );
  };

  const deleteTextBox = (boxId: string) => {
    setTextBoxes((prev) => prev.filter((box) => box.id !== boxId));
    if (activeTextBox === boxId) {
      setActiveTextBox(null);
    }
  };

  // Resize text box
  const startResize = (boxId: string, handle: 'se' | 'sw' | 'ne' | 'nw', e: React.MouseEvent) => {
    e.stopPropagation();
    setResizingTextBox(boxId);
    setResizeHandle(handle);
    setActiveTextBox(boxId);
  };

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!resizingTextBox || !resizeHandle) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setTextBoxes((prev) =>
        prev.map((box) => {
          if (box.id !== resizingTextBox) return box;

          let newWidth = box.width;
          let newHeight = box.height;
          let newX = box.x;
          let newY = box.y;

          if (resizeHandle === 'se') {
            newWidth = Math.max(50, x - box.x);
            newHeight = Math.max(30, y - box.y);
          } else if (resizeHandle === 'sw') {
            newWidth = Math.max(50, box.x + box.width - x);
            newHeight = Math.max(30, y - box.y);
            newX = x;
          } else if (resizeHandle === 'ne') {
            newWidth = Math.max(50, x - box.x);
            newHeight = Math.max(30, box.y + box.height - y);
            newY = y;
          } else if (resizeHandle === 'nw') {
            newWidth = Math.max(50, box.x + box.width - x);
            newHeight = Math.max(30, box.y + box.height - y);
            newX = x;
            newY = y;
          }

          return { ...box, x: newX, y: newY, width: newWidth, height: newHeight };
        })
      );
    },
    [resizingTextBox, resizeHandle]
  );

  const stopResize = useCallback(() => {
    setResizingTextBox(null);
    setResizeHandle(null);
  }, []);

  useEffect(() => {
    if (resizingTextBox) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', stopResize);
      return () => {
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);
      };
    }
  }, [resizingTextBox, handleResize, stopResize]);

  useEffect(() => {
    if (draggingTextBox) {
      window.addEventListener('mousemove', handleTextBoxDrag);
      window.addEventListener('mouseup', stopDraggingTextBox);
      return () => {
        window.removeEventListener('mousemove', handleTextBoxDrag);
        window.removeEventListener('mouseup', stopDraggingTextBox);
      };
    }
  }, [draggingTextBox, handleTextBoxDrag, stopDraggingTextBox]);

  // Clear canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTextBoxes([]);
    setActiveTextBox(null);
    setShapes([]);
    setSelectedShape(null);
  };

  // Export as image
  const exportCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="w-full h-full bg-black flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-2">
          {/* Drawing Tools */}
          <button
            onClick={() => setTool('pencil')}
            className={`p-2 rounded ${tool === 'pencil' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Pencil"
          >
            <Pencil size={20} />
          </button>
          <button
            onClick={() => setTool('highlighter')}
            className={`p-2 rounded ${tool === 'highlighter' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Highlighter"
          >
            <Highlighter size={20} />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Eraser"
          >
            <Eraser size={20} />
          </button>
          <button
            onClick={() => setTool('text')}
            className={`p-2 rounded ${tool === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Add Text Box"
          >
            <Type size={20} />
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Shape Tools */}
          <button
            onClick={() => setTool('rectangle')}
            className={`p-2 rounded ${tool === 'rectangle' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Rectangle"
          >
            <Square size={20} />
          </button>
          <button
            onClick={() => setTool('circle')}
            className={`p-2 rounded ${tool === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Circle"
          >
            <Circle size={20} />
          </button>
          <button
            onClick={() => setTool('line')}
            className={`p-2 rounded ${tool === 'line' ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Line"
          >
            <Minus size={20} />
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Color Picker */}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer"
            title="Color"
          />

          {/* Line Width */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Width:</label>
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-gray-700 w-8">{lineWidth}</span>
          </div>

          <div className="w-px h-6 bg-gray-400 mx-2" />

          {/* Actions */}
          <button
            onClick={clearCanvas}
            className="p-2 rounded bg-gray-200 hover:bg-gray-300"
            title="Clear All"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={exportCanvas}
            className="p-2 rounded bg-gray-200 hover:bg-gray-300"
            title="Export"
          >
            <Download size={20} />
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded bg-red-500 hover:bg-red-600 text-white"
          title="Close"
        >
          Close
        </button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />

        {/* Text Boxes Overlay */}
        {textBoxes.map((box) => (
          <div
            key={box.id}
            className={`absolute ${
              activeTextBox === box.id ? 'border border-blue-500' : 'border-0'
            } bg-transparent cursor-move`}
            style={{
              left: `${box.x}px`,
              top: `${box.y}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
            onClick={(e) => handleTextBoxClick(box.id, e)}
            onMouseDown={(e) => {
              // Only drag if clicking on the box itself, not on textarea or buttons
              if ((e.target as HTMLElement).tagName !== 'TEXTAREA' && 
                  (e.target as HTMLElement).tagName !== 'BUTTON' &&
                  !(e.target as HTMLElement).closest('button')) {
                startDraggingTextBox(box.id, e);
              }
            }}
          >
            {activeTextBox === box.id && (
              <>
                {/* Resize Handles */}
                <div
                  className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nwse-resize"
                  style={{ right: -6, bottom: -6 }}
                  onMouseDown={(e) => startResize(box.id, 'se', e)}
                />
                <div
                  className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nesw-resize"
                  style={{ left: -6, bottom: -6 }}
                  onMouseDown={(e) => startResize(box.id, 'sw', e)}
                />
                <div
                  className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nesw-resize"
                  style={{ right: -6, top: -6 }}
                  onMouseDown={(e) => startResize(box.id, 'ne', e)}
                />
                <div
                  className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nwse-resize"
                  style={{ left: -6, top: -6 }}
                  onMouseDown={(e) => startResize(box.id, 'nw', e)}
                />

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTextBox(box.id);
                  }}
                  className="absolute -top-8 left-0 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>

              </>
            )}

            {/* Text Input */}
            <textarea
              ref={activeTextBox === box.id ? textAreaRef : null}
              value={box.text}
              onChange={(e) => handleTextBoxChange(box.id, e.target.value)}
              className="w-full h-full p-2 resize-none outline-none bg-transparent text-white"
              style={{ fontSize: `${box.fontSize}px`, color: '#ffffff' }}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => setActiveTextBox(box.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DrawPanel;

