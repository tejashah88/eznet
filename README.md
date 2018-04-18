# eznet
A cross-platform chatbot interface for retrieving Meraki network data and analysis with natural language! Available now on Google Assistant, Facebook Messenger, Slack, and Cisco Webex (formally Cisco Spark).

##### This was originally built at CalHacks 4.0 under the name "ezsec".
* [Original Github Repo](https://github.com/Dhanush123/ezsec)
* [Devpost Submission](https://devpost.com/software/ezsec)

## Try it out
You can add it to your space with this url: `eznet@sparkbot.io`.

### Notice
Cisco Spark has been recently rebranded to Cisco Webex. While This document will refer to the platform as "Webex", other services may still refer to it as "Spark".

## Deploy it yourself

2. [Create a new bot account](https://developer.webex.com/add-bot.html) on Cisco Webex.
3. Start up the bot either locally, via Heroku or Docker. See the instructions below for more details.
4. [Create a new agent](https://console.dialogflow.com/api-client/#/newAgent) on Dialogflow. Note that this will create a Google project as a result.
5. Once you've created it, you can import the agent by zipping the `dialogflow-assets` folder and importing the zip file.
6. [Follow this guide](https://dialogflow.com/docs/integrations/spark) for setting up Webex integration to Dialogflow.
7. Update the fulfillment webhook URL depending on how you're going to deploy the bot.
6. Add your bot to your space. You can start off by asking it for help.
7. You can also add other supported one-click integrations to Google Assistant, Facebook Messenger, and Slack.*

\* There are some known discrepancies between the interaction of Dialogflow to Webex and other messaging platforms. See the [known limitations/issues](#known-limitationsissues) for more details.

### Deploying Locally
You can run it locally, and still expose it to the internet for Dialogflow to use, via ngrok.

```bash
git clone https://github.com/tejashah88/eznet.git
cd eznet
```

Rename the `.env-sample` file to `.env` and add the Meraki dashboard and Cisco Webex bot token.
Then start the server by running `npm start`.

On another terminal, run `ngrok http 8080`. Copy the HTTPS version of the generated url, since you'll need it when specifying the fulfillment webhook URL. In this case, it should be `https://<random-id>.ngrok.io`.

### Deploying via Heroku
Simply click the button, fill the required tokens and you're done! The fulfillment webhook URL should be `https://<app-name>.herokuapp.com/chat`, where `<app-name>` is what you named the Heroku app.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/tejashah88/eznet)

### Deploying via Docker
```bash
docker build -t tejashah88/eznet .
docker run -p 8080:8080 -it --env-file .env tejashah88/eznet
```

The fulfillment webhook URL should be `https://<some-base-url>/chat`.

## Known Limitations/Issues
* Dialogflow does not fully support Cisco Webex, which results in using an external library to send formatted messages and images. This might lead to inconsistencies between the Webex bot and the other bots.
* Dialogflow has a maximum timeout trigger of 5 seconds, which is enforced on all platforms except Webex. This means that certain commands may timeout on facebook messenger but not on Webex.
* Due to Facebook having a limit on how much text is sent per message, and Dialogflow not able to send images and formatted text at the same time, charts will not appear on the Facebook bot.
* Networks from different organizations with the same name are not differentiable.
* Although the ability to block websites was in the original version, it's disabled by default since it tries to resolve the website to an ip address and block it under the layer 3 spec. Once an API for layer 7 controlling is released, it'll be enabled again.

## Authors
* Tejas Shah
* Dhanush Patel
* Jesse Gao
