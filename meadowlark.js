/**
 * Created by groundsy on 10/3/14.
 */
var express = require('express');

var app = express();

/* set up the handlebars view engine **************************************************************/

var handlebars = require('express3-handlebars').create({defaultLayout:'main'});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
/**************************************************************************************************/

/* add static middleware **************************************************************************/

app.use(express.static(__dirname + '/public'));
/**************************************************************************************************/

app.set('port', process.env.PORT || 3000);

app.get('/', function(req, res) {
   res.render('home');
});

app.get('/about', function(req, res) {
    res.render('about');
});

// 404 catch-all handler (middleware)
app.use(function(req, res) {
    res.status(404);
    res.send('404');
});

// 500 error handler (middleware)
app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500);
    res.send('500');
});

app.listen(app.get('port'), function() {
    console.log('Express started on http://localhost' +
        app.get('port') + '; press Ctrl-C to terminate.');
});

