"use strict";

// native modules
const path = require("path");
const fs = require("fs");

// local modules
const logger = require("../helpers/logger");
const NeuralNetworkCancelDetector = require("./NeuralNetworkCancelDetector");
const FuzzyCancelDetector = require("./FuzzyCancelDetector");

// remote modules
const AdmZip = require("adm-zip");

// constants
const DATA_SPLIT_RATIO = 0.8;
const CANCEL_DETECTION_TYPE = process.env.CANCEL_DETECTION_TYPE;
const DIALOGFLOW_PHRASES_FILE = "../../assets/dialogflow-assets.zip";
const NN_MODEL_FILE = "./assets/nn-model-file.json";
const CANCEL_PHRASES_FILE = "../../assets/positive-examples.json";

function getPhrases(filePath) {
  if (!fs.existsSync(filePath))
    throw new Error(`Unable to find the zip file to extract phrases! Given path: ${filePath}`);
  return new AdmZip(filePath)
    .getEntries()
    .filter(zipEntry => zipEntry.name.includes("usersays"))
    .map(zipEntry => JSON.parse(zipEntry.getData().toString("utf8")))
    .map(json => json.map(item => item.data))
    .reduce((acc, cur) => {
      acc.push(...cur);
      return acc;
    }, [])
    .map(data => data.reduce((acc, cur) => {
      acc += cur.text;
      return acc;
    }, ""))
    .filter((elem, i, arr) => i === arr.indexOf(elem));
}

// example phrases to use for cancel detection
const positiveExamples = require(CANCEL_PHRASES_FILE);
const negativeExamples = getPhrases(path.join(__dirname, DIALOGFLOW_PHRASES_FILE));

function randomSplitArray(arr, ratio) {
  const minRequired = Math.round(arr.length * ratio);
  const indicies = [];
  while (indicies.length < minRequired) {
    const rndIndex = Math.floor(Math.random() * arr.length);
    if (!indicies.includes(rndIndex))
      indicies.push(rndIndex);
  }

  return [arr.filter((elem, index) => indicies.includes(index)), arr.filter((elem, index) => !indicies.includes(index))];
}

function generateFuzzyCancelDetector() {
  return new FuzzyCancelDetector().initFromDataset(positiveExamples, negativeExamples);
}

function generateNeuralNetworkCancelDetector(tryLoadFromModelFile = true, getAllNegatives = false, splitRatio = DATA_SPLIT_RATIO) {
  let nncd;

  if (tryLoadFromModelFile) {
    try {
      nncd = new NeuralNetworkCancelDetector({ modelFile: NN_MODEL_FILE });
      logger.info("Successfully loaded NN from model file!");
      return nncd;
    } catch (error) {
      logger.error("Could not load NN from model file, creating from scratch...");
    }
  }

  if (getAllNegatives)
    nncd = new NeuralNetworkCancelDetector({ trainingSet: [positiveExamples, negativeExamples] });
  else {
    const negativeSet = randomSplitArray(negativeExamples, splitRatio)[0];
    nncd = new NeuralNetworkCancelDetector({ trainingSet: [positiveExamples, negativeSet] });
  }

  if (!fs.existsSync(NN_MODEL_FILE)) {
    logger.info(`Saving trained neural network to 'assets' folder as file ${NN_MODEL_FILE}`);
    nncd.save2ModelFile(NN_MODEL_FILE);
  }

  return nncd;
}

function generateCancelDetector() {
  switch (CANCEL_DETECTION_TYPE) {
    case "FUZZY":
      logger.info("Creating fuzzy search based cancel detector...");
      return generateFuzzyCancelDetector();
    case "NEURAL_NET":
      logger.info("Creating neural network based cancel detector...");
      return generateNeuralNetworkCancelDetector();
    default:
      throw new Error(`Invalid cancel detection type: ${CANCEL_DETECTION_TYPE}`);
  }
}

module.exports = generateCancelDetector;