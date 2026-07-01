"use client";

import React, { useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasInputMode, ViewportTransform } from "../types";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    inputMode: CanvasInputMode;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onTouchContextMenu?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, inputMode, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onTouchContextMenu, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const touchState = useRef({
        pointers: new Map<number, { x: number; y: number }>(),
        startDistance: 0,
        startCenterX: 0,
        startCenterY: 0,
        initialX: 0,
        initialY: 0,
        initialK: 1,
        longPressed: false,
    });
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const isTouchMode = inputMode !== "mouse";

    useEffect(() => {
        scaleRef.current = viewport.k;
        viewportRef.current = viewport;
    }, [viewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;

        const delta = -event.deltaY;
        const factor = Math.pow(1.1, delta / 100);
        const newScale = Math.min(Math.max(viewport.k * factor, 0.05), 5);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const worldX = (mouseX - viewport.x) / viewport.k;
        const worldY = (mouseY - viewport.y) / viewport.k;

        onViewportChange({
            x: mouseX - worldX * newScale,
            y: mouseY - worldY * newScale,
            k: newScale,
        });
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const isTouchPointer = event.pointerType === "touch";

        if (isTouchMode && isTouchPointer) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            touchState.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            if (isBackgroundClick && touchState.current.pointers.size === 1) {
                touchState.current.longPressed = false;
                longPressTimerRef.current = setTimeout(() => {
                    touchState.current.longPressed = true;
                    onTouchContextMenu?.(event);
                }, 520);
            }
            if (touchState.current.pointers.size >= 2) {
                const points = Array.from(touchState.current.pointers.values()).slice(0, 2);
                const center = getTouchCenter(points[0], points[1]);
                touchState.current = {
                    ...touchState.current,
                    startDistance: getTouchDistance(points[0], points[1]),
                    startCenterX: center.x,
                    startCenterY: center.y,
                    initialX: viewport.x,
                    initialY: viewport.y,
                    initialK: viewport.k,
                };
            } else {
                panState.current = {
                    isPanning: true,
                    startX: event.clientX,
                    startY: event.clientY,
                    initialX: viewport.x,
                    initialY: viewport.y,
                    hasMoved: false,
                };
            }
            return;
        }

        if (event.button === 0 && (event.ctrlKey || event.metaKey) && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
            return;
        }

        if (event.button === 1 || (event.button === 0 && !isSpacePressed && isBackgroundClick)) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
            };
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && isSpacePressed && isBackgroundClick) {
            event.preventDefault();
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const currentViewport = viewportRef.current;
            if (isTouchMode && event.pointerType === "touch" && touchState.current.pointers.has(event.pointerId)) {
                const pointers = touchState.current.pointers;
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                const points = Array.from(pointers.values()).slice(0, 2);

                if (longPressTimerRef.current && panState.current.isPanning) {
                    const dx = event.clientX - panState.current.startX;
                    const dy = event.clientY - panState.current.startY;
                    if (Math.abs(dx) > 8 || Math.abs(dy) > 8 || pointers.size > 1) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                }

                if (points.length >= 2 && touchState.current.startDistance) {
                    const center = getTouchCenter(points[0], points[1]);
                    const nextScale = Math.min(Math.max(touchState.current.initialK * (getTouchDistance(points[0], points[1]) / touchState.current.startDistance), 0.05), 5);
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const startLocalX = touchState.current.startCenterX - rect.left;
                    const startLocalY = touchState.current.startCenterY - rect.top;
                    const centerLocalX = center.x - rect.left;
                    const centerLocalY = center.y - rect.top;
                    const worldX = (startLocalX - touchState.current.initialX) / touchState.current.initialK;
                    const worldY = (startLocalY - touchState.current.initialY) / touchState.current.initialK;
                    nextViewportRef.current = {
                        x: centerLocalX - worldX * nextScale,
                        y: centerLocalY - worldY * nextScale,
                        k: nextScale,
                    };
                } else if (panState.current.isPanning) {
                    const dx = event.clientX - panState.current.startX;
                    const dy = event.clientY - panState.current.startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.current.hasMoved = true;
                    nextViewportRef.current = {
                        x: panState.current.initialX + dx,
                        y: panState.current.initialY + dy,
                        k: currentViewport.k,
                    };
                }

                if (frameRef.current) return;
                frameRef.current = requestAnimationFrame(() => {
                    frameRef.current = null;
                    if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
                });
                return;
            }

            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: currentViewport.k,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const handlePointerUp = (event: PointerEvent) => {
            if (isTouchMode && event.pointerType === "touch") {
                touchState.current.pointers.delete(event.pointerId);
                if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
                if (touchState.current.pointers.size === 0) {
                    if (!panState.current.hasMoved && !touchState.current.longPressed) onCanvasDeselect?.();
                    touchState.current.longPressed = false;
                    panState.current.isPanning = false;
                    return;
                }
                const remaining = Array.from(touchState.current.pointers.values())[0];
                panState.current = {
                    isPanning: true,
                    startX: remaining.x,
                    startY: remaining.y,
                    initialX: viewportRef.current.x,
                    initialY: viewportRef.current.y,
                    hasMoved: true,
                };
                touchState.current.startDistance = 0;
                return;
            }

            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved) {
                onCanvasDeselect?.();
            }
            panState.current.isPanning = false;
            document.body.style.cursor = "default";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [containerRef, isTouchMode, onCanvasDeselect, onViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventWheelScroll = (event: WheelEvent) => event.preventDefault();
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full cursor-grab select-none overflow-hidden"
            style={{ background: theme.canvas.background, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function getTouchDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getTouchCenter(a: { x: number; y: number }, b: { x: number; y: number }) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
