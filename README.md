# eznet
A cross-platform chatbot interface for retrieving Meraki network data and analysis with natural language! Available now on Google Assistant, Facebook Messenger, Slack, and Cisco Spark.

# Known Limitations
* Dialogflow does not fully support Cisco Spark, which results in using an external library to send formatted messages and images. This might lead to inconsistencies between the Spark bot and the other bots
* Due to Facebook having a limit on how much text is sent per message, and Dialogflow not able to send images and formatted text at the same time, charts will not appear on the Facebook bot.

# TODO (in the far future)
* Add more actions to retrieve more info (listing clients, group policies, etc.)
* Add more data visualization and administrative actions

# Authors
* Tejas Shah
* Dhanush Patel
* Jesse Gao