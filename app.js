const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// ---------- Database ----------
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'skillbridge'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});

// ---------- App setup ----------
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: 'skillbridge-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));
app.use(flash());

// Make user + flash messages available in every view
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.messages = req.flash('success');
    res.locals.errors = req.flash('error');
    next();
});

// ---------- Middleware ----------
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this page.');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied.');
    res.redirect('/dashboard');
};

// ---------- Routes ----------

// Home
app.get('/', (req, res) => {
    res.render('index');
});

// Register
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/register');
    }
    const sql = 'INSERT INTO users (username, email, password, role) VALUES (?, ?, SHA1(?), ?)';
    db.query(sql, [username, email, password, 'user'], (err) => {
        if (err) {
            req.flash('error', 'Registration failed. Email may already be in use.');
            return res.redirect('/register');
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Login
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Welcome back, ' + results[0].username + '!');
            res.redirect('/dashboard');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Dashboard
app.get('/dashboard', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM skills WHERE user_id = ?';
    db.query(sql, [req.session.user.id], (err, mySkills) => {
        if (err) throw err;
        res.render('dashboard', { mySkills });
    });
});

// Profile
app.get('/profile', checkAuthenticated, (req, res) => {
    res.render('profile');
});

app.post('/profile', checkAuthenticated, (req, res) => {
    const { username, email } = req.body;
    const sql = 'UPDATE users SET username = ?, email = ? WHERE id = ?';
    db.query(sql, [username, email, req.session.user.id], (err) => {
        if (err) throw err;
        req.session.user.username = username;
        req.session.user.email = email;
        req.flash('success', 'Profile updated.');
        res.redirect('/profile');
    });
});

// Skills (browse all, with optional search)
app.get('/skills', (req, res) => {
    const search = req.query.search || '';
    const sql = `SELECT skills.*, users.username FROM skills
                 JOIN users ON skills.user_id = users.id
                 WHERE skills.title LIKE ?`;
    db.query(sql, ['%' + search + '%'], (err, skills) => {
        if (err) throw err;
        res.render('skills', { skills, search });
    });
});

// Add skill
app.get('/skills/add', checkAuthenticated, (req, res) => {
    res.render('addSkill');
});

app.post('/skills/add', checkAuthenticated, (req, res) => {
    const { title, category, description, rate } = req.body;
    const sql = 'INSERT INTO skills (user_id, title, category, description, rate) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [req.session.user.id, title, category, description, rate], (err) => {
        if (err) throw err;
        req.flash('success', 'Skill added.');
        res.redirect('/dashboard');
    });
});

// Edit skill
app.get('/skills/edit/:id', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM skills WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.redirect('/dashboard');
        res.render('editSkill', { skill: results[0] });
    });
});

app.post('/skills/edit/:id', checkAuthenticated, (req, res) => {
    const { title, category, description, rate } = req.body;
    const sql = 'UPDATE skills SET title = ?, category = ?, description = ?, rate = ? WHERE id = ?';
    db.query(sql, [title, category, description, rate, req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Skill updated.');
        res.redirect('/dashboard');
    });
});

// Delete skill
app.get('/skills/delete/:id', checkAuthenticated, (req, res) => {
    db.query('DELETE FROM skills WHERE id = ?', [req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Skill deleted.');
        res.redirect('/dashboard');
    });
});

// Bookings
app.get('/bookings', checkAuthenticated, (req, res) => {
    const sql = `SELECT bookings.*, skills.title FROM bookings
                 JOIN skills ON bookings.skill_id = skills.id
                 WHERE bookings.user_id = ?`;
    db.query(sql, [req.session.user.id], (err, bookings) => {
        if (err) throw err;
        res.render('bookings', { bookings });
    });
});

app.post('/bookings/add/:skillId', checkAuthenticated, (req, res) => {
    const { booking_date } = req.body;
    const sql = 'INSERT INTO bookings (skill_id, user_id, booking_date, status) VALUES (?, ?, ?, ?)';
    db.query(sql, [req.params.skillId, req.session.user.id, booking_date, 'pending'], (err) => {
        if (err) throw err;
        req.flash('success', 'Booking made.');
        res.redirect('/bookings');
    });
});

app.get('/bookings/cancel/:id', checkAuthenticated, (req, res) => {
    db.query('DELETE FROM bookings WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Booking cancelled.');
        res.redirect('/bookings');
    });
});

// Reviews (for a specific skill)
app.get('/review/:skillId', checkAuthenticated, (req, res) => {
    const skillSql = 'SELECT * FROM skills WHERE id = ?';
    const reviewSql = `SELECT reviews.*, users.username FROM reviews
                       JOIN users ON reviews.user_id = users.id
                       WHERE reviews.skill_id = ?`;
    db.query(skillSql, [req.params.skillId], (err, skillResults) => {
        if (err) throw err;
        if (skillResults.length === 0) return res.redirect('/skills');
        db.query(reviewSql, [req.params.skillId], (err, reviews) => {
            if (err) throw err;
            res.render('review', { skill: skillResults[0], reviews });
        });
    });
});

app.post('/review/:skillId', checkAuthenticated, (req, res) => {
    const { rating, comment } = req.body;
    const sql = 'INSERT INTO reviews (skill_id, user_id, rating, comment) VALUES (?, ?, ?, ?)';
    db.query(sql, [req.params.skillId, req.session.user.id, rating, comment], (err) => {
        if (err) throw err;
        req.flash('success', 'Review submitted.');
        res.redirect('/review/' + req.params.skillId);
    });
});

// Admin
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('SELECT id, username, email, role FROM users', (err, users) => {
        if (err) throw err;
        res.render('admin', { users });
    });
});

app.get('/admin/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    db.query('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'User deleted.');
        res.redirect('/admin');
    });
});

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SkillBridge running on http://localhost:' + PORT));
