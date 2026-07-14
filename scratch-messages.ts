import { prisma } from './src/lib/prisma';

async function main() {
  const messages = await prisma.whatsAppMessage.findMany();
  for (const m of messages) {
    console.log(`\n================================================`);
    console.log(`ID: ${m.id}`);
    console.log(`Sender: ${m.sender} (${m.senderNumber})`);
    console.log(`Status: ${m.ingestionStatus}`);
    console.log(`Received At: ${m.receivedAt.toISOString()}`);
    console.log(`Message Body:\n${m.message}`);
    console.log(`================================================`);
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
