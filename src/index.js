const interval = require('interval-promise');
const firebase = require('firebase');
const express = require('express');
const aa = require('express-async-await');
const bodyParser = require('body-parser');
const app = aa(express());

const processAction = require('./action-processor');
const populateData = require('./data-populator');

const port = process.env.PORT || 8080;

let fbApp = firebase.initializeApp({
  projectId: process.env.GOOGLE_PROJECT_ID,
  databaseURL: process.env.FIREBASE_URL,
  apiKey: process.env.FIREBASE_API_KEY
});

// populate/update the meraki cache every 30 seconds
interval(async () => await populateData(fbApp), 30 * 1000);

// parse all request bodies into JSON
app.use(bodyParser.json());

// log all requests
app.use(function (req, res, next) {
  console.log(`${req.method} called at starting epoch ${Date.now()}`);
  next();
});

// log all errors
app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).send(`Internal server error: ${err.message}`);
});

// uptime endpoint
app.get('/', function(req, res) {
  return res.status(200).send(`This server has been up for ${process.uptime()} seconds!`);
})

// Dialogflow/API.AI endpoint
app.post('/chat', async function(req, res) {
  let results = await processAction(req.body, fbApp);
  res.status(200).json(results);
})

app.listen(port, () => console.log(`Started listening on port ${port}`));