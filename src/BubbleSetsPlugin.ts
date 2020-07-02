import cy from 'cytoscape';
import throttle from 'lodash.throttle';
import BubbleSetPath, { IBubbleSetPathOptions } from './BubbleSetPath';

export interface IBubbleSetsPluginOptions extends IBubbleSetPathOptions {
  zIndex?: number;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// canvas ideas based on https://github.com/classcraft/cytoscape.js-canvas

export default class BubbleSetsPlugin {
  readonly svg: SVGSVGElement;
  readonly #paths: BubbleSetPath[] = [];
  readonly #adapter = {
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

    const svg = (this.svg = (container?.ownerDocument ?? document).createElementNS(SVG_NAMESPACE, 'svg'));
    if (container) {
      container.insertAdjacentElement('afterbegin', svg);
    }
    svg.style.zIndex = (options.zIndex ?? 0).toString();
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.userSelect = 'none';
    svg.style.outlineStyle = 'none';

    svg.appendChild(svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'g'));
    cy.on(
      'zoom pan',
      throttle(() => {
        this.zoomed();
      }, options.throttle ?? 100)
    );
    const resize = () => {
      svg.style.width = `${cy.width()}px`;
      svg.style.height = `${cy.height()}px`;
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
    const node = this.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    this.svg.firstElementChild!.appendChild(node);
    const path = new BubbleSetPath(
      this.#adapter,
      node,
      nodes,
      edges ?? this.#cy.collection(),
      avoidNodes ?? this.#cy.collection(),
      Object.assign({}, this.#options, options)
    );
    this.#paths.push(path);
    path.update();
    return path;
  }

  getPaths() {
    return this.#paths.slice();
  }

  removePath(path: BubbleSetPath) {
    const i = this.#paths.indexOf(path);
    if (i < 0) {
      return false;
    }
    return path.remove();
  }

  private zoomed() {
    const pan = this.#cy.pan();
    const zoom = this.#cy.zoom();
    const g = this.svg.firstElementChild! as SVGGElement;
    g.setAttribute('transform', `translate(${pan.x},${pan.y})scale(${zoom})`);
  }

  update() {
    this.zoomed();
    this.#paths.forEach((p) => p.update());
  }
}

export function bubbleSets(this: cy.Core, options: IBubbleSetsPluginOptions = {}) {
  return new BubbleSetsPlugin(this, options);
}
