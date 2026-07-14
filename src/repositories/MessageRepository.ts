import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { DatabaseError } from '../core/errors';

export interface CreateMessageInput {
  whatsappId: string;
  sender?: string | null;
  senderNumber?: string | null;
  isFromMe?: boolean;
  message: string;
  messageHash?: string | null;
  messageType?: string;
  receivedAt: Date;
}

export class MessageRepository {
  static async exists(whatsappId: string): Promise<boolean> {
    try {
      const count = await prisma.whatsAppMessage.count({
        where: { whatsappId },
      });
      return count > 0;
    } catch (error: any) {
      logger.error({ error, whatsappId }, 'MessageRepository: Failed to check message existence');
      throw new DatabaseError('Failed to check message deduplication status.', error);
    }
  }

  static async createMessage(input: CreateMessageInput) {
    logger.debug({ whatsappId: input.whatsappId }, 'MessageRepository: Creating message log');
    try {
      return await prisma.whatsAppMessage.create({
        data: {
          whatsappId: input.whatsappId,
          sender: input.sender,
          senderNumber: input.senderNumber,
          isFromMe: input.isFromMe ?? false,
          message: input.message,
          messageHash: input.messageHash,
          messageType: input.messageType ?? 'TEXT',
          ingestionStatus: 'NEW',
          receivedAt: new Date(input.receivedAt),
        },
      });
    } catch (error: any) {
      logger.error({ error, whatsappId: input.whatsappId }, 'MessageRepository: Failed to create message log');
      throw new DatabaseError('Failed to save message in SQLite.', error);
    }
  }

  static async getAll() {
    logger.debug('MessageRepository: Querying all messages');
    try {
      return await prisma.whatsAppMessage.findMany({
        orderBy: { receivedAt: 'desc' },
      });
    } catch (error: any) {
      logger.error({ error }, 'MessageRepository: Failed to query all messages');
      throw new DatabaseError('Failed to retrieve messages from database.', error);
    }
  }

  static async getCounts() {
    try {
      const total = await prisma.whatsAppMessage.count();
      return { total };
    } catch (error: any) {
      throw new DatabaseError('Failed to count messages.', error);
    }
  }

  static async getLastMessage() {
    try {
      return await prisma.whatsAppMessage.findFirst({
        orderBy: { receivedAt: 'desc' },
      });
    } catch (error: any) {
      throw new DatabaseError('Failed to load last message.', error);
    }
  }
}
