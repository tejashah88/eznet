# eznet
A cross-platform chatbot for retrieving Meraki network data and analysis with natural language!

##### This was originally built at CalHacks 4.0 under the name "ezsec":
* [Original Github Repo](https://github.com/Dhanush123/ezsec)
* [Devpost Submission](https://devpost.com/software/ezsec)

## Try it out
You can add it to your space with this url: `eznet@webex.bot`.

## Featues
* Uses dialogflow for handling most of the NLP and integrations with multiple chatbot platforms
* 6 actions implemented for query basic information from the Meraki Dashboard API. You can:
  * list the orgs that you are a part of
  * list the networks in an org
  * list the admins in an org
  * list the devices in a network
  * show the data usage of a network over a given time period (includes pretty charts)
  * show the top traffic usage of a network over a given time period (includes pretty charts)
* Context allows the bot to remember an aformentioned org or network (You can say "list the networks in my org" and it can recall the aforementioned org)
* Available now on 4 platforms: Google Assistant, Facebook Messenger, Slack, and Cisco Webex (formally Cisco Spark).
* Uses Redis as a real-time cache for the Meraki Dashboard data
* Ready to deploy locally, on Heroku, or as a Docker container
* When prompting for an org or network, you can type a partial name, and eznet can attempt to resolve to the full name, thanks to fuzzy searching
* Most chat bots with entities that can accept any input (in this case, for prompting an org/network name) will fail to acknowledge whe the user wants to cancel the slot-filling process and literally take 'cancel' as a valid input! This bot is able to distinguish this and allow the user to **really** cancel anytime in the slot-filling process.

## Deploy it yourself
See [here](TUTORIAL.md) for a step-by-step tutorial on deploying your own version of this bot!

## TODO
* Testing: Mocha, CI (Travis), Code Coverage (coveralls.io)
* Inline comments to explain some of the complex parts
* A doc for those who want to further expand the capabilities of this bot

## Known Limitations/Issues
* Although the ability to block websites was in the original version of the bot, it's disabled by default since it tries to resolve the website to an IP address and block it under the layer 3 spec, which is mostly unreliable.
* The original version of this bot had the ability to send back notifications from the SNMP hook provided by Meraki. This bot won't have it due to the tricky nature of sending arbitrary notifications back to the user during a conversation.

## Authors
* [Tejas Shah](https://github.com/tejashah88)
* [Dhanush Patel](https://github.com/Dhanush123)
* [Jesse Gao](https://github.com/Jessegao)