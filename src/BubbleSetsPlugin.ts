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
  readonly #pixelRatio: number;
  readonly #paths: BubbleSetPath[] = [];
  readonly #adapter = {
    draw: () => this.draw(),
    remove: (path: BubbleSetPath) => {
      const index = this.#paths.indexOf(path);
      if (index < 0) {
        return false;
      }
      this.#paths.splice(index, 1);
      return true;
    },
  };
  readonly #cy: cy.Core;
  readonly #options: IBubbleSetsPluginOptions;

  constructor(cy: cy.Core, options: IBubbleSetsPluginOptions = {}) {
    this.#cy = cy;
    this.#options = options;
    const container = cy.container();

    const canvas = (this.canvas = (container?.ownerDocument ?? document).createElement('canvas'));
    if (container) {
      container.insertAdjacentElement('afterbegin', canvas);
    }
    canvas.style.zIndex = (options.zIndex ?? 0).toString();
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.userSelect = 'none';
    canvas.style.outlineStyle = 'none';

    const oPixelRatio = options.pixelRatio ?? 'auto';
    this.#pixelRatio = oPixelRatio === 'auto' ? window.devicePixelRatio : oPixelRatio;

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
      canvas.width = cy.width() * this.#pixelRatio;
      canvas.height = cy.height() * this.#pixelRatio;

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
    const path = new BubbleSetPath(this.#adapter, nodes, edges, avoidNodes, Object.assign({}, this.#options, options));
    this.#paths.push(path);
    path.update();
    this.draw();
    return path;
  }

  removePath(path: BubbleSetPath) {
    const i = this.#paths.indexOf(path);
    if (i < 0) {
      return false;
    }
    return path.remove();
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
    this.#paths.forEach((p) => p.update());
    this.draw();
  }

  draw() {
    this.clear();
    const pan = this.#cy.pan();
    const zoom = this.#cy.zoom();
    const ctx = this.ctx;
    ctx.save();
    ctx.resetTransform();
    ctx.translate(pan.x * this.#pixelRatio, pan.y * this.#pixelRatio);
    ctx.scale(zoom * this.#pixelRatio, zoom * this.#pixelRatio);

    this.#paths.forEach((p) => p.draw(ctx));

    ctx.restore();
  }
}

export function bubbleSets(this: cy.Core, options: IBubbleSetsPluginOptions = {}) {
  return new BubbleSetsPlugin(this, options);
}
