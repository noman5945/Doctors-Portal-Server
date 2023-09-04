const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  res.send("doctors portal server is running");
});

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

    /*API s */
    /*Options from database */

    app.get("/appointOptions", async (req, res) => {
      const query = {};
      const options = await appointOptionCollection.find(query).toArray();
      res.send(options);
    });

    /*Bookings */
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => console.log(`Doctors Portal Server running on ${port}`));
