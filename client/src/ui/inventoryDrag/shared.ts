import { canPlaceRect, rectanglesOverlap, type GridBounds, type GridRect } from "@gamer/shared";

export type DragGridMetrics = {
  cellSize: number;
  gap: number;
};

export type DragPointerOffset = {
  x: number;
  y: number;
};

export type DragGridAnchor = {
  x: number;
  y: number;
};

export type DragSourceGeometry = {
  width: number;
  height: number;
};

export type DragItemShape = {
  instanceId: string;
  width?: number;
  height?: number;
  equipmentSlot?: string;
};

export type DragOccupant = GridRect & {
  instanceId: string;
};

export type DragGridCandidate = {
  x: number;
  y: number;
  width: number;
  height: number;
  valid: boolean;
  swapItemInstanceId?: string;
};

export type DragEquipmentCandidate<SlotKey extends string> = {
  slot: SlotKey;
  valid: boolean;
  swapItemInstanceId?: string;
};

export function createDragGhost(sourceEl: HTMLElement, event: PointerEvent, className = "inventory-drag-ghost") {
  const rect = sourceEl.getBoundingClientRect();
  const ghost = sourceEl.cloneNode(true) as HTMLElement;
  ghost.classList.add(className);
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.append(ghost);
  return {
    ghost,
    offset: {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
  };
}

export function updateDragGhostPosition(ghost: HTMLElement, pointer: { x: number; y: number }, offset: DragPointerOffset): void {
  ghost.style.left = `${pointer.x - offset.x}px`;
  ghost.style.top = `${pointer.y - offset.y}px`;
}

export function resolveGridAnchor(offset: DragPointerOffset, metrics: DragGridMetrics, item: Pick<DragItemShape, "width" | "height">): DragGridAnchor {
  const width = normalizeSpan(item.width);
  const height = normalizeSpan(item.height);
  const step = metrics.cellSize + metrics.gap;
  return {
    x: clamp(Math.floor(offset.x / step), 0, Math.max(0, width - 1)),
    y: clamp(Math.floor(offset.y / step), 0, Math.max(0, height - 1))
  };
}

export function resolveDragAnchorFromSource(
  offset: DragPointerOffset,
  metrics: DragGridMetrics,
  item: Pick<DragItemShape, "width" | "height">,
  sourceGeometry?: DragSourceGeometry
): DragGridAnchor {
  const width = normalizeSpan(item.width);
  const height = normalizeSpan(item.height);
  const sourceWidth = Math.max(1, Math.round(sourceGeometry?.width ?? width * metrics.cellSize + (width - 1) * metrics.gap));
  const sourceHeight = Math.max(1, Math.round(sourceGeometry?.height ?? height * metrics.cellSize + (height - 1) * metrics.gap));
  const stepX = sourceWidth / width;
  const stepY = sourceHeight / height;
  return {
    x: clamp(Math.floor(offset.x / stepX), 0, Math.max(0, width - 1)),
    y: clamp(Math.floor(offset.y / stepY), 0, Math.max(0, height - 1))
  };
}

export function isPointWithinRect(clientX: number, clientY: number, rect: DOMRect): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function toDragOccupants<T extends { instanceId: string; x: number; y: number; width?: number; height?: number }>(items: T[]): DragOccupant[] {
  return items.map((entry) => ({
    instanceId: entry.instanceId,
    x: entry.x,
    y: entry.y,
    width: normalizeSpan(entry.width),
    height: normalizeSpan(entry.height)
  }));
}

export function resolveGridCandidate(params: {
  grid: GridBounds;
  pointer: { x: number; y: number };
  surfaceRect: DOMRect;
  metrics: DragGridMetrics;
  item: DragItemShape;
  occupants: DragOccupant[];
  ignoreInstanceIds?: string[];
  anchor?: DragGridAnchor;
}): DragGridCandidate | null {
  const { grid, pointer, surfaceRect, metrics, item, occupants, ignoreInstanceIds = [], anchor } = params;
  if (!isPointWithinRect(pointer.x, pointer.y, surfaceRect)) {
    return null;
  }

  const width = normalizeSpan(item.width);
  const height = normalizeSpan(item.height);
  const step = metrics.cellSize + metrics.gap;
  const anchorX = clamp(anchor?.x ?? 0, 0, Math.max(0, width - 1));
  const anchorY = clamp(anchor?.y ?? 0, 0, Math.max(0, height - 1));
  const rawX = Math.floor((pointer.x - surfaceRect.left) / step) - anchorX;
  const rawY = Math.floor((pointer.y - surfaceRect.top) / step) - anchorY;
  const x = clamp(rawX, 0, Math.max(0, grid.width - width));
  const y = clamp(rawY, 0, Math.max(0, grid.height - height));
  const rect = { x, y, width, height };
  const blocked = occupants.filter((entry) => !ignoreInstanceIds.includes(entry.instanceId));
  const overlaps = blocked.filter((entry) => rectanglesOverlap(rect, entry));

  if (overlaps.length === 0) {
    return {
      ...rect,
      valid: canPlaceRect(grid, blocked, rect)
    };
  }

  if (overlaps.length === 1) {
    const swapTarget = overlaps[0];
    if (swapTarget.width === width && swapTarget.height === height) {
      const remaining = blocked.filter((entry) => entry.instanceId !== swapTarget.instanceId);
      return {
        ...rect,
        valid: canPlaceRect(grid, remaining, rect),
        swapItemInstanceId: swapTarget.instanceId
      };
    }
  }

  return {
    ...rect,
    valid: false
  };
}

export function resolveEquipmentCandidate<SlotKey extends string>(params: {
  slot: SlotKey;
  item: DragItemShape;
  occupant?: { instanceId: string } | null;
}): DragEquipmentCandidate<SlotKey> {
  const valid = params.item.equipmentSlot === params.slot
    && (!params.occupant || params.occupant.instanceId !== params.item.instanceId);
  return {
    slot: params.slot,
    valid,
    swapItemInstanceId: valid && params.occupant && params.occupant.instanceId !== params.item.instanceId
      ? params.occupant.instanceId
      : undefined
  };
}

export function formatHighlightRect(candidate: DragGridCandidate, metrics: DragGridMetrics): Record<"left" | "top" | "width" | "height", string> {
  return {
    left: `${candidate.x * (metrics.cellSize + metrics.gap)}px`,
    top: `${candidate.y * (metrics.cellSize + metrics.gap)}px`,
    width: `${candidate.width * metrics.cellSize + (candidate.width - 1) * metrics.gap}px`,
    height: `${candidate.height * metrics.cellSize + (candidate.height - 1) * metrics.gap}px`
  };
}

function normalizeSpan(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
