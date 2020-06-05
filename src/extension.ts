import { Core } from 'cytoscape';
import { BubbleSets, IOutlineOptions } from 'bubblesets-js';

export interface IBubbleSetsPluginOptions extends IOutlineOptions {
  zIndex?: number;
  pixelRatio?: 'auto' | number;
}

// canvas ideas based on https://github.com/classcraft/cytoscape.js-canvas

class BubbleSetsPlugin {
  private readonly bb: BubbleSets;
  readonly canvas: HTMLCanvasElement;

  constructor(private readonly cy: Core, options: IBubbleSetsPluginOptions = {}) {
    this.bb = new BubbleSets(options);
    const container = cy.container()!;

    const canvas = (this.canvas = container!.ownerDocument.createElement('canvas'));
    container.appendChild(canvas);
    canvas.style.zIndex = (options.zIndex ?? 1).toString();
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';

    const oPixelRatio = options.pixelRatio ?? 'auto';
    const pixelRatio = oPixelRatio === 'auto' ? window.devicePixelRatio : oPixelRatio;

    cy.on('resize', () => {
      const { width, height } = container.getBoundingClientRect();

      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      cy.trigger('bubbleSets.resize');
    });
  }
}

export function bubbleSets(this: Core, options: IBubbleSetsPluginOptions = {}) {
  return new BubbleSetsPlugin(this, options);
  // /**
  //  * Helper: Clear the canvas
  //  * @param {CanvasRenderingContext2D} ctx
  //  */
  // clear(ctx) {
  //   const width = cy.width();
  //   const height = cy.height();
  //   ctx.save();
  //   ctx.setTransform(1, 0, 0, 1, 0, 0);
  //   ctx.clearRect(0, 0, width * options.pixelRatio, height * options.pixelRatio);
  //   ctx.restore();
  // },
  // /**
  //  * Helper: Reset the context transform to an identity matrix
  //  * @param {CanvasRenderingContext2D} ctx
  //  */
  // resetTransform(ctx) {
  //   ctx.setTransform(1, 0, 0, 1, 0, 0);
  // },
  // /**
  //  * Helper: Set the context transform to match Cystoscape's zoom & pan
  //  * @param {CanvasRenderingContext2D} ctx
  //  */
  // setTransform(ctx) {
  //   const pan = cy.pan();
  //   const zoom = cy.zoom();
  //   ctx.setTransform(1, 0, 0, 1, 0, 0);
  //   ctx.translate(pan.x * options.pixelRatio, pan.y * options.pixelRatio);
  //   ctx.scale(zoom * options.pixelRatio, zoom * options.pixelRatio);
  // },
}
