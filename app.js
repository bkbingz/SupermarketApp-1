const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); 
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Republic_C207',
    database: 'phoenix'
  });

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/browsing');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, contact, role } = req.body;

    if (!username || !email || !password || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/movieinventory', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM movies', (error, results) => {
      if (error) throw error;
      res.render('movieinventory', { movies: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, contact, role) VALUES (?, ?, SHA1(?), ?, ?)';
    connection.query(sql, [username, email, password, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/browsing');
            else
                res.redirect('/movieinventory');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/browsing', checkAuthenticated, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM movies', (error, results) => {
        if (error) throw error;
        res.render('browsing', { user: req.session.user, movies: results });
      });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const movieId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM movies WHERE movieId = ?', [movieId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const movies = results[0];

            // Initialize cart in session if not exists
            if (!req.session.cart) {
                req.session.cart = [];
            }

            // Check if movie already in cart
            const existingItem = req.session.cart.find(item => item.movieId === movieId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    movieId: movies.movieId,
                    moviename: movies.moviename,
                    price: movies.price,
                    quantity: quantity,
                    image: movies.image
                });
            }

            res.redirect('/cart');
        } else {
            res.status(404).send("movie not found");
        }
    });
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/movie/:id', checkAuthenticated, (req, res) => {
  const movieId = req.params.id;
  connection.query('SELECT * FROM movies WHERE movieId = ?', [movieId], (error, results) => {
      if (error) throw error;

      if (results.length > 0) {
          res.render('movie', { movies: results[0], user: req.session.user  });
      } else {
          // If no movie with the given ID was found, render a 404 page or handle it accordingly
          res.status(404).send('movie not found');
      }
  });
});

app.get('/addmovie', checkAuthenticated, checkAdmin, (req, res) => {
  res.render('addmovie', { 
    user: req.session.user,
    formData: {}  
  }); 
});

app.post('/addmovie', upload.single('image'),  (req, res) => {
    // Extract movie data from the request body
    const { moviename,synopsis,seatcapacity,showday,showtime,price,genre,rating,runtime,opening} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

    const sql = 'INSERT INTO movies (moviename,synopsis,seatcapacity,showday,showtime,price,image,genre,rating,runtime,opening) VALUES (?, ?, ?, ?,?,?,?,?,?,?,?)';
    // Insert the new movie into the database
    connection.query(sql , [moviename,synopsis,seatcapacity,showday,showtime,price,image,genre,rating,runtime,opening], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding movie:", error);
            res.status(500).send('Error adding movie');
        } else {
            // Send a success response
            res.redirect('/movieinventory');
        }
    });
});

app.get('/updatemovie/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const movieId = req.params.id;
    const sql = 'SELECT * FROM movies WHERE movieId = ?';

    // Fetch data from MySQL based on the movie ID
    connection.query(sql , [movieId], (error, results) => {
        if (error) throw error;

        // Check if any movie with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the movie data
            res.render('updatemovie', { movies: results[0] });
        } else {
            // If no movie with the given ID was found, render a 404 page or handle it accordingly
            res.status(404).send('movie not found');
        }
    });
});

app.post('/updatemovie/:id', upload.single('image'), (req, res) => {
    const movieId = req.params.id;
    const { moviename,synopsis,seatcapacity,showday,showtime,price,genre,rating,runtime,opening} = req.body;
    let image  = req.body.currentImage; 
    if (req.file) { 
        image = req.file.filename; 
    } 

    const sql = 'UPDATE movies SET moviename =?,synopsis=?,seatcapacity=?,showday=?,showtime=?,price=?,image=?,genre=?,rating=?,runtime=?,opening=? WHERE movieId = ?';
    // Insert the new movie into the database
    connection.query(sql, [moviename,synopsis,seatcapacity,showday,showtime,price,image,genre,rating,runtime,opening, movieId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating movie:", error);
            res.status(500).send('Error updating movie');
        } else {
            // Send a success response
            res.redirect('/movieinventory');
        }
    });
});

app.get('/deletemovie/:id', (req, res) => {
    const movieId = req.params.id;

    connection.query('DELETE FROM movies WHERE movieId = ?', [movieId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting movie:", error);
            res.status(500).send('Error deleting movie');
        } else {
            // Send a success response
            res.redirect('/movieinventory');
        }
    });
});

app.post("/checkout", (req, res) => {
  const cart = req.session.cart || [];
  const user = req.session.user;

  if (!user) return res.redirect("/login");
  if (cart.length === 0) return res.send("Your cart is empty.");

  let finalCart = [];
  let processed = 0;

  cart.forEach((item) => {
    connection.query(
      "SELECT seatcapacity, showday, showtime FROM movies WHERE movieId = ?",
      [item.movieId],
      (err, results) => {
        if (err) {
          console.error("Error fetching movie:", err.message);
          return res.status(500).send("Error during checkout.");
        }

        const movie = results[0];

        if (!movie) {
          processed++;
          if (processed === cart.length) finishCheckout();
          return;
        }

        if (movie.seatcapacity >= item.quantity) {
          connection.query(
            "UPDATE movies SET seatcapacity = seatcapacity - ? WHERE movieId = ?",
            [item.quantity, item.movieId],
            (err) => {
              if (err) {
                console.error("Error updating seatcapacity:", err.message);
              }

              movie.soldOut = false;
              movie.quantity = item.quantity;
              movie.price = item.price;
              movie.total = item.price * item.quantity;
              movie.name = item.moviename || item.movieName;

              finalCart.push(movie);
              processed++;
              if (processed === cart.length) finishCheckout();
            }
          );
        } else {
          movie.soldOut = true;
          movie.quantity = 0;
          movie.price = item.price;
          movie.total = 0;
          movie.name = item.moviename || item.movieName;

          finalCart.push(movie);
          processed++;
          if (processed === cart.length) finishCheckout();
        }
      }
    );
  });

  function finishCheckout() {
    req.session.cart = [];
    res.render("receipt", { cart: finalCart });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
