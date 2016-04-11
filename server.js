var cli = require('cli'),
    express = require('express'),
    simplesmtp = require('simplesmtp'),
    MailParser = require("mailparser").MailParser,
    smtp = simplesmtp.createServer({disableDNSValidation: true}),
    config = {
        smtpPort:   process.env.SMTP_PORT || 1025,
        httpPort:  process.env.HTTP_PORT ||1080,
        max:  process.env.MAX_QUEUE_LENGTH || 100,
        delivered:  process.env.WEIGHT_DELIVERY || 90,
        'soft bounce': process.env.WEIGHT_SOFT_BOUNCE || 5,
        'hard bounce': process.env.WEIGHT_HARD_BOUNCE || 1,
        throttle: process.env.WEIGHT_THROTTLE || 4,
        delay: process.env.WEIGHT_DELAY || 10
    };

var messages = [];
var codes = {};

var codesWeights = {
    'delivered': config['delivered'],
    'soft bounce': config['soft bounce'],
    'hard bounce': config['hard bounce'],
    'throttle': config['throttle']
};

console.log(codesWeights);

function weightedRand(weights){
    var i;
    var sum_weights = 0;
    for(i in weights)
        sum_weights += weights[i];

    var rand = Math.round(Math.random()*sum_weights);

    for(i in weights)
    {
        rand -= weights[i];
        if(rand <= 0)
            return i;
    }
}

smtp.listen(config.smtpPort);

smtp.on("validateSender", function(connection, email, callback){
    connection.code = weightedRand(codesWeights);
    codes[connection.code] = (codes[connection.code]) ? codes[connection.code]+1 : 1;
    
    if(connection.code == 'hard bounce')
        setTimeout(function(){ callback(true);  }, config.delay);
    else if(connection.code == 'throttle')
    {
        setTimeout(function(){
            callback({SMTPResponse: "421 4.7.0 [TS01] Messages from [YOUR_IP] temporarily deferred due to user complaints - 4.16.55.1; see http://postmaster.yahoo.com/421-ts01.html"})
        }, config.delay);
    }
    else
        callback();
    
});

smtp.on("validateRecipient", function(connection, email, callback){
    if(connection.code == 'soft bounce')
        callback({SMTPResponse: "421 4.4.2 I decided to soft bounce your message because I can!"});
    else
        callback();
});

smtp.on("startData", function(connection){
    connection.parser = new MailParser({
        unescapeSMTP: true
    });
});

smtp.on("data", function(connection, chunk){
    connection.parser.write(chunk);
});

smtp.on('dataReady', function(connection, callback){
    connection.parser.on('end', function(mail){
        connection.data = mail;
        delete connection.parser;
        messages.push(JSON.parse(JSON.stringify(connection)));
        setTimeout(function(){ callback(); }, config.delay);
        
    });  
    
    connection.parser.end();
});

var app = express();
app.use (function(req, res, next) {
    var data='';
    req.setEncoding('utf8');
    req.on('data', function(chunk) { 
        data += chunk;
    });

    req.on('end', function() {
        req.body = data;
        next();
    });
});
    
app.get('/reset', function(req, res){
    messages = [];
    res.json({
        result: true
    });
});

app.get('/messages', function(req, res){
    res.json({
        result: true, 
        messages: messages
    });
});

app.get('/dupes', function(req, res){
    var messageIds = {},
        dupes = [];
    
    for(i in messages)
    {
        messageId = messages[i].data.headers.messageid;
        if(messageId)
            messageIds[messageId] = (messageIds[messageId]) ? messageIds[messageId]+1 : 1;
    }
    
    for(i in messageIds)
    {
        if(messageIds[i] > 1)
            dupes.push({
                messageid: i, 
                count: messageIds[i]
                });
    }
    
    res.json({
        result: true, 
        dupes: dupes
    });
    
});

app.get('/stats', function(req, res){
    res.json({
        result: true, 
        count: messages.length
        });
});

app.get('/reset', function(req, res){
    messages = [];
    codes = {};
    res.json({
        result: true
    });
});

app.get('/codes', function(req, res){
    res.json({
        result: true, 
        senders: codes
    });
});

app.get('/senders', function(req, res){
    var senders = {},
        senderHosts = {},
        senderAddresses = {};
    
    for(i in messages)
    {
        var from = messages[i].from,
        hostName = messages[i].host,
        hostAddress = messages[i].remoteAddress;
            
        senders[from] = (senders[from]) ? senders[from]+1 : 1;
        senderHosts[hostName] = (senderHosts[hostName]) ? senderHosts[hostName]+1 : 1;
        senderAddresses[hostAddress] = (senderAddresses[hostAddress]) ? senderAddresses[hostAddress]+1 : 1;
        
    }
    
    res.json({
        result: true, 
        senders: senders, 
        senderHosts: senderHosts, 
        senderAddresses: senderAddresses
    });
    
});

app.listen(config.httpPort);