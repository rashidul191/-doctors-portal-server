const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6yzsi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client
      .db("doctors_portal")
      .collection("bookings");

    /**
     * API Naming Convention
     * app.get("/booking") // get all bookings in the collection. or get more then one or by filter
     * app.get("/booking/:id") // get a specific booking
     * app.post("/booking") // add a new booking
     * app.patch("/booking/:id") // update a specific booking
     * app.delete("/booking/:id") // delete a specific booking
     */

    // get all services
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const service = await cursor.toArray();
      res.send(service);
    });

    // Warning:
    // This is not the proper way to query.
    // After learning more about mongodb. use aggregate lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1: get all services
      const services = await serviceCollection.find().toArray();

      // step 2: get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service
      services.forEach((service) => {
        // step 4: find booking for that service. output: [{}, {}, {}, {}]
        const serviceBookings = bookings.filter(
          (booking) => booking.name === service.name
        );

        // step 5: select slots for the service Bookings : ["","","","",""]
        const bookedSlots = serviceBookings.map((book) => book.slot);

        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });

    app.get("/booking", async (req, res) => {
      const patient = req.body.patient;
      const query = { patient: patient };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body; // booking data
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    });
  } finally {
  }
}
run().catch(console.dir);

// get root port
app.get("/", (req, res) => {
  res.send("Running Server side");
});

// listen port number
app.listen(port, () => {
  console.log("lister port: ", port);
});
