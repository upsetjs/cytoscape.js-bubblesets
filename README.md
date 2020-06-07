# Cytoscape.js BubbleSets Plugin

[![NPM Package][npm-image]][npm-url] [![Github Actions][github-actions-image]][github-actions-url]

A [Cytoscape.js](https://js.cytoscape.org) plugin for rendering [Bubblesets](https://github.com/sgratzl/bubblesets-js).

![Euler Example](https://user-images.githubusercontent.com/4129778/83965199-249aef00-a8b2-11ea-866e-4b0207c7b446.png)

## Install

```sh
npm install cytoscape cytoscape-bubblesets
```

## Usage

see [Samples](https://github.com/sgratzl/cytoscape-bubblesets/tree/master/samples) on Github

or at this [![Open in CodePen][codepen]](https://codepen.io/sgratzl/pen/TODO)

```js
import cytoscape from 'cytoscape';
import BubbleSets from 'cytoscape-bubblesets';

cytoscape.use(BubbleSets);

```

## Development Environment

```sh
npm i -g yarn
yarn set version 2
cat .yarnrc_patch.yml >> .yarnrc.yml
yarn
yarn pnpify --sdk
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
[npm-url]: https://npmjs.org/package/sgratzl/cytoscape-bubblesets
[github-actions-image]: https://github.com/sgratzl/cytoscape.js-bubblesets/workflows/ci/badge.svg
[github-actions-url]: https://github.com/sgratzl/cytoscape.js-bubblesets/actions
[codepen]: https://img.shields.io/badge/CodePen-open-blue?logo=codepen
