import dotenv from "dotenv";
dotenv.config();
import { consumeQueue } from "./queues/rabbitmq.js";

const start = async () => {
  await consumeQueue("notifications");
  console.log("Notifications service started and listening to RabbitMQ...");
};

start();
