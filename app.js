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




// Auth middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) { return next(); }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).send('Access denied');
}

function isInstructor(req, res, next) {
    if (req.session.user && req.session.user.role === 'instructor') return next();
    res.status(403).send('Instructor access only');
}

// Routes //

// Home route 
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
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
            req.session.user = { id: user.user_id, username: user.username, role: user.role };
            res.redirect('/dashboard');
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

app.get('/dashboard', isAuthenticated, (req, res) => {
    const sql = `
        SELECT s.*, u.username AS instructor_username
        FROM skills s
        LEFT JOIN users u ON s.instructor_id = u.user_id
        ORDER BY s.created_at DESC
    `;
    db.query(sql, (err, skills) => {
        if (err) throw err;
        res.render('dashboard', { user: req.session.user, skills });
    });
});

app.post('/dashboard', isAuthenticated, (req, res) => {
    const { username, email } = req.body;
    const sql = 'UPDATE users SET username = ?, email = ? WHERE user_id = ?';
    db.query(sql, [username, email, req.session.user.id], (err) => {
        if (err) throw err;
        req.session.user.username = username;
        req.session.user.email = email;
        res.redirect('/dashboard');
    });
});

// View my own listings
app.get('/skills', isAuthenticated, isInstructor, (req, res) => {
    const sql = 'SELECT * FROM skills WHERE instructor_id = ? ORDER BY created_at DESC';

    db.query(sql, [req.session.user.id], (err, skills) => {
        if (err) throw err;
        res.render('skills', { user: req.session.user, skills });
    });
});

// Show create-listing form
app.get('/skills/add', isAuthenticated, isInstructor, (req, res) => {
    res.render('addSkill', { user: req.session.user });
});

// Create a listing
app.post('/skills/add', isAuthenticated, isInstructor, (req, res) => {
    const { title, description, category, level, duration, mode } = req.body;

    const sql = `
        INSERT INTO skills
        (instructor_id, title, description, category, level, duration, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [req.session.user.id, title, description, category, level, duration, mode],
        (err) => {
            if (err) throw err;
            res.redirect('/skills');
        }
    );
});

// Show edit form — only for the listing owner
app.get('/skills/:id/edit', isAuthenticated, isInstructor, (req, res) => {
    const sql = 'SELECT * FROM skills WHERE skill_id = ? AND instructor_id = ?';

    db.query(sql, [req.params.id, req.session.user.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Listing not found');

        res.render('editSkill', { user: req.session.user, skill: results[0] });
    });
});

// Save an edited listing — only for the listing owner
app.post('/skills/:id/edit', isAuthenticated, isInstructor, (req, res) => {
    const { title, description, category, level, duration, mode } = req.body;

    const sql = `
        UPDATE skills
        SET title = ?, description = ?, category = ?, level = ?,
             duration = ?, mode = ?
        WHERE skill_id = ? AND instructor_id = ?
    `;

    db.query(
        sql,
        [title, description, category, level, price, duration, mode,
        req.params.id, req.session.user.id],
        (err) => {
            if (err) throw err;
            res.redirect('/skills');
        }
    );
});

// Delete a listing — only for the listing owner
app.post('/skills/:id/delete', isAuthenticated, isInstructor, (req, res) => {
    const sql = 'DELETE FROM skills WHERE skill_id = ? AND instructor_id = ?';

    db.query(sql, [req.params.id, req.session.user.id], (err) => {
        if (err) throw err;
        res.redirect('/skills');
    });
});


// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SkillBridge running on http://localhost:' + PORT));
