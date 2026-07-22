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
    secret: process.env.SESSION_SECRET || 'secret',
    resave: true,
    saveUninitialized: true
}));
app.use(flash());

// Database
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'RP738964$',
    database: process.env.DB_NAME || 'c237_skillbridge',
    // Azure Database for MySQL requires SSL — set DB_SSL=true on Render
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
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
        [title, description, category, level, duration, mode,
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

// View profile
app.get('/profile', isAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM users WHERE user_id = ?';
 
    db.query(sql, [req.session.user.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('User not found');
 
        res.render('profile', { user: req.session.user, profile: results[0] });
    });
});
 
// Update profile
app.post('/profile', isAuthenticated, (req, res) => {
    const { username, email } = req.body;
    const sql = 'UPDATE users SET username = ?, email = ? WHERE user_id = ?';
 
    db.query(sql, [username, email, req.session.user.id], (err) => {
        if (err) throw err;
        req.session.user.username = username;
        req.session.user.email = email;
        res.redirect('/profile');
    });
});



// View bookings page (learner = my bookings, instructor = incoming requests, admin = all)
app.get('/bookings', isAuthenticated, (req, res) => {
    const role = req.session.user.role;
    let sql, params;

    if (role === 'instructor') {
        // Requests made for this instructor's skill courses
        sql = `
            SELECT b.*, s.title AS skill_title, s.instructor_id,
                   u.username AS learner_username
            FROM bookings b
            JOIN skills s ON b.skill_id = s.skill_id
            JOIN users u ON b.learner_id = u.user_id
            WHERE s.instructor_id = ?
            ORDER BY b.created_at DESC
        `;
        params = [req.session.user.id];
    } else if (role === 'admin') {
        // Admin sees every booking
        sql = `
            SELECT b.*, s.title AS skill_title, s.instructor_id,
                   u.username AS learner_username,
                   iu.username AS instructor_username
            FROM bookings b
            JOIN skills s ON b.skill_id = s.skill_id
            JOIN users u ON b.learner_id = u.user_id
            JOIN users iu ON s.instructor_id = iu.user_id
            ORDER BY b.created_at DESC
        `;
        params = [];
    } else {
        // Learner sees their own bookings
        sql = `
            SELECT b.*, s.title AS skill_title, s.instructor_id,
                   iu.username AS instructor_username
            FROM bookings b
            JOIN skills s ON b.skill_id = s.skill_id
            JOIN users iu ON s.instructor_id = iu.user_id
            WHERE b.learner_id = ?
            ORDER BY b.created_at DESC
        `;
        params = [req.session.user.id];
    }

    db.query(sql, params, (err, bookings) => {
        if (err) throw err;

        // Split into active bookings vs booking history
        const active = bookings.filter(b => b.status === 'pending' || b.status === 'accepted');
        const history = bookings.filter(b => b.status === 'rejected' || b.status === 'cancelled' || b.status === 'completed');

        res.render('bookings', {
            user: req.session.user,
            active,
            history,
            message: req.flash('message')
        });
    });
});

// Show "request a lesson" form
app.get('/bookings/new', isAuthenticated, (req, res) => {
    if (req.session.user.role === 'instructor') {
        req.flash('message', 'Instructors cannot request lessons');
        return res.redirect('/bookings');
    }

    const sql = `
        SELECT s.skill_id, s.title, s.category, s.level, u.username AS instructor_username
        FROM skills s
        JOIN users u ON s.instructor_id = u.user_id
        ORDER BY s.title ASC
    `;
    db.query(sql, (err, skills) => {
        if (err) throw err;
        res.render('requestBooking', {
            user: req.session.user,
            skills,
            selectedSkillId: req.query.skill_id || '',
            message: req.flash('message')
        });
    });
});

// Request a lesson (create booking, status starts as pending)
app.post('/bookings/new', isAuthenticated, (req, res) => {
    if (req.session.user.role === 'instructor') {
        req.flash('message', 'Instructors cannot request lessons');
        return res.redirect('/bookings');
    }

    const { skill_id, booking_date, booking_time, notes } = req.body;

    if (!skill_id || !booking_date || !booking_time) {
        req.flash('message', 'Please fill in the skill, date and time');
        return res.redirect('/bookings/new');
    }

    // Block bookings in the past
    const requested = new Date(booking_date + 'T' + booking_time);
    if (isNaN(requested.getTime()) || requested <= new Date()) {
        req.flash('message', 'Please choose a date and time in the future');
        return res.redirect('/bookings/new');
    }

    const sql = `
        INSERT INTO bookings (skill_id, learner_id, booking_date, booking_time, notes, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    `;
    db.query(sql, [skill_id, req.session.user.id, booking_date, booking_time, notes || null], (err) => {
        if (err) throw err;
        req.flash('message', 'Lesson requested! Waiting for the instructor to respond.');
        res.redirect('/bookings');
    });
});

// Accept a booking — only the instructor who owns the skill
app.post('/bookings/:id/accept', isAuthenticated, isInstructor, (req, res) => {
    const sql = `
        UPDATE bookings b
        JOIN skills s ON b.skill_id = s.skill_id
        SET b.status = 'accepted'
        WHERE b.booking_id = ? AND s.instructor_id = ? AND b.status = 'pending'
    `;
    db.query(sql, [req.params.id, req.session.user.id], (err, result) => {
        if (err) throw err;
        req.flash('message', result.affectedRows ? 'Booking accepted' : 'Unable to accept this booking');
        res.redirect('/bookings');
    });
});

// Reject a booking — only the instructor who owns the skill
app.post('/bookings/:id/reject', isAuthenticated, isInstructor, (req, res) => {
    const sql = `
        UPDATE bookings b
        JOIN skills s ON b.skill_id = s.skill_id
        SET b.status = 'rejected'
        WHERE b.booking_id = ? AND s.instructor_id = ? AND b.status = 'pending'
    `;
    db.query(sql, [req.params.id, req.session.user.id], (err, result) => {
        if (err) throw err;
        req.flash('message', result.affectedRows ? 'Booking rejected' : 'Unable to reject this booking');
        res.redirect('/bookings');
    });
});

// Cancel a booking — learner cancels their own, or instructor cancels one for their skill
app.post('/bookings/:id/cancel', isAuthenticated, (req, res) => {
    let sql, params;

    if (req.session.user.role === 'instructor') {
        sql = `
            UPDATE bookings b
            JOIN skills s ON b.skill_id = s.skill_id
            SET b.status = 'cancelled'
            WHERE b.booking_id = ? AND s.instructor_id = ?
              AND b.status IN ('pending', 'accepted')
        `;
        params = [req.params.id, req.session.user.id];
    } else if (req.session.user.role === 'admin') {
        sql = `
            UPDATE bookings SET status = 'cancelled'
            WHERE booking_id = ? AND status IN ('pending', 'accepted')
        `;
        params = [req.params.id];
    } else {
        sql = `
            UPDATE bookings SET status = 'cancelled'
            WHERE booking_id = ? AND learner_id = ?
              AND status IN ('pending', 'accepted')
        `;
        params = [req.params.id, req.session.user.id];
    }

    db.query(sql, params, (err, result) => {
        if (err) throw err;
        req.flash('message', result.affectedRows ? 'Booking cancelled' : 'Unable to cancel this booking');
        res.redirect('/bookings');
    });
});

// Mark a lesson as completed — instructor only, after it was accepted
app.post('/bookings/:id/complete', isAuthenticated, isInstructor, (req, res) => {
    const sql = `
        UPDATE bookings b
        JOIN skills s ON b.skill_id = s.skill_id
        SET b.status = 'completed'
        WHERE b.booking_id = ? AND s.instructor_id = ? AND b.status = 'accepted'
    `;
    db.query(sql, [req.params.id, req.session.user.id], (err, result) => {
        if (err) throw err;
        req.flash('message', result.affectedRows ? 'Lesson marked as completed' : 'Unable to update this booking');
        res.redirect('/bookings');
    });
});




// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SkillBridge running on http://localhost:' + PORT));
