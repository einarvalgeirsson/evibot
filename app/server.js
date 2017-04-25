var fs = require('fs');
var https = require('https');

var express = require('express');
var app = express();
var jwt = require("express-jwt");
var rsaValidation = require('auth0-api-jwt-rsa-validation');
var bodyParser = require('body-parser')

var PORT = process.env.PORT || 8000;
var HOST = process.env.HOST || '';

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.post('/', function(req, res) {

  console.log("request: " + JSON.stringify(req.body));

  var c = req.body.challenge
  res.json({challenge: c})
})

app.get("/", function(req, res) {
  res.send("hello!")
})

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}

console.log("options: " + options);


console.log(https.createServer(options, app).listen(PORT, HOST, null));
