import { Core, NodeCollection, EdgeCollection, NodeSingular, BoundingBoxWH, BoundingBox12 } from 'cytoscape';
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
  ICenterPoint,
  IRectangle,
  IPoint,
  IPotentialOptions,
  defaultOptions,
} from 'bubblesets-js';
import throttle from 'lodash.throttle';

export interface IPathOptions extends IOutlineOptions, IPotentialOptions, ICanvasStyle {
  throttle?: number;
  drawPotentialArea?: boolean;
}

export interface ICanvasStyle {
  fillStyle?: string | CanvasGradient | CanvasPattern;
  strokeStyle?: string | CanvasGradient | CanvasPattern;
}

export interface IBubbleSetsPluginOptions extends IPathOptions {
  zIndex?: number;
  pixelRatio?: 'auto' | number;
}

export interface IBubbleSetNodeData {
  area?: Area;
  isCircle: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface IBubbleSetEdgeData {
  areas: [];
  points: IPoint[];
}

const SCRATCH_KEY = 'bubbleSets';
const circularBase = ['ellipse', 'diamond', 'diamond', 'pentagon', 'diamond', 'hexagon', 'heptagon', 'octagon', 'star'];
const circular = new Set(circularBase.concat(circularBase.map((v) => `round-${v}`)));

function useCircle(shape: string) {
  return circular.has(shape);
}

function arrayEquals(a: IPoint[], b: IPoint[]) {
  return a.length === b.length && a.every((ai, i) => ai.x === b[i].x && ai.y === b[i].y);
}

class BubbleSetPath {
  private path = new PointPath([]);
  private potentialAreaBB: IRectangle = { x: 0, y: 0, width: 0, height: 0 };
  private potentialArea: Area = new Area(4, 0, 0, 0, 0, 0, 0);
  private readonly options: Required<IPathOptions>;

  private readonly throttledUpdate: () => void;

  constructor(
    private readonly plugin: BubbleSetsPlugin,
    public readonly nodes: NodeCollection,
    public readonly edges: EdgeCollection,
    public readonly avoidNodes: NodeCollection | null,
    options: IPathOptions = {}
  ) {
    this.options = Object.assign(
      {
        fillStyle: 'rgba(0,0,0,0.25)',
        strokeStyle: 'black',
        throttle: 100,
        drawPotentialArea: false,
      },
      defaultOptions,
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
    edges.on('add move position position', this.throttledUpdate);
  }

  update = () => {
    const bb = this.nodes.union(this.edges).boundingBox({});
    let potentialAreaDirty = false;
    const padding = Math.max(this.options.edgeR1, this.options.nodeR1) + this.options.morphBuffer;
    const nextPotentialBB: IRectangle = {
      x: bb.x1 - padding,
      y: bb.y1 - padding,
      width: bb.w + padding * 2,
      height: bb.h + padding * 2,
    };
    if (this.potentialAreaBB.x !== nextPotentialBB.x || this.potentialAreaBB.y !== nextPotentialBB.y) {
      potentialAreaDirty = true;
      this.potentialArea = Area.fromPixelRegion(nextPotentialBB, this.options.pixelGroup);
    } else if (
      this.potentialAreaBB.width !== nextPotentialBB.width ||
      this.potentialAreaBB.height !== nextPotentialBB.height
    ) {
      // but not dirty
      this.potentialArea = Area.fromPixelRegion(nextPotentialBB, this.options.pixelGroup);
    }
    this.potentialAreaBB = nextPotentialBB;
    const potentialArea = this.potentialArea;

    const memberCenters: ICenterPoint[] = [];
    const cache = new Map<string, Area>();
    if (!potentialAreaDirty) {
      this.nodes.forEach((n) => {
        const data = n.scratch(SCRATCH_KEY) ?? (null as IBubbleSetNodeData | null);
        if (data && data.area) {
          cache.set(`${data.width}x${data.height}x${data.isCircle}`, data.area);
        }
      });
    }

    const updateData = (n: NodeSingular, bb: BoundingBox12 & BoundingBoxWH) => {
      let data = n.scratch(SCRATCH_KEY) ?? (null as IBubbleSetNodeData | null);
      const center = {
        cx: bb.x1 + bb.w / 2,
        cy: bb.y1 + bb.h / 2,
      };
      if (
        !data ||
        potentialAreaDirty ||
        !data.area ||
        data.isCircle !== useCircle(n.style('shape')) ||
        data.width !== bb.w ||
        data.height !== bb.h
      ) {
        // full recreate
        data = {
          isCircle: useCircle(n.style('shape')),
          x: bb.x1,
          y: bb.y1,
          width: bb.w,
          height: bb.h,
        };
        const key = `${data.width}x${data.height}x${data.isCircle}`;
        if (cache.has(key)) {
          data.area = this.potentialArea.copy(cache.get(key)!, {
            x: bb.x1 - this.options.nodeR1,
            y: bb.y1 - this.options.nodeR1,
          });
        } else {
          data.area = data.isCircle
            ? createGenericInfluenceArea(
                new Circle(center.cx, center.cy, Math.max(bb.w, bb.h) / 2),
                potentialArea,
                this.options.nodeR1
              )
            : createRectangleInfluenceArea(Rectangle.from(data), potentialArea, this.options.nodeR1);
        }
        n.scratch(SCRATCH_KEY, data);
      } else if (data.x !== bb.x1 || data.y !== bb.y1) {
        data.area = this.potentialArea.copy(data.area!, {
          x: bb.x1 - this.options.nodeR1,
          y: bb.y1 - this.options.nodeR1,
        });
      }

      return data.area!;
    };
    const members = this.nodes.map((n) => {
      const bb = n.boundingBox({});

      const center = {
        cx: bb.x1 + bb.w / 2,
        cy: bb.y1 + bb.h / 2,
      };

      memberCenters.push(center);
      return updateData(n, bb);
    });

    const nonMembers = !this.avoidNodes
      ? []
      : this.avoidNodes.map((n) => {
          return updateData(n, n.boundingBox({}));
        });

    const edges: Area[] = [];
    this.edges.forEach((e) => {
      const ps = e.segmentPoints() ?? [e.sourceEndpoint(), e.targetEndpoint()];
      if (ps.length === 0) {
        return;
      }
      let data = e.scratch(SCRATCH_KEY) ?? (null as IBubbleSetEdgeData | null);
      if (!data || potentialAreaDirty || !arrayEquals(data.points, ps)) {
        data = {
          points: ps,
          areas: ps.slice(1).map((next, i) => {
            const prev = ps[i];
            return createLineInfluenceArea(
              {
                x1: prev.x,
                y1: prev.y,
                x2: next.x,
                y2: next.y,
              },
              potentialArea,
              20
            );
          }),
        };
        e.scratch(SCRATCH_KEY, data);
      }
      edges.push(...data.areas);
    });

    const path = calculatePotentialOutline(
      potentialArea,
      members,
      edges,
      nonMembers,
      (p) => p.containsElements(memberCenters),
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
    this.edges.off('add move position position', undefined, this.throttledUpdate);
    this.nodes.forEach((d) => {
      d.scratch(SCRATCH_KEY, {});
    });
    this.edges.forEach((d) => {
      d.scratch(SCRATCH_KEY, {});
    });
    this.plugin.removePath(this);
  }
}

// canvas ideas based on https://github.com/classcraft/cytoscape.js-canvas

class BubbleSetsPlugin {
  // private readonly bb: BubbleSets;
  readonly canvas: HTMLCanvasElement;
  private readonly pixelRatio: number;
  private readonly paths: BubbleSetPath[] = [];

  constructor(private readonly cy: Core, private readonly options: IBubbleSetsPluginOptions = {}) {
    const container = cy.container();

    const canvas = (this.canvas = (container?.ownerDocument ?? document).createElement('canvas'));
    if (container) {
      container.appendChild(canvas);
    }
    canvas.style.zIndex = (options.zIndex ?? 1).toString();
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.userSelect = 'none';
    canvas.style.outlineStyle = 'none';

    const oPixelRatio = options.pixelRatio ?? 'auto';
    this.pixelRatio = oPixelRatio === 'auto' ? window.devicePixelRatio : oPixelRatio;

    cy.on('render', () => {
      this.draw();
    });
    cy.on(
      'layoutstop move',
      throttle(() => {
        this.update();
      }, 200)
    );
    cy.on('resize', () => {
      canvas.width = cy.width() * this.pixelRatio;
      canvas.height = cy.height() * this.pixelRatio;

      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
      this.draw();
    });
  }

  addPath(nodes: NodeCollection, edges: EdgeCollection, avoidNodes: NodeCollection | null, options: IPathOptions = {}) {
    const path = new BubbleSetPath(this, nodes, edges, avoidNodes, Object.assign({}, this.options, options));
    this.paths.push(path);
    return path;
  }

  removePath(path: BubbleSetPath) {
    const i = this.paths.indexOf(path);
    if (i < 0) {
      return false;
    }
    this.paths.splice(i, 1);
    return true;
  }

  get ctx() {
    return this.canvas.getContext('2d')!;
  }

  clear() {
    const ctx = this.ctx;
    ctx.save();
    ctx.resetTransform();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  update() {
    this.paths.forEach((p) => p.update());
    this.draw();
  }

  draw() {
    this.clear();
    const pan = this.cy.pan();
    const zoom = this.cy.zoom();
    const ctx = this.ctx;
    ctx.save();
    ctx.resetTransform();
    ctx.translate(pan.x * this.pixelRatio, pan.y * this.pixelRatio);
    ctx.scale(zoom * this.pixelRatio, zoom * this.pixelRatio);

    this.paths.forEach((p) => p.draw(ctx));

    ctx.restore();
  }
}

export function bubbleSets(this: Core, options: IBubbleSetsPluginOptions = {}) {
  return new BubbleSetsPlugin(this, options);
}
