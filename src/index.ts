import { bubbleSets } from './BubbleSetsPlugin';

export * from './BubbleSetsPlugin';
export { default as BubbleSetsPlugin } from './BubbleSetsPlugin';
export * from './BubbleSetPath';
export { default as BubbleSetPath } from './BubbleSetPath';

export type CytoscapeRegistry = {
  (type: 'core' | 'collection' | 'layout', name: string, extension: unknown): void;
};

export default function register(cytoscape: CytoscapeRegistry): void {
  cytoscape('core', 'bubbleSets', bubbleSets);
}

function hasCytoscape(obj: unknown): obj is { cytoscape: CytoscapeRegistry } {
  return typeof (obj as { cytoscape: CytoscapeRegistry }).cytoscape === 'function';
}

// auto register
if (hasCytoscape(window)) {
  register(window.cytoscape);
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace cytoscape {
  type Ext2 = (cytoscape: (type: 'core' | 'collection' | 'layout', name: string, extension: any) => void) => void;
  function use(module: Ext2): void;

  interface Core {
    bubbleSets: typeof bubbleSets;
  }
}
