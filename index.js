const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRETE_KEY);
const port = process.env.PORT || 5000;

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000", // or a list of allowed origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());

app.get("/", async (req, res) => {
  res.send("doctors portal server is running");
});

//middleware
function veriftyJWT(req, res, next) {
  const authorization = req.headers.authorization;
  //console.log(authorization);
  if (!authorization) {
    return res.status(401).send("unauthorized access");
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ messege: err.message });
    }
    req.decoded = decoded;
    console.log(decoded);
    next();
  });
}

const DBUser = process.env.DB_USER;
const DBPass = process.env.DB_PASS;

const uri = `mongodb+srv://${DBUser}:${DBPass}@cluster0.rqebvmt.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    /* Collections */
    const appointOptionCollection = client
      .db("Doctors-Portal")
      .collection("appointmentOptions");

    const bookingsCollection = client
      .db("Doctors-Portal")
      .collection("bookings");

    const usersCollection = client.db("Doctors-Portal").collection("users");

    const doctorsCollection = client.db("Doctors-Portal").collection("doctors");

    const paymentsCollection = client
      .db("Doctors-Portal")
      .collection("payments");

    /**
     * Middleware for verify Admin
     */
    async function verifyAdmin(req, res, next) {
      const decodedEmail = req.decoded.email;
      const query = { Email: decodedEmail };
      const checkUserRole = await usersCollection.findOne(query);
      //console.log(checkUserRole);
      if (checkUserRole?.role !== "admin") {
        return res.status(403).send({ message: "User not Admin" });
      }
      next();
    }
    /*****************************MiddleWare End *********************************/
    /*API s */
    /*Options from database */

    app.get("/appointOptions", async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointOptionCollection.find(query).toArray();
      /*get the bookings provided the date */

      const bookingQuery = { Date: date };
      const booked = await bookingsCollection.find(bookingQuery).toArray();

      options.forEach((option) => {
        const optionBooked = booked.filter(
          (book) => book.Service === option.name
        );
        const bookedSlots = optionBooked.map((book) => book.Time);
        const reminingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = reminingSlots;
      });
      res.send(options);
    });

    /*appointment options API v2 */
    app.get("/v2/appointOptions", async (req, res) => {
      const date = req.query.date;
      const options = await appointOptionCollection
        .aggregate([
          /*pipelines */
          //pipeline 1: selecting bookings for each options
          {
            $lookup: {
              from: "bookings", //from bookings collection
              localField: "name", // match 'name' field of appointmentOptions collection with
              foreignField: "Service", // 'Service' field of bookings collection
              pipline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["Date", date], // getting datas of which matches 'Date' field with given 'date'
                    },
                  },
                },
              ],
              as: "booked", //an Array named booked
            },
          },
          //pipeline 2:getting booked slot
          {
            $project: {
              name: 1,
              slots: 1,
              booked: {
                $map: {
                  input: "$booked",
                  as: "book",
                  in: "$$book.slot",
                },
              },
            },
          },
          //pipline 3:???
          {
            $project: {
              name: 1,
              slots: {
                $setDifference: ["$slots", "$booked"],
              },
            },
          },
        ])
        .toArray();
      res.send(options);
    });

    //getting specific field only using 'project' operation. inside project assign 1 to the selected field
    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await appointOptionCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });
    /*Bookings */
    app.get("/clientBookings", veriftyJWT, async (req, res) => {
      const clientEmail = req.query.email;
      const decodedEmail = req.decoded.email;
      if (clientEmail !== decodedEmail) {
        return res.status(403).send("forbidden access mail dont match");
      }
      const query = { Email: clientEmail };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const bookedQuery = {
        Date: booking.Date,
        Service: booking.Service,
        Email: booking.Email,
      };
      const alreadyBooked = await bookingsCollection
        .find(bookedQuery)
        .toArray();
      if (alreadyBooked.length) {
        const messege = `You already have a booking on ${booking.Date}`;
        return res.send({ acknowledged: false, messege });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings-payment", async (req, res) => {
      const bookingID = req.query.id;
      const query = { _id: new ObjectId(bookingID) };
      const getBooking = await bookingsCollection.findOne(query);
      res.send(getBooking);
    });

    /******************************Bookings End****************************************** */

    // adding new user to mongodb
    app.post("/addUser", async (req, res) => {
      const user = req.body;
      const query = {};
      const addingUser = await usersCollection.insertOne(user);
      res.send(addingUser);
    });

    // json web token works
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { Email: email };
      const getExistingUser = await usersCollection.find(query).toArray();
      if (getExistingUser.length > 0) {
        //console.log(getExistingUser);
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accesToken: token });
      }
      return res.status(403).send({ message: "user email does not exist" });
    });
    /********************************** WebToken end ***************************************/
    //All Users
    app.get("/allusers", async (req, res) => {
      const query = {};
      const getAllUsers = await usersCollection.find(query).toArray();
      res.send(getAllUsers);
    });
    app.get("/allusers/admin/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { Email: userEmail };
      const getUser = await usersCollection.findOne(query);
      res.send({ isAdmin: getUser?.role === "admin" });
    });
    app.put("/allusers/admin/:id", async (req, res) => {
      const userID = req.params.id;
      const upsertRole = await usersCollection.updateOne(
        { _id: new ObjectId(userID) },
        {
          $set: {
            role: "admin",
          },
        },
        { upsert: true }
      );
      console.log(upsertRole);
      res.send(upsertRole);
    });
    /***********************All Users End***************************** */
    /**
     * Doctors handling API
     */
    app.post("/addDoctor", veriftyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      console.log(doctor);
      const addDoctor = await doctorsCollection.insertOne(doctor);
      res.send(addDoctor);
    });

    app.post("/manage-doctors", veriftyJWT, verifyAdmin, async (req, res) => {
      const adminEmail = req.query.email;
      const decodedEmail = req.decoded.email;
      if (adminEmail !== decodedEmail) {
        return res.status(403).send("forbidden access mail dont match");
      }
      const query = {};
      const allDoctors = await doctorsCollection.find(query).toArray();
      res.send(allDoctors);
    });

    app.delete("/delete-doctor", veriftyJWT, verifyAdmin, async (req, res) => {
      const delete_target = req.query.id;
      const query = { _id: new ObjectId(delete_target) };
      const deleted_doc = await doctorsCollection.deleteOne(query);
      console.log(deleted_doc);
      res.send(deleted_doc);

      /**********************************Doctors handling API End******************************************************* */
    });
    /**
     * Create Payment Intent
     */
    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.Price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    /****************************************************************************************************************** */

    /**
     * Save transactions to Mongodb
     */
    app.post("/payment-save", async (req, res) => {
      const payment_info = req.body;
      console.log(payment_info);
      const save_payments = await paymentsCollection.insertOne(payment_info);
      const bookingQuery = {
        _id: new ObjectId(payment_info.Booking_Id),
      };
      const update_booking = await bookingsCollection.updateOne(
        bookingQuery,
        {
          $set: { Paid: true },
        },
        { upsert: true }
      );
      console.log(update_booking);
      res.send(save_payments);
    });

    app.get("/payment-list", async (req, res) => {
      const payer_email = req.query.email;
      const query = { Pay_Email: payer_email };
      const get_payments = await paymentsCollection.find(query).toArray();
      res.send(get_payments);
    });

    /***************************************************************************************************************** */

    /****************Extras*************** */
    app.put("/temp-addprice", async (req, res) => {
      const query = {};
      const addPrice = await appointOptionCollection.updateMany(
        query,
        { $set: { price: 99 } },
        { upsert: true }
      );
      res.send(addPrice);
    });
    /***************Extras End************ */
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => console.log(`Doctors Portal Server running on ${port}`));
