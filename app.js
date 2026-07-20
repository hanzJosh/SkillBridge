const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// Database
const db = mysql.createConnection({
    host: 'c237-hannah-mysql.mysql.database.azure.com',
    user: 'c237_016',
    password: 'c237016@2026!',
    database: 'C237_016_t2regapp',
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});


// Home
app.get('/', (req, res) => {
    res.render('index');
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('SkillBridge running on http://localhost:' + PORT));
