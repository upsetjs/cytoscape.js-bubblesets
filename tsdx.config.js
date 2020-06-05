const commonjs = require('@rollup/plugin-commonjs');
const resolve = require('rollup-plugin-pnp-resolve');
const cleanup = require('rollup-plugin-cleanup');

module.exports = {
  rollup(config, options) {
    // if (options.format === 'umd') {
    //   config.input = './src/index.ts';
    // }

    config.output.globals['cytoscape'] = 'cytoscape';
    // const base = config.external;

    const c = config.plugins.findIndex((d) => d.name === 'commonjs');
    if (c !== -1) {
      config.plugins.splice(c, 1);
    }
    config.plugins.splice(0, 0, resolve(), commonjs());
    config.plugins.push(
      cleanup({
        comments: ['some', 'ts', 'ts3s'],
        extensions: ['ts', 'tsx', 'js', 'jsx'],
      })
    );
    config.output.banner = `/**
 * cytoscape.js-bubblesets
 * https://github.com/sgratzl/cytoscape.js-bubblesets
 *
 * Copyright (c) 2020 Samuel Gratzl <sam@sgratzl.com>
 */`;
    return config;
  },
};
