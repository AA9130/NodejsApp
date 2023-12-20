const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql2');


const app = express();
const port = 3000;

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root@123',
    database: 'mysql',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

app.use(bodyParser.urlencoded({ extended: true }));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    // Fetch sum of availableslots from TimeSlots table
    pool.query('SELECT SUM(availableslots) AS totalAvailableSlots FROM TimeSlots', (error, sumResults) => {
        if (error) {
            console.error(error);
            res.status(500).send('Internal Server Error');
            return;
        }

        const totalAvailableSlots = sumResults[0].totalAvailableSlots || 0;

        // Fetch data from TimeSlots table
        pool.query('SELECT * FROM TimeSlots', (fetchError, results) => {
            if (fetchError) {
                console.error(fetchError);
                res.status(500).send('Internal Server Error');
            } else {
                const timeSlots = results.map(row => ({
                    id: row.TimeSlotsid,
                    label: `${row.dateandtime} (${row.availableslots} seats remaining)`,
                }));

                res.render('Register', { timeSlots, totalAvailableSlots });
            }
        });
    });
});

// Handle POST request for form submission
app.post('/submit', (req, res) => {
    // Extract data from form submission
    const formData = req.body;
    const studentId = formData.studentid;
    const selectedTimeSlotId = formData.timeSlot;

    // Check if the student ID already exists
    pool.query('SELECT * FROM StudentRegister WHERE studentid = ?', [studentId], (selectError, selectResults) => {
        if (selectError) {
            console.error(selectError);
            return res.status(500).send('Internal Server Error');
        }

        // If the student ID exists, prompt for confirmation to change registration
        if (selectResults.length > 0) {
            return res.status(400).send('ID is already present. Do you want to change your registration?');
        }

        // If the student ID is not present, proceed with registration
        pool.getConnection((getConnectionError, connection) => {
            if (getConnectionError) {
                console.error(getConnectionError);
                return res.status(500).send('Internal Server Error');
            }

            // Begin a transaction to ensure atomicity
            connection.beginTransaction((transactionError) => {
                if (transactionError) {
                    console.error(transactionError);
                    return connection.rollback(() => res.status(500).send('Transaction Error'));
                }

                // Update the availableslots value in the TimeSlots table
                connection.query('UPDATE TimeSlots SET availableslots = availableslots - 1 WHERE TimeSlotsid = ?', [selectedTimeSlotId], (updateError) => {
                    if (updateError) {
                        console.error(updateError);
                        return connection.rollback(() => res.status(500).send('Update Error'));
                    }

                    // Insert data into the StudentRegister table
                    connection.query('INSERT INTO StudentRegister SET ?', formData, (insertError) => {
                        if (insertError) {
                            console.error(insertError);
                            return connection.rollback(() => res.status(500).send('Insert Error'));
                        }

                        // Commit the transaction
                        connection.commit((commitError) => {
                            if (commitError) {
                                console.error(commitError);
                                return connection.rollback(() => res.status(500).send('Commit Error'));
                            }

                            console.log('Transaction committed successfully!');
                            connection.release();
                            res.redirect('student-records');
                        });
                    });
                });
            });
        });
    });
});



app.get('/student-records', (req, res) => {
    pool.query('select sr.firstname,sr.lastname,sr.studentid,sr.email,sr.phone,sr.Project_Title, ts.dateandtime from StudentRegister sr join TimeSlots ts on sr.timeslot = ts.TimeSlotsid', (error, results) => {
        if (error) {
            console.error(error);
            res.status(500).send('Internal Server Error');
        } else {
            // Render the page with all records
            res.render('index', { studentRecords: results });
        }
    });
});



// Start the server
app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
});
