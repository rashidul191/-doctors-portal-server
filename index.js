const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");
const sgTransport = require("nodemailer-sendgrid-transport");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6yzsi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// verify JWT
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

// Send Email Admin to user
const emailSenderOptions = {
  auth: {
    api_key: process.env.EMAIL_SENDER_API_KEY,
  },
};

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));
// Booking Appointment send email to user
function sendAppointmentEmail(booking) {
  const { patientEmail, patientName, treatment, date, slot } = booking;
  const email = {
    from: process.env.EMAIL_SENDER,
    to: patientEmail,
    subject: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    text: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    html: `<div>
    <p>Hello ${patientName} ,</p>
    <h3>Your Appointment for ${treatment} is confirmed</h3>
    <p>Looking forward to seeing you on ${date} at ${slot}.</p>
    <h3>Our Address</h3>
    <p>West Shwrapara, Mirpur-10, Dhaka</p>
    <p>Bangladesh</p>
    <a href="https://github.com/rashidul191">unsubscribe</a>
  </div>`,
  };
  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: ", info);
    }
  });
}

// payment paid send email to user
function sendPaymentConfirmEmail(booking) {
  const { patientEmail, patientName, treatment, date, slot } = booking;
  const email = {
    from: process.env.EMAIL_SENDER,
    to: patientEmail,
    subject: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    text: `Your payment for this appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
    html: `<div>
    <p>Hello ${patientName} ,</p>
    <h3>Thanks you for your payment.</h3>
    <h3>We have received your payment</h3>
    <p>Looking forward to seeing you on ${date} at ${slot}.</p>
    <h3>Our Address</h3>
    <p>West Shwrapara, Mirpur-10, Dhaka</p>
    <p>Bangladesh</p>
    <a href="https://github.com/rashidul191">unsubscribe</a>
  </div>`,
  };
  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: ", info);
    }
  });
}
// Run function
async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client
      .db("doctors_portal")
      .collection("bookings");
    const userCollection = client.db("doctors_portal").collection("user");
    const doctorCollection = client.db("doctors_portal").collection("doctors");
    const paymentCollection = client
      .db("doctors_portal")
      .collection("payments");

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    /**
     * API Naming Convention
     * app.get("/booking") // get all bookings in the collection. or get more then one or by filter
     * app.get("/booking/:id") // get a specific booking
     * app.post("/booking") // add a new booking
     * app.patch("/booking/:id") // update a specific booking
     * app.delete("/booking/:id") // delete a specific booking
     */

    // Create Payment Intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // get all services
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
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

    // all users info
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();

      res.send(users);
    });

    // check admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // put method make admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    // put method user info
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);

      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patientEmail = req.query.patientEmail;
      const decodedEmail = req.decoded.email;

      if (patientEmail === decodedEmail) {
        const query = { patientEmail: patientEmail };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    });

    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
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
      console.log("sending email");
      sendAppointmentEmail(booking);
      res.send({ success: true, result });
    });

    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(updatedBooking);
    });

    // add doctors
    // app.post("/doctor", async (req, res) => {
    app.post("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    // get doctors or doctors info show admin ui
    // app.get("/doctors", async(req, res)=>{
    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const result = await doctorCollection.find(query).toArray();
      res.send(result);
    });

    // delete doctor
    // app.delete("/doctors/:email", async(req, res)=>{
    app.delete("/doctors/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

// get root port
app.get("/", (req, res) => {
  res.send("Doctors Portal Running Server side");
});

// listen port number
app.listen(port, () => {
  console.log("lister port: ", port);
});
