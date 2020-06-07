import cy from 'cytoscape';
import throttle from 'lodash.throttle';
import BubbleSetPath, { IBubbleSetPathOptions } from './BubbleSetPath';

export interface IBubbleSetsPluginOptions extends IBubbleSetPathOptions {
  zIndex?: number;
  pixelRatio?: 'auto' | number;
}

// canvas ideas based on https://github.com/classcraft/cytoscape.js-canvas

export default class BubbleSetsPlugin {
  readonly canvas: HTMLCanvasElement;
  private readonly pixelRatio: number;
  private readonly paths: BubbleSetPath[] = [];

  constructor(private readonly cy: cy.Core, private readonly options: IBubbleSetsPluginOptions = {}) {
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
    const resize = () => {
      canvas.width = cy.width() * this.pixelRatio;
      canvas.height = cy.height() * this.pixelRatio;

      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
      this.draw();
    };
    cy.on('resize', resize);
    resize();
  }

  addPath(
    nodes: cy.NodeCollection,
    edges: cy.EdgeCollection | null,
    avoidNodes: cy.NodeCollection | null,
    options: IBubbleSetPathOptions = {}
  ) {
    const path = new BubbleSetPath(this, nodes, edges, avoidNodes, Object.assign({}, this.options, options));
    this.paths.push(path);
    path.update();
    this.draw();
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

export function bubbleSets(this: cy.Core, options: IBubbleSetsPluginOptions = {}) {
  return new BubbleSetsPlugin(this, options);
}
