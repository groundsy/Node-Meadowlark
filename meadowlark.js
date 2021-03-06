/**
 * Created by groundsy on 10/3/14.
 */

/* imports ****************************************************************************************/
var http = require('http');
var express = require('express');
var fortune = require('./lib/fortune.js');
var credentials = require('./lib/credentials.js');
var formidable = require('formidable');
var jqupload = require('jquery-file-upload-middleware');
var emailService = require('./lib/email.js')(credentials);
var fs = require('fs');
var mongoose = require('mongoose');
/**************************************************************************************************/

var app = express();
app.disable('x-powered-by');

/* set up the handlebars view engine **************************************************************/

var handlebars = require('express3-handlebars').create({
    defaultLayout:'main',
    helpers: {
        section: function(name, options) {
            if (!this._sections) {
                this._sections = {};
            }
            this._sections[name] = options.fn(this);
            return null;
        }
    }
});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
/**************************************************************************************************/

var options = {
    server: {
        socketOptions: { keepAlive: 1 }
    }
};
switch(app.get('env')){
    case 'development':
        mongoose.connect(credentials.mongo.development.connectionString, options);
        break;
    case 'production':
        mongoose.connect(credentials.mongo.production.connectionString, options);
        break;
    default:
        throw new Error('Unknown execution environment: ' + app.get('env'));
}

app.set('port', process.env.PORT || 3000);

// use domains for better error handling
app.use(function(req, res, next) {
    // create a domain for this request
    var domain = require('domain').create();
    // handle errors on this domain
    domain.on('error', function(err) {
        console.error('DOMAIN ERROR CAUGHT\n', err.stack);
        try {
            // failsafe shutdown in 5 seconds
            setTimeout(function() {
                console.error('Failsafe shutdown.');
                process.exit(1);
            }, 5000);

            // disconnect from the cluster
            var worker = require('cluster').worker;
            if (worker) {
                worker.disconnect();
            }

            // stop taking new taking new requests.
            server.close();

            try {
                //attempt to use Express error route
                next(err);
            } catch (error) {
                // if Express route failed, try plain Node response
                console.error('Express error mechanism failed.\n', err.stack);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
                res.end('Server error');
            }
        } catch (error) {
            console.error('Unable to send 500 response.\n', err.stack);
        }
    });
    // add the request and response objects to the domain.
    domain.add(req);
    domain.add(res);

    // execute the rest of the request chain in the domain.
    domain.run(next);
});

// logging information
switch(app.get('env')) {
    case 'development':
        // compact logging
        app.use(require('morgan')('dev'));
        break;
    case 'production':
        // module 'express-logger' supports daily rotation
        app.use(require('express-logger')({
            path: __dirname + '/log/requests.log'
        }));
        break;
}
// log cluster worker request info.
app.use(function(req, res, next) {
    var cluster = require('cluster');
    if (cluster.isWorker) {
        console.log('Worker %d received request', cluster.worker.id);
    }
    next();
});
/* add static, cookies, session middleware ********************************************************/

app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')());
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser')());
/**************************************************************************************************/

/* middleware for middle for flash object *********************************************************/

app.use(function(req, res, next) {
    // if there's a flash message, transfer it to the context, then clear it
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

/**************************************************************************************************/

/* middleware for test detection ******************************************************************/

app.use(function(req, res, next) {
    res.locals.showTests = app.get('env') !== 'production' &&
        req.query.test === '1';
    next();
});

/**************************************************************************************************/

/* mocked weather data ****************************************************************************/
function getWeatherData(){
    return {
        locations: [
            {
                name: 'Portland',
                forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Overcast',
                temp: '54.1 F (12.3 C)'
            },
            {
                name: 'Bend',
                forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Partly Cloudy',
                temp: '55.0 F (12.8 C)'
            },
            {
                name: 'Manzanita',
                forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Light Rain',
                temp: '55.0 F (12.8 C)'
            }
        ]
    };
}
/**************************************************************************************************/

/* middleware to add weather data to context*******************************************************/
app.use(function(req, res, next) {
    if (!res.locals.partials) {
        res.locals.partials = {};
    }
    res.locals.partials.weather = getWeatherData();
    next();
});

/**************************************************************************************************/

/* middleware for jquery-file-upload **************************************************************/
app.use('/upload', function(req, res, next) {
    var now = Date.now();
    jqupload.fileHandler({
        uploadDir: function() {
            return __dirname + '/public/uploads/' + now;
        },
        uploadUrl: function() {
            return '/uploads/' + now;
        }
    })(req, res, next);
});

/**************************************************************************************************/

/* routes *****************************************************************************************/
app.get('/', function(req, res) {
   res.render('home');
});

app.get('/about', function(req, res) {
    res.render('about', {
        fortune: fortune.getFortune(),
        pageTestScript: '/qa/tests-about.js'
    });
});

app.get('/tours/request-group-rate', function(req, res) {
    res.render('tours/request-group-rate');
});

app.get('/jquery-test', function(req, res) {
    res.render('jquery-test');
});

app.get('/nursery-rhyme', function(req, res) {
    res.render('nursery-rhyme');
});

app.get('/data/nursery-rhyme', function(req, res) {
    res.json({
        animal: 'squirrel',
        bodyPart: 'tail',
        adjective: 'bushy',
        noun: 'heck'
    });
});

app.get('/thank-you', function(req, res) {
    res.render('thank-you');
});

app.get('/newsletter', function(req, res) {
    res.render('newsletter');
});

// for now, mock newsletter signup:
function NewsletterSignup() {

}

NewsletterSignup.prototype.save = function(cb) {
    cb();
};

// mock product database
function Product() {

}

Product.find = function(conditions, fields, options, cb) {
    if (typeof conditions === 'function') {
        cb = conditions;
        conditions = {};
        fields = null;
        options = {};
    } else if (typeof fields === 'function') {
        cb = fields;
        fields = null;
        options = {};
    } else if (typeof options === 'function') {
        cb = options;
        options = {};
    }
    var products = [
        {
            name: 'Hood River Tour',
            slug: 'hood-river',
            category: 'tour',
            maximumGuests: 15,
            sku: 723
        },
        {
            name: 'Oregon Coast Tour',
            slug: 'oregon-coast',
            category: 'tour',
            maximumGuests: 10,
            sku: 446
        },
        {
            name: 'Rock Climbing in Bend',
            slug: 'rock-climbing/bend',
            category: 'adventure',
            requiresWaiver: true,
            maximumGuests: 4,
            sku: 944
        }
    ];
    cb(null, products.filter(function(p) {
        if (conditions.category && p.category !== conditions.category) {
            return false;
        }
        if (conditions.slug && p.slug !== conditions.slug) {
            return false;
        }
        if (isFinite(conditions.sku) && p.sku !== Number(conditions.sku)) {
            return false;
        }
        return true;
    }));
};

Product.findOne = function(conditions, fields, options, cb) {
    if (typeof conditions === 'function') {
        cb = conditions;
        conditions = {};
        fields = null;
        options = {};
    } else if (typeof fields === 'function') {
        cb = fields;
        fields = null;
        options = {};
    }else if (typeof options === 'function') {
        cb = options;
        options = {};
    }
    Product.find(conditions, fields, options, function(err, products) {
        cb(err, products && products.length ? products[0] : null);
    });
};

var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

app.post('/newsletter', function (req, res) {
    var name = req.body.name || '';
    var email = req.body.email || '';
    // input validation
    if (!email.match(VALID_EMAIL_REGEX)) {
        if (req.xhr) {
            return res.json({ error: 'Invalid name email address.' });
        }
        req.session.flash = {
            type: 'danger',
            intro: 'Validation error!',
            message: 'The email address you entered was not valid.'
        };
        return res.redirect(303, '/newsletter/archive');
    }
    new NewsletterSignup({ name: name, email: email }).save(function(err) {
        if (err) {
            if (req.xhr) {
                return res.json({ error: 'Database error.' });
            }
            req.session.flash = {
                type: 'danger',
                intro: 'Database error',
                message: 'There was a database error. Please try again later.'
            };
            return res.redirect(303, '/newsletter/archive');
        }
        if (req.xhr) {
            return res.json({ success: true });
        }
        req.session.flash = {
            type: 'success',
            intro: 'Thank you!',
            message: 'You have now been signed up for the newsletter.'
        };
        return res.redirect(303, '/newsletter/archive');
    });
});

app.get('/newsletter/archive', function(req, res) {
    res.render('newsletter/archive');
});

app.get('/contest/vacation-photo', function(req, res) {
    var now = new Date();
    res.render('contest/vacation-photo', {
        year: now.getFullYear(),
        month: now.getMonth()
    });
});

function saveContestEntry(contestName, email, year, month, photoPath) {
    // TODO:... this will come later
}

// make sure data directory exiss.
var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
fs.existsSync(dataDir) || fs.mkdirSync(dataDir);
fs.existsSync(vacationPhotoDir) || fs.mkdirSync(vacationPhotoDir);

app.post('/contest/vacation-photo/:year/:month', function (req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if (err) {
            return res.redirect(303, '/error');
        }
       if (err) {
           res.session.flash = {
               type: 'danger',
               intro: 'Oops!',
               message: 'There was an error processing your submission. Please try again.'
           };
        return res.redirect(303, '/contest/vacation-photo');
       }
        var photo = files.photo;
        var dir = vacationPhotoDir + '/' + Date.now();
        var path = dir + '/' + photo.name;
        fs.mkdirSync(dir);
        fs.renameSync(photo.path, dir + '/' + photo.name);
        saveContestEntry('vacation-photo', fields.email, req.params.year, req.params.month, path);
        req.session.flash = {
            type: 'success',
            intro: 'Good luck',
            message: 'You have been entered into the contest.'
        };
        return res.redirect(303, '/contest/vacation-photo/entries');
    });
});

app.get('/contest/vacation-photo/entries', function(req, res) {
    res.render('contest/vacation-photo/entries');
});

app.get('/tours/:tour', function(req, res, next){
    Product.findOne({ category: 'tour', slug: req.params.tour }, function(err, tour){
        if(err) {
            return next(err);
        }
        if(!tour) {
            return next();
        }
        res.render('tour', { tour: tour });
    });
});
app.get('/adventures/:subcat/:name', function(req, res, next){
    Product.findOne({ category: 'adventure', slug: req.params.subcat + '/' + req.params.name  }, function(err, adventure){
        if(err) {
            return next(err);
        }
        if(!adventure){
            return next();
        }
        res.render('adventure', { adventure: adventure });
    });
});

var cartValidation = require('./lib/cartValidation.js');

app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);

app.post('/cart/add', function(req, res, next){
    var cart = req.session.cart || (req.session.cart = []);
    Product.findOne({ sku: req.body.sku }, function(err, product){
        if(err){
            return next(err);
        }
        if(!product) {
            return next(new Error('Unknown product SKU: ' + req.body.sku));
        }
        cart.push({
            product: product,
            guests: req.body.guests || 0
        });
        res.redirect(303, '/cart');
    });
});

app.get('/cart', function(req, res, next){
    var cart = req.session.cart;
    if (!cart) {
        next();
    }
    res.render('cart', { cart: cart });
});

app.get('/cart/checkout', function(req, res, next) {
    var cart = req.session.cart;
    if (!cart) {
        next();
    }
    res.render('cart-checkout');
});

app.get('/cart/thank-you', function(req, res) {
    res.render('cart-thank-you', {cart: req.session.cart });
});

app.get('/email/cart/thank-you', function(req, res) {
    res.render('email/cart-thank-you', { cart: req.session.cart, layout: null });
});

app.post('/cart/checkout', function(req, res) {
    var cart = req.session.cart;
    if (!cart) {
        next(new Error('Cart does not exist.'));
    }
    var name = req.body.name || '';
    var email = req.body.email || '';
    // input validation
    if (!email.match(VALID_EMAIL_REGEX)) {
        return res.next(new Error('Invalid email address.'));
    }
    // assign a random cart ID;
    cart.number = Math.random().toString().replace(/^0\.0*/, '');
    cart.billing = {
        name: name,
        email: email
    };
    res.render('email/cart-thank-you', { layout: null, cart: cart }, function(err, html) {
        if (err) {
            console.log('error in email template');
        }
        emailService.send(cart.billing.email, 'Thank you for booking your trip with Meadowlark Travel!', html);
    });
    res.render('cart-thank-you', {cart: cart });
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
/**************************************************************************************************/
var server;

function startServer() {
   server = http.createServer(app).listen(app.get('port'), function() {
        console.log('Express started in ' + app.get('env') +
            ' mode on http://localhost' + app.get('port') +
            '; press Ctrl-C to terminate.');
    });
}


if (require.main === module) {
    // application ru directly; start app server
    startServer();
} else {
    // application imported as a module via "require": export function to create server
    module.exports = startServer;
}