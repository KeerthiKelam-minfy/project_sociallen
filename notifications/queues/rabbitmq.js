import amqp from "amqplib";
import { sendEmail } from "../services/sendEmail.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";

export const consumeQueue = async (queueName) => {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(queueName, { durable: true });

    console.log(`Waiting for messages in queue: ${queueName}`);

    channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        const message = JSON.parse(msg.content.toString());
        console.log("Received message:", message);

        if (message.type === "email") {
          await sendEmail(message.to, message.subject, message.text);
          console.log(`Email sent to ${message.to}`);
        }

        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error("Error consuming queue:", error);
  }
};
