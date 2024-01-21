import type cy from 'cytoscape';
import {
  type IOutlineOptions,
  Area,
  createLineInfluenceArea,
  createGenericInfluenceArea,
  createRectangleInfluenceArea,
  Rectangle,
  Circle,
  calculatePotentialOutline,
  type IRectangle,
  type IPotentialOptions,
  defaultOptions,
  calculateVirtualEdges,
  type IRoutingOptions,
  type ILine,
  Line,
} from 'bubblesets-js';
import throttle from 'lodash.throttle';

export interface IBubbleSetPathOptions extends IOutlineOptions, IPotentialOptions, ISVGPathStyle, IRoutingOptions {
  throttle?: number;
  interactive?: boolean;

  includeLabels?: boolean;
  includeMainLabels?: boolean;
  includeOverlays?: boolean;
  includeSourceLabels?: boolean;
  includeTargetLabels?: boolean;
}

export interface ISVGPathStyle {
  style?: Partial<CSSStyleDeclaration>;
  className?: string;
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
  #activeArea: IRectangle = { x: 0, y: 0, width: 0, height: 0 };

  #potentialArea: Area = new Area(4, 0, 0, 0, 0, 0, 0);

  readonly #options: Required<IBubbleSetPathOptions>;

  readonly #virtualEdgeAreas = new Map<string, Area>();

  readonly #throttledUpdate: () => void;

  readonly #adder: (e: cy.EventObject) => void;

  readonly #remover: (e: cy.EventObject) => void;

  readonly #adapter: { remove(path: BubbleSetPath): boolean };

  constructor(
    adapter: { remove(path: BubbleSetPath): boolean },
    public readonly node: SVGPathElement,
    public readonly nodes: cy.NodeCollection,
    public readonly edges: cy.EdgeCollection,
    public readonly avoidNodes: cy.NodeCollection,
    options: IBubbleSetPathOptions = {}
  ) {
    this.#adapter = adapter;
    this.#options = {
      ...defaultOptions,
      style: {
        stroke: 'black',
        fill: 'black',
        fillOpacity: '0.25',
      },
      className: '',
      throttle: 100,
      virtualEdges: false,
      interactive: false,
      includeLabels: false,
      includeMainLabels: false,
      includeOverlays: false,
      includeSourceLabels: false,
      includeTargetLabels: false,
      ...options,
    };

    Object.assign(this.node.style, this.#options.style);
    if (this.#options.className) {
      this.node.classList.add(this.#options.className);
    }

    if (this.#options.interactive) {
      this.node.addEventListener('dblclick', () => {
        this.nodes.select();
      });
    }

    this.#throttledUpdate = throttle(() => {
      this.update();
    }, this.#options.throttle);
    this.#adder = (e) => {
      e.target.on('add', this.#adder);
      e.target.on('remove', this.#remover);
      this.#throttledUpdate();
    };
    this.#remover = (e) => {
      e.target.off('add', undefined, this.#adder);
      e.target.off('remove', undefined, this.#remover);
      this.#throttledUpdate();
    };

    nodes.on('position', this.#throttledUpdate);
    nodes.on('add', this.#adder);
    nodes.on('remove', this.#remover);
    avoidNodes.on('position', this.#throttledUpdate);
    avoidNodes.on('add', this.#adder);
    avoidNodes.on('remove', this.#remover);
    edges.on('move position', this.#throttledUpdate);
    edges.on('add', this.#adder);
    edges.on('remove', this.#remover);
  }

  update = (forceUpdate = false): void => {
    const bb = this.nodes.union(this.edges).boundingBox(this.#options);
    let potentialAreaDirty = false;
    const padding = Math.max(this.#options.edgeR1, this.#options.nodeR1) + this.#options.morphBuffer;
    const nextPotentialBB: IRectangle = {
      x: bb.x1 - padding,
      y: bb.y1 - padding,
      width: bb.w + padding * 2,
      height: bb.h + padding * 2,
    };
    if (forceUpdate || this.#activeArea.x !== nextPotentialBB.x || this.#activeArea.y !== nextPotentialBB.y) {
      potentialAreaDirty = true;
      this.#potentialArea = Area.fromPixelRegion(nextPotentialBB, this.#options.pixelGroup);
    } else if (this.#activeArea.width !== nextPotentialBB.width || this.#activeArea.height !== nextPotentialBB.height) {
      // but not dirty
      this.#potentialArea = Area.fromPixelRegion(nextPotentialBB, this.#options.pixelGroup);
    }
    this.#activeArea = nextPotentialBB;
    const potentialArea = this.#potentialArea;

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
      const nodeBB = n.boundingBox(this.#options);
      let data = (n.scratch(SCRATCH_KEY) ?? null) as IBubbleSetNodeData | null;
      const isCircle = isCircleShape(n.style('shape'));
      if (
        !data ||
        potentialAreaDirty ||
        !data.area ||
        data.isCircle !== isCircle ||
        data.shape.width !== nodeBB.w ||
        data.shape.height !== nodeBB.h
      ) {
        // full recreate
        updateEdges = true;
        data = {
          isCircle,
          shape: createShape(isCircle, nodeBB),
        };
        const key = toNodeKey(data);
        const cached = cache.get(key);
        if (cached != null) {
          data.area = this.#potentialArea.copy(cached, {
            x: nodeBB.x1 - this.#options.nodeR1,
            y: nodeBB.y1 - this.#options.nodeR1,
          });
        } else {
          data.area = data.isCircle
            ? createGenericInfluenceArea(data.shape, potentialArea, this.#options.nodeR1)
            : createRectangleInfluenceArea(data.shape, potentialArea, this.#options.nodeR1);
          cache.set(key, data.area);
        }
        n.scratch(SCRATCH_KEY, data);
      } else if (data.shape.x !== nodeBB.x1 || data.shape.y !== nodeBB.y1) {
        updateEdges = true;
        data.shape = createShape(isCircle, nodeBB);
        data.area = this.#potentialArea.copy(data.area, {
          x: nodeBB.x1 - this.#options.nodeR1,
          y: nodeBB.y1 - this.#options.nodeR1,
        });
      }

      return data;
    };

    const members = this.nodes.map(updateNodeData);
    const nonMembers = this.avoidNodes.map(updateNodeData);

    const edgeCache = new Map<string, Area>();

    if (!potentialAreaDirty) {
      this.#virtualEdgeAreas.forEach((value, key) => edgeCache.set(key, value));
      this.edges.forEach((n: cy.EdgeSingular) => {
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
      const cached = edgeCache.get(key);
      if (cached != null) {
        return cached;
      }
      const r = createLineInfluenceArea(line, this.#potentialArea, this.#options.edgeR1);
      edgeCache.set(key, r);
      return r;
    };
    const edges: Area[] = [];

    this.edges.forEach((e: cy.EdgeSingular) => {
      const ps = (e.segmentPoints() ?? [e.sourceEndpoint(), e.targetEndpoint()]).map((d) => ({ ...d }));
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
    if (this.#options.virtualEdges) {
      if (updateEdges) {
        const nonMembersShapes = nonMembers.map((d) => d.shape);
        const lines = calculateVirtualEdges(
          memberShapes,
          nonMembersShapes,
          this.#options.maxRoutingIterations,
          this.#options.morphBuffer
        );
        this.#virtualEdgeAreas.clear();
        lines.forEach((line) => {
          const area = updateEdgeArea(line);
          const key = toEdgeKey(line);
          this.#virtualEdgeAreas.set(key, area);
          edges.push(area);
        });
      } else {
        this.#virtualEdgeAreas.forEach((area) => edges.push(area));
      }
    }

    const memberAreas = members.filter((d): d is typeof d & { area: Area } => d.area != null).map((d) => d.area);
    const nonMemberAreas = nonMembers.filter((d): d is typeof d & { area: Area } => d.area != null).map((d) => d.area);
    const path = calculatePotentialOutline(
      potentialArea,
      memberAreas,
      edges,
      nonMemberAreas,
      (p) => p.containsElements(memberShapes),
      this.#options
    );

    this.node.setAttribute('d', path.sample(8).simplify(0).bSplines().simplify(0).toString(2));
  };

  remove(): boolean {
    for (const set of [this.nodes, this.edges, this.avoidNodes]) {
      set.off('move position', undefined, this.#throttledUpdate);
      set.off('add', undefined, this.#adder);
      set.off('remove', undefined, this.#remover);
      set.forEach((d: cy.NodeSingular | cy.EdgeSingular) => {
        d.scratch(SCRATCH_KEY, {});
      });
    }

    this.node.remove();
    return this.#adapter.remove(this);
  }
}
