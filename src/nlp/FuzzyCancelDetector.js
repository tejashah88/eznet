"use strict";

const Fuse = require("fuse.js");

module.exports = class FuzzyCancelDetector {
  initFromDataset(positiveSet, negativeSet) {
    this.data = {
      positive: positiveSet,
      negative: negativeSet,
      combined: [].concat(...positiveSet, ...negativeSet)
    };

    // note to self: we don't use utils.fuseSearch since we are searching through
    // an array, not an object and phrases can be longer than 64 characters
    this.fuse = new Fuse(this.data.combined, {
      shouldSort: true,
      tokenize: true,
      includeScore: true,
      threshold: 0.4,
      distance: 100,
      maxPatternLength: 128,
      minMatchCharLength: 1,
      location: 0,
    });
  }

  wants2Cancel(input) {
    const finalResult = this.fuse.search(input)[0];
    const finalPhrase = finalResult ? this.data.combined[finalResult.item] : null;
    return !!finalPhrase && this.data.positive.includes(finalPhrase);
  }
};