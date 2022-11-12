# Cytoscape.js BubbleSets Plugin

[![NPM Package][npm-image]][npm-url] [![Github Actions][github-actions-image]][github-actions-url] [![Cytoscape Plugin][cytoscape-image]][cytoscape-url]

A [Cytoscape.js](https://js.cytoscape.org) plugin for rendering [Bubblesets](https://github.com/upsetjs/bubblesets-js).

![Euler Example](https://user-images.githubusercontent.com/4129778/83965199-249aef00-a8b2-11ea-866e-4b0207c7b446.png)

## Install

```sh
npm install cytoscape cytoscape-layers cytoscape-bubblesets
```

## Usage

see [Samples](./samples) on Github

or at this [![Open in CodePen][codepen]](https://codepen.io/sgratzl/pen/RwQdBLY)

```js
import cytoscape from 'cytoscape';
import BubbleSets from 'cytoscape-bubblesets';
cytoscape.use(BubbleSets);

const cy = cytoscape({
  container: document.getElementById('app'),
  elements: [
    { data: { id: 'a' } },
    { data: { id: 'b' } },
    {
      data: {
        id: 'ab',
        source: 'a',
        target: 'b',
      },
    },
  ],
});
cy.ready(() => {
  const bb = cy.bubbleSets();
  bb.addPath(cy.nodes(), cy.edges(), null);
});
```

![image](https://user-images.githubusercontent.com/4129778/83965802-8cebcf80-a8b6-11ea-9481-1744521fe8a1.png)

Alternative without registration

```js
import cytoscape from 'cytoscape';
import { BubbleSetsPlugin } from 'cytoscape-bubblesets';

const cy = cytoscape({
  container: document.getElementById('app'),
  elements: [
    { data: { id: 'a' } },
    { data: { id: 'b' } },
    {
      data: {
        id: 'ab',
        source: 'a',
        target: 'b',
      },
    },
  ],
});
cy.ready(() => {
  const bb = new BubbleSetsPlugin(cy);
  bb.addPath(cy.nodes(), cy.edges(), null);
});
```

## API

- `addPath(nodes: NodeCollection, edges?: EdgeCollection | null, avoidNodes?: NodeCollection | null, options?: IBubbleSetPathOptions): BubbleSetPath`

  creates a new `BubbleSetPath` instance. The `nodes` is a node collection that should be linked. `edges` an edge collection to include edges. `avoidNodes` is an optional node collection of nodes that should be avoided when generating the outline and any virtual edge between the nodes.

- `removePath(path: BubbleSetPath)`

  removes a path again

- `getPaths(): readonly BubbleSetPath[]`

  returns the list of active paths

## Development Environment

```sh
npm i -g yarn
yarn set version latest
cat .yarnrc_patch.yml >> .yarnrc.yml
yarn
yarn pnpify --sdk vscode
```

### Common commands

```sh
yarn compile
yarn test
yarn lint
yarn fix
yarn build
yarn docs
yarn release
yarn release:pre
```

[npm-image]: https://badge.fury.io/js/cytoscape-bubblesets.svg
[npm-url]: https://npmjs.org/package/cytoscape-bubblesets
[github-actions-image]: https://github.com/upsetjs/cytoscape.js-bubblesets/workflows/ci/badge.svg
[github-actions-url]: https://github.com/upsetjs/cytoscape.js-bubblesets/actions
[cytoscape-image]: https://img.shields.io/badge/Cytoscape-plugin-yellow
[cytoscape-url]: https://js.cytoscape.org/#extensions/ui-extensions
[codepen]: https://img.shields.io/badge/CodePen-open-blue?logo=codepen
