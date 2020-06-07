import cy from 'cytoscape';
import {
  IOutlineOptions,
  PointPath,
  Area,
  createLineInfluenceArea,
  createGenericInfluenceArea,
  createRectangleInfluenceArea,
  Rectangle,
  Circle,
  calculatePotentialOutline,
  IRectangle,
  IPotentialOptions,
  defaultOptions,
  calculateVirtualEdges,
  IRoutingOptions,
  ILine,
  Line,
} from 'bubblesets-js';
import throttle from 'lodash.throttle';

export interface IBubbleSetPathOptions extends IOutlineOptions, IPotentialOptions, ICanvasStyle, IRoutingOptions {
  throttle?: number;
  drawPotentialArea?: boolean;

  includeLabels?: boolean;
  includeMainLabels?: boolean;
  includeOverlays?: boolean;
  includeSourceLabels?: boolean;
  includeTargetLabels?: boolean;
}

export interface ICanvasStyle {
  fillStyle?: string | CanvasGradient | CanvasPattern;
  strokeStyle?: string | CanvasGradient | CanvasPattern;
}

interface IBubbleSetNodeData {
  area?: Area;
  isCircle: boolean;
  shape: Circle | Rectangle;
}
interface IBubbleSetEdgeData {
  lines: Line[];
  areas: Area[];
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

const SCRATCH_KEY = 'bubbleSets';
const circularBase = ['ellipse', 'diamond', 'diamond', 'pentagon', 'diamond', 'hexagon', 'heptagon', 'octagon', 'star'];
const circular = new Set(circularBase.concat(circularBase.map((v) => `round-${v}`)));

function isCircleShape(shape: string) {
  return circular.has(shape);
}

function toNodeKey(data: IBubbleSetNodeData) {
  return `${round2(data.shape.width)}x${round2(data.shape.height)}x${data.isCircle}`;
}
function toEdgeKey(line: ILine) {
  return `${round2(line.x1)}x${round2(line.y1)}x${round2(line.x2)}x${round2(line.y2)}`;
}

function linesEquals(a: ILine[], b: ILine[]) {
  return a.length === b.length && a.every((ai, i) => toEdgeKey(ai) === toEdgeKey(b[i]));
}

function createShape(isCircle: boolean, bb: cy.BoundingBox12 & cy.BoundingBoxWH) {
  return isCircle
    ? new Circle(bb.x1 + bb.w / 2, bb.y1 + bb.h / 2, Math.max(bb.w, bb.h) / 2)
    : new Rectangle(bb.x1, bb.y1, bb.w, bb.h);
}

export default class BubbleSetPath {
  private path = new PointPath([]);
  private activeArea: IRectangle = { x: 0, y: 0, width: 0, height: 0 };
  private potentialArea: Area = new Area(4, 0, 0, 0, 0, 0, 0);
  private readonly options: Required<IBubbleSetPathOptions>;
  private readonly virtualEdgeAreas = new Map<string, Area>();

  private readonly throttledUpdate: () => void;

  constructor(
    private readonly plugin: { draw(): void; removePath(path: BubbleSetPath): boolean },
    public readonly nodes: cy.NodeCollection,
    public readonly edges: cy.EdgeCollection | null,
    public readonly avoidNodes: cy.NodeCollection | null,
    options: IBubbleSetPathOptions = {}
  ) {
    this.options = Object.assign(
      {},
      defaultOptions,
      {
        fillStyle: 'rgba(0,0,0,0.25)',
        strokeStyle: 'black',
        throttle: 100,
        drawPotentialArea: false,
        virtualEdges: false,
      },
      {
        includeLabels: false,
        includeMainLabels: false,
        includeOverlays: false,
        includeSourceLabels: false,
        includeTargetLabels: false,
      },
      options
    );

    this.throttledUpdate = throttle(() => {
      this.update();
      this.plugin.draw();
    }, this.options.throttle);

    nodes.on('add position remove', this.throttledUpdate);
    if (avoidNodes) {
      avoidNodes.on('add position remove', this.throttledUpdate);
    }
    if (edges) {
      edges.on('add move position position', this.throttledUpdate);
    }
  }

  update = () => {
    const bb = this.nodes.union(this.edges ?? []).boundingBox(this.options);
    let potentialAreaDirty = false;
    const padding = Math.max(this.options.edgeR1, this.options.nodeR1) + this.options.morphBuffer;
    const nextPotentialBB: IRectangle = {
      x: bb.x1 - padding,
      y: bb.y1 - padding,
      width: bb.w + padding * 2,
      height: bb.h + padding * 2,
    };
    if (this.activeArea.x !== nextPotentialBB.x || this.activeArea.y !== nextPotentialBB.y) {
      potentialAreaDirty = true;
      this.potentialArea = Area.fromPixelRegion(nextPotentialBB, this.options.pixelGroup);
    } else if (this.activeArea.width !== nextPotentialBB.width || this.activeArea.height !== nextPotentialBB.height) {
      // but not dirty
      this.potentialArea = Area.fromPixelRegion(nextPotentialBB, this.options.pixelGroup);
    }
    this.activeArea = nextPotentialBB;
    const potentialArea = this.potentialArea;

    const cache = new Map<string, Area>();

    if (!potentialAreaDirty) {
      this.nodes.forEach((n) => {
        const data = (n.scratch(SCRATCH_KEY) ?? null) as IBubbleSetNodeData | null;
        if (data && data.area) {
          cache.set(toNodeKey(data), data.area);
        }
      });
    }

    let updateEdges = false;
    const updateNodeData = (n: cy.NodeSingular) => {
      const bb = n.boundingBox(this.options);
      let data = (n.scratch(SCRATCH_KEY) ?? null) as IBubbleSetNodeData | null;
      const isCircle = isCircleShape(n.style('shape'));
      if (
        !data ||
        potentialAreaDirty ||
        !data.area ||
        data.isCircle !== isCircle ||
        data.shape.width !== bb.w ||
        data.shape.height !== bb.h
      ) {
        // full recreate
        updateEdges = true;
        data = {
          isCircle,
          shape: createShape(isCircle, bb),
        };
        const key = toNodeKey(data);
        if (cache.has(key)) {
          data.area = this.potentialArea.copy(cache.get(key)!, {
            x: bb.x1 - this.options.nodeR1,
            y: bb.y1 - this.options.nodeR1,
          });
        } else {
          data.area = data!.isCircle
            ? createGenericInfluenceArea(data!.shape, potentialArea, this.options.nodeR1)
            : createRectangleInfluenceArea(data!.shape, potentialArea, this.options.nodeR1);
          cache.set(key, data.area!);
        }
        n.scratch(SCRATCH_KEY, data);
      } else if (data.shape.x !== bb.x1 || data.shape.y !== bb.y1) {
        updateEdges = true;
        data.shape = createShape(isCircle, bb);
        data.area = this.potentialArea.copy(data.area!, {
          x: bb.x1 - this.options.nodeR1,
          y: bb.y1 - this.options.nodeR1,
        });
      }

      return data;
    };

    const members = this.nodes.map(updateNodeData);
    const nonMembers = !this.avoidNodes ? [] : this.avoidNodes.map(updateNodeData);

    const edgeCache = new Map<string, Area>();

    if (!potentialAreaDirty) {
      this.virtualEdgeAreas.forEach((value, key) => edgeCache.set(key, value));
      (this.edges ?? []).forEach((n: cy.EdgeSingular) => {
        const data = (n.scratch(SCRATCH_KEY) ?? null) as IBubbleSetEdgeData | null;
        if (data && data.lines) {
          data.lines.forEach((line, i) => {
            const area = data.areas[i];
            if (area) {
              cache.set(toEdgeKey(line), area);
            }
          });
        }
      });
    }
    const updateEdgeArea = (line: ILine) => {
      const key = toEdgeKey(line);
      if (edgeCache.has(key)) {
        return edgeCache.get(key)!;
      }
      const r = createLineInfluenceArea(line, this.potentialArea, this.options.edgeR1);
      edgeCache.set(key, r);
      return r;
    };
    const edges: Area[] = [];

    (this.edges ?? []).forEach((e: cy.EdgeSingular) => {
      const ps = (e.segmentPoints() ?? [e.sourceEndpoint(), e.targetEndpoint()]).map((d) => Object.assign({}, d));
      if (ps.length === 0) {
        return;
      }
      const lines = ps.slice(1).map((next, i) => {
        const prev = ps[i];
        return Line.from({
          x1: prev.x,
          y1: prev.y,
          x2: next.x,
          y2: next.y,
        });
      });
      let data = (e.scratch(SCRATCH_KEY) ?? null) as IBubbleSetEdgeData | null;
      if (!data || potentialAreaDirty || !linesEquals(data.lines, lines)) {
        data = {
          lines,
          areas: lines.map(updateEdgeArea),
        };
        e.scratch(SCRATCH_KEY, data);
      }
      edges.push(...data.areas);
    });

    const memberShapes = members.map((d) => d.shape);
    if (this.options.virtualEdges) {
      if (updateEdges) {
        const nonMembersShapes = nonMembers.map((d) => d.shape);
        const lines = calculateVirtualEdges(
          memberShapes,
          nonMembersShapes,
          this.options.maxRoutingIterations,
          this.options.morphBuffer
        );
        this.virtualEdgeAreas.clear();
        lines.forEach((line) => {
          const area = updateEdgeArea(line);
          const key = toEdgeKey(line);
          this.virtualEdgeAreas.set(key, area);
          edges.push(area);
        });
      } else {
        this.virtualEdgeAreas.forEach((area) => edges.push(area));
      }
    }

    const memberAreas = members.map((d) => d.area!);
    const nonMemberAreas = nonMembers.map((d) => d.area!);
    let path = calculatePotentialOutline(
      potentialArea,
      memberAreas,
      edges,
      nonMemberAreas,
      (p) => p.containsElements(memberShapes),
      this.options
    );

    this.path = path.sample(8).simplify(0).bSplines().simplify(0);
  };

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    if (this.options.drawPotentialArea) {
      this.potentialArea.draw(ctx, true);
    }
    this.path.draw(ctx);
    if (this.options.strokeStyle) {
      ctx.strokeStyle = this.options.strokeStyle;
      ctx.stroke();
    }
    if (this.options.fillStyle) {
      ctx.fillStyle = this.options.fillStyle;
      ctx.fill();
    }
    ctx.restore();
  }

  remove() {
    this.nodes.off('add position remove', undefined, this.throttledUpdate);
    if (this.avoidNodes) {
      this.avoidNodes.off('add position remove', undefined, this.throttledUpdate);
      this.avoidNodes.forEach((d) => {
        d.scratch(SCRATCH_KEY, {});
      });
    }
    this.nodes.forEach((d) => {
      d.scratch(SCRATCH_KEY, {});
    });
    if (this.edges) {
      this.edges.off('add move position position', undefined, this.throttledUpdate);
      this.edges.forEach((d) => {
        d.scratch(SCRATCH_KEY, {});
      });
    }
    this.plugin.removePath(this);
  }
}
