import { bubbleSets } from './BubbleSetsPlugin';
export * from './BubbleSetsPlugin';
export { default as BubbleSetsPlugin } from './BubbleSetsPlugin';
export * from './BubbleSetPath';
export { default as BubbleSetPath } from './BubbleSetPath';

export default function register(
  cytoscape: (type: 'core' | 'collection' | 'layout', name: string, extension: any) => void
) {
  cytoscape('core', 'bubbleSets', bubbleSets);
}

if (typeof (window as any).cytoscape !== 'undefined') {
  register((window as any).cytoscape);
}

declare namespace cytoscape {
  interface Core {
    bubbleSets: typeof bubbleSets;
  }
}
