"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Modal, Slider } from "antd";
import { Brush, Eraser, RotateCcw } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const brushColors = ["#1c1917", "#ef4444", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7"];

export function CanvasSketchReferenceDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (blob: Blob) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef<{ active: boolean; last: { x: number; y: number } | null }>({ active: false, last: null });
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [mode, setMode] = useState<"draw" | "erase">("draw");
    const [brushColor, setBrushColor] = useState(brushColors[0]);
    const [brushSize, setBrushSize] = useState(12);
    const [hasSketch, setHasSketch] = useState(false);

    useEffect(() => {
        if (!open) return;
        setMode("draw");
        setBrushColor(brushColors[0]);
        setBrushSize(12);
        setHasSketch(false);
        window.requestAnimationFrame(() => resetSketchCanvas(canvasRef.current));
    }, [open]);

    const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const context = canvas.getContext("2d");
        if (!context) return;
        const point = readCanvasPoint(canvas, event.clientX, event.clientY);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = brushSize;
        context.strokeStyle = mode === "erase" ? "#ffffff" : brushColor;
        context.fillStyle = context.strokeStyle;
        drawSketchStroke(context, drawingRef.current.last || point, point, brushSize);
        drawingRef.current.last = point;
        if (mode === "draw") setHasSketch(true);
    };

    const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = { active: true, last: null };
        draw(event);
    };

    const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current.active) return;
        event.preventDefault();
        draw(event);
    };

    const stopDraw = () => {
        drawingRef.current = { active: false, last: null };
    };

    const reset = () => {
        resetSketchCanvas(canvasRef.current);
        setHasSketch(false);
    };

    const submit = () => {
        exportSketchBlob(canvasRef.current, (blob) => {
            if (blob) onConfirm(blob);
        });
    };

    return (
        <Modal title="手绘参考图" open={open} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="overflow-hidden rounded-xl border p-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <canvas
                        ref={canvasRef}
                        width={1024}
                        height={1024}
                        className="block aspect-square w-full cursor-crosshair rounded-lg bg-white touch-none"
                        onPointerDown={startDraw}
                        onPointerMove={moveDraw}
                        onPointerUp={stopDraw}
                        onPointerCancel={stopDraw}
                    />
                </div>
                <div className="flex min-h-0 flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2">
                        <Button type={mode === "draw" ? "primary" : "default"} icon={<Brush className="size-4" />} onClick={() => setMode("draw")}>
                            画笔
                        </Button>
                        <Button type={mode === "erase" ? "primary" : "default"} icon={<Eraser className="size-4" />} onClick={() => setMode("erase")}>
                            橡皮
                        </Button>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium opacity-70">笔刷大小</span>
                            <span className="font-semibold">{brushSize}px</span>
                        </div>
                        <Slider min={2} max={60} value={brushSize} onChange={(value) => setBrushSize(Number(value))} />
                    </div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-70">画笔颜色</div>
                        <div className="grid grid-cols-4 gap-2">
                            {brushColors.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    className="grid h-9 place-items-center rounded-lg border transition hover:scale-[1.03]"
                                    style={{ borderColor: brushColor === color && mode === "draw" ? theme.node.text : theme.node.stroke, background: theme.node.fill }}
                                    aria-label={`选择颜色 ${color}`}
                                    onClick={() => {
                                        setBrushColor(color);
                                        setMode("draw");
                                    }}
                                >
                                    <span className="size-5 rounded-full border border-black/10" style={{ background: color }} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                        <Button icon={<RotateCcw className="size-4" />} onClick={reset}>
                            清空
                        </Button>
                        <div className="flex gap-2">
                            <Button onClick={onClose}>取消</Button>
                            <Button type="primary" disabled={!hasSketch} onClick={submit}>
                                加入画布
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function resetSketchCanvas(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function exportSketchBlob(canvas: HTMLCanvasElement | null, callback: BlobCallback) {
    if (!canvas) return callback(null);
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return canvas.toBlob(callback, "image/png");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0);
    output.toBlob(callback, "image/png");
}

function readCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
}

function drawSketchStroke(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number) {
    if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
}
