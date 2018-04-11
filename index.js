require('dotenv').config()
const express = require('express');
require('express-async-errors');
const bodyParser = require('body-parser');
const app = express();

const processAction = require('./src/action-processor');

const port = process.env.PORT || 8080;

// parse all request bodies into JSON
app.use(bodyParser.json());

// log all errors
app.use(function (err, req, res, next) {
  console.error(err);
  return res.status(500).send(`Internal server error: ${err.message}`);
});

// uptime endpoint
app.get('/', function(req, res) {
  return res.status(200).send(`This server has been up for ${process.uptime()} seconds!`);
});

// Dialogflow/API.AI endpoint
app.post('/chat', async function(req, res) {
  let results = await processAction(req.body);
  return res.status(200).json(results);
});

app.listen(port, () => console.log(`Started listening on port ${port}`));