const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const app = express();
//middle ware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.coyp8rd.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
function verifyJWT(req, res, next) {
  console.log("inside verify jwt function", req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).send("unauthorize access");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}
async function run() {
  try {
    const serviceCollection = client.db("portals").collection("service");
    const bookingCollection = client.db("portals").collection("bookings");
    const userCollection = client.db("portals").collection("users");
    const specialistCollection = client.db("portals").collection("beautycians");
    const contactCollection = client.db("portals").collection("contacts");
    const paymentsCollection = client.db("portals").collection("payments");
    app.get("/option", async (req, res) => {
      const query = {};
      const result = await serviceCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient; //patient = email
      const decodedEmail = req.decoded.email;
      console.log(patient);
      console.log(decodedEmail);
      if (patient !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { patient: patient };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });
    //get booking for specific id
    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, booking: exist });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
    //available for booking
    app.get("/available", async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      //for each service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        const bookingSlot = serviceBookings.map((b) => b.slot);
        const available = service.slots.filter(
          (slot) => !bookingSlot.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });
    //user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });
    //FOR JSON WEB TOKEN API
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "24h",
        });
        return res.send({ accessToken: token });
      }
      console.log(user);
      res.status(403).send({ accessToken: "" });
    });
    //load all users
    app.get("/users", verifyJWT, async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });
    //user make admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const adminRequester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: adminRequester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updatedDoc = {
          $set: { role: "admin" },
        };
        const option = { upsert: true };
        const result = await userCollection.updateOne(
          filter,
          updatedDoc,
          option
        );
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });
    //for admin route checking
    app.get("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user?.role === "admin";

      res.send({ admin: isAdmin });
    });
    //for add specialist
    app.get("/specialist", async (req, res) => {
      const query = {};
      const result = await serviceCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });
    //post specialist beautician
    app.post("/beautycians", async (req, res) => {
      const beautycian = req.body;
      const result = await specialistCollection.insertOne(beautycian);
      res.send(result);
    });
    //get all beauticians
    app.get("/beautycians", async (req, res) => {
      const query = {};
      const result = await specialistCollection.find(query).toArray();
      res.send(result);
    });
    //delete  beauticians
    app.delete("/beautycians/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await specialistCollection.deleteOne(query);
      res.send(result);
    });
    //contact form
    app.post("/contact", async (req, res) => {
      const contact = req.body;
      const result = await contactCollection.insertOne(contact);
      res.send(result);
    });
    //get contact message
    app.get("/contact", async (req, res) => {
      const query = {};
      const result = await contactCollection.find(query).toArray();
      res.send(result);
    });
    //payment
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    //pay
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Jarins portal Api Running");
});
app.listen(port, () => {
  console.log("jarins server running on Port: ", port);
});
