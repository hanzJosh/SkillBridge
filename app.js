const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');

const app = express();

//middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));
app.use(flash());

// Database
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'RP738964$',
    database: 'c237_skillbridge'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});

// Register
app.get('/register', (req, res) => {
    res.render('register', { message: req.flash('message') });
});

app.post('/register', async (req, res) => {
    const { username, email, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, role],
            (err) => {
                if (err) {
                    console.error('Registration error:', err);
                    req.flash('message', 'Registration failed: ' + err.message);
                    return res.redirect('/register');
                }
                req.flash('message', 'Registration successful, please log in');
                res.redirect('/login');
            }
        );
    } catch (error) {
        console.error('Hashing error:', error);
        req.flash('message', 'Registration failed: ' + error.message);
        res.redirect('/register');
    }
});

// Login
app.get('/login', (req, res) => {
    res.render('login', { message: req.flash('message') });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err || results.length === 0) {
            req.flash('message', 'Invalid credentials');
            return res.redirect('/login');
        }
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = { id: user.id, username: user.username, role: user.role };
            res.redirect('/');
        } else {
            req.flash('message', 'Invalid credentials');
            res.redirect('/login');
        }
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


// Auth middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) { return next(); }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).send('Access denied');
}

// Routes //
//testing

// Home route 
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Register
app.get('/register', (req, res) => {
    res.render('register', { message: req.flash('message') });
});

// Login
app.get('/login', (req, res) => {
    res.render('login', { message: req.flash('message') });
});



// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SkillBridge running on http://localhost:' + PORT));
