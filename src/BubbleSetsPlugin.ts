import type cy from 'cytoscape';
import { layers, type ISVGLayer } from 'cytoscape-layers';
import BubbleSetPath, { type IBubbleSetPathOptions } from './BubbleSetPath';

export interface IBubbleSetsPluginOptions extends IBubbleSetPathOptions {
  layer?: ISVGLayer;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export default class BubbleSetsPlugin {
  readonly layer: ISVGLayer;

  readonly #layers: BubbleSetPath[] = [];

  readonly #adapter = {
    remove: (path: BubbleSetPath): boolean => {
      const index = this.#layers.indexOf(path);
      if (index < 0) {
        return false;
      }
      this.#layers.splice(index, 1);
      return true;
    },
  };

  readonly #cy: cy.Core;

  readonly #options: IBubbleSetsPluginOptions;

  constructor(currentCy: cy.Core, options: IBubbleSetsPluginOptions = {}) {
    this.#cy = currentCy;
    this.#options = options;
    this.layer = options.layer ?? layers(currentCy).nodeLayer.insertBefore('svg');
  }

  destroy(): void {
    for (const path of this.#layers) {
      path.remove();
    }
    this.layer.remove();
  }

  addPath(
    nodes: cy.NodeCollection,
    edges: cy.EdgeCollection | null = this.#cy.collection(),
    avoidNodes: cy.NodeCollection | null = this.#cy.collection(),
    options: IBubbleSetPathOptions = {}
  ): BubbleSetPath {
    const node = this.layer.node.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    this.layer.node.appendChild(node);
    const path = new BubbleSetPath(
      this.#adapter,
      node,
      nodes,
      edges ?? this.#cy.collection(),
      avoidNodes ?? this.#cy.collection(),
      { ...this.#options, ...options }
    );
    this.#layers.push(path);
    path.update();
    return path;
  }

  getPaths(): BubbleSetPath[] {
    return this.#layers.slice();
  }

  removePath(path: BubbleSetPath): boolean {
    const i = this.#layers.indexOf(path);
    if (i < 0) {
      return false;
    }
    return path.remove();
  }

  update(forceUpdate = false): void {
    this.#layers.forEach((p) => p.update(forceUpdate));
  }
}

export function bubbleSets(this: cy.Core, options: IBubbleSetsPluginOptions = {}): BubbleSetsPlugin {
  return new BubbleSetsPlugin(this, options);
}
