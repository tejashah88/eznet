"use strict";

// native modules
const fs = require("fs");
const path = require("path");

// local modules
const { parseBool } = require("../helpers/utils");
const logger = require("../helpers/logger");

// remote modules
const BrainJSClassifier = require("natural-brain");

function loadClassifier(file) {
  if (fs.existsSync(file)) {
    let data = JSON.parse(fs.readFileSync(file));
    return BrainJSClassifier.restore(data);
  } else
    throw new Error(`Could not load NN classifier from file ${file}`);
}

function saveClassifier(file, classifier) {
  fs.writeFileSync(path.resolve(file), JSON.stringify(classifier));
}

module.exports = class NeuralNetworkCancelDetector {
  constructor({ trainingSet, modelFile }) {
    if (trainingSet && trainingSet.length === 2) {
      this.classifier = new BrainJSClassifier({
        callback: ({ iterations, error }) => {
          logger.info(`Training iteration ${iterations} with error at ${(error * 100).toFixed(2)}%`);
        },
        callbackPeriod: 1
      });

      let [positiveTrainingSet, negativeTrainingSet] = trainingSet;

      // train classifier
      positiveTrainingSet.forEach(ex => this.classifier.addDocument(ex, true));
      negativeTrainingSet.forEach(ex => this.classifier.addDocument(ex, false));
      this.classifier.train();
    } else if (modelFile)
      this.classifier = loadClassifier(modelFile);
    else
      throw new Error("Must provide a training dataset or a model file!");
  }

  save2ModelFile(file) {
    if (this.classifier) {
      saveClassifier(file, this.classifier);
      return this;
    } else
      throw new Error("The classifier has not been defined yet. Have you loaded it from a dataset?");
  }

  wants2Cancel(input) {
    let prediction = this.classifier.classify(input);
    return parseBool(prediction);
  }
};