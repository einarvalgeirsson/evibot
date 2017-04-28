
var express = require('express');
var app = express();
var jwt = require("express-jwt");
var rsaValidation = require('auth0-api-jwt-rsa-validation');
var bodyParser = require('body-parser')
var http = require('http')
var fs = require('fs')

const Botkit = require('botkit');
const apiai = require('apiai');
const Entities = require('html-entities').XmlEntities;
const decoder = new Entities();
const uuid = require('node-uuid');

var app = express();

const apiAiAccessToken = process.env.ACCESSTOKEN;
const slackBotKey = process.env.SLACKKEY;

var PORT = process.env.PORT || 8000;

console.log("PORT: " + PORT);


const sessionIds = new Map();

const botController = Botkit.slackbot({
    debug: false
    //include "log: false" to disable logging
});
console.log('slackBotKey', slackBotKey);
var bot = botController.spawn({
    token: slackBotKey
}).startRTM(function(err) {
  if (err) {
   console.log(err);
   throw new Error('Could not connect to Slack', err);
 }
});

const apiaiOptions = {};

//apiaiOptions.hostname = process.env.DEVELOPMENT_HOST;
apiaiOptions.path = "/api/query";

//console.log('hostname', apiaiOptions.hostname);

const apiAiService = apiai(apiAiAccessToken, apiaiOptions);

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

botController.hears(['.*'], ['direct_message', 'direct_mention', 'mention', 'ambient'], (bot, message) => {
    try {
        if (message.type == 'message') {
            if (message.user == bot.identity.id) {
                // message from bot can be skipped
            }
            else if (message.text.indexOf("<@U") == 0 && message.text.indexOf(bot.identity.id) == -1) {
                // skip other users direct mentions
            }
            else {

                let requestText = decoder.decode(message.text);
                requestText = requestText.replace("’", "'");

                let channel = message.channel;
                let messageType = message.event;
                let botId = '<@' + bot.identity.id + '>';
                let userId = message.user;

                console.log('requestText ', requestText);
                console.log('messageType', messageType);

                if (requestText.indexOf(botId) > -1) {
                    requestText = requestText.replace(botId, '');
                }

                if (!sessionIds.has(channel)) {
                    sessionIds.set(channel, uuid.v1());
                }

                console.log('Start request ', requestText);
                let apiAiRequest = apiAiService.textRequest(requestText,
                    {
                        sessionId: sessionIds.get(channel),
                        contexts: [
                            {
                                name: "generic",
                                parameters: {
                                    slack_user_id: userId,
                                    slack_channel: channel
                                }
                            }
                        ]
                    });

                apiAiRequest.on('response', (response) => {
                    console.log(response);

                    if (isDefined(response.result)) {
                        let responseText = response.result.fulfillment.speech;
                        let responseData = response.result.fulfillment.data;
                        let action = response.result.action;


                        if (isDefined(responseData)) {
                            try{
                                bot.reply(message, responseData.slack);
                            } catch (err) {
                                bot.reply(message, err.message);
                            }
                        } else if (isDefined(responseText)) {
                          console.log('action', action);
                          if (action === "listCompetences") {
                            // get people in competence area
                            const competence = response.result.parameters.competence.toLowerCase();
                            const members = getMembers(competence);
                            bot.reply(message, formatSlackMsg(responseText, members), (err, resp) => {
                                if (err) {
                                    console.error(err);
                                }
                            });
                          } else if (action === 'getPeopleInProject') {
                            const project = response.result.parameters.project.toLowerCase();
                            console.log('project', project);
                            const people = getPeopleInProject(project);
                            console.log('people ', people);

                            var event = {
                                      "name":"mapPersonToProject",
                                      "data":{
                                          "result": "kasper.hansen@jayway.com"
                                        }
                                      };


                            var options = {
                                        sessionId: sessionIds.get(channel)
                            };
                            sendEventToApiAi(event, options)
                            bot.reply(message, formatSlackMsg(responseText, people), (err, resp) => {
                                if (err) {
                                    console.error(err);
                                }
                            });
                          }
                          else if (action === 'getEndDate') {
                            const alloc = JSON.parse(fs.readFileSync('data/allocations.json', 'utf8'));
                            const project = response.result.parameters.project.toLowerCase();
                            const people = getPeopleInProject(project);

                            console.log('##people',people)

                            let date = "?";
                            for (var i = 0; i < alloc.length; i++) {
                              console.log('##loop',i)
                              if (alloc[i].project_id.toLowerCase() === project && alloc[i].person_id == name) {
                                date = alloc[i].end_date;
                                console.log('##match', date)
                              }
                            }

                            bot.reply(message, formatSlackMsg(responseText, date), (err, resp) => {
                                if (err) {
                                    console.error(err);
                                }
                            });
                          }
                        }
                    }
                });

                apiAiRequest.on('error', (error) => console.error(error));
                apiAiRequest.end();
            }
        }
    } catch (err) {
        console.error(err);
    }
});

function sendEventToApiAi(event, options) {
  let eventRequest = apiAiService.eventRequest(event, options);
  eventRequest.on('error', (error) => console.error(error));
  eventRequest.end();
}

function getMembers(competence) {
  const data = JSON.parse(fs.readFileSync('data/competences.json', 'utf8'));
  let emails = "";
  for (var i = 0; i < data.length; i++) {
   if (data[i].name.toLowerCase() === competence) {
     data[i].active_memberships.forEach(function(member) {
       emails += "- " + member.email + "\n";
      });
   }
  }
  return emails;
}

function getPeopleInProject(project) {
  const alloc = JSON.parse(fs.readFileSync('data/allocations.json', 'utf8'));
  console.log('allocations', alloc);
  let people = "";
  for (var i = 0; i < alloc.length; i++) {
    if (alloc[i].project_id.toLowerCase() === project) {
      console.log('found match', alloc[i].project_id.toLowerCase());
      people += "- " + alloc[i].person_id + "\n";
    }
  }
  return people;
}

// only difference no newline
function getSinglePersonInProject(project) {
  const alloc = JSON.parse(fs.readFileSync('data/allocations.json', 'utf8'));
  console.log('allocations', alloc);
  let people = "";
  for (var i = 0; i < alloc.length; i++) {
    if (alloc[i].project_id.toLowerCase() === project) {
      console.log('found match', alloc[i].project_id.toLowerCase());
      people += "- " + alloc[i].person_id;
    }
  }
  return people;
}


function formatSlackMsg(title, items) {
 return {
           attachments: [
               {
                          color: '#36a64f',
                    fields: [
                       {
                           title: title,
                           value: items
                       }
                          ]
               }
           ]
       }
}

//Create a server to prevent Heroku kills the bot
const server = http.createServer(function (request, response) {
      response.writeHead(200, {
         'Content-Type': 'text/plain'
      });
      response.write('Hi!')
      response.end();
});

//Lets start our server
server.listen((process.env.port || 8000, () => console.log("Server listening")));
