var express = require('express'),
    app = express.createServer();

app.configure(function(){
    app.use(express.methodOverride());
    app.use(express.bodyParser());
    app.use(app.router);
});

app.configure('development', function(){
    var oneDay = 86400000;
    app.use('/js', express.static(__dirname + '/js/', { maxAge: oneDay, redirect: '/css'}));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    var oneYear = 31557600000;
    app.use(express.static(__dirname + '/public', { maxAge: oneYear }));
    app.use(express.errorHandler());
});

app.get('/', function(req, res){
    res.send('hello world');
});

app.listen(3000);