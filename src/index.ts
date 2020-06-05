import { bubbleSets } from './extension';
export * from './extension';

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
