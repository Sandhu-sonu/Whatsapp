import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export class NotificationRepository {
  static async create(
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
    category: 'OPERATIONAL' | 'TECHNICAL' | 'SYSTEM',
    title: string,
    message: string
  ) {
    try {
      const notification = await prisma.systemNotification.create({
        data: {
          type,
          category,
          title,
          message,
          read: false,
        },
      });
      logger.debug({ notification }, 'NotificationRepository: Created notification');
      return notification;
    } catch (error: any) {
      logger.error({ error, type, category, title }, 'NotificationRepository: Failed to create notification');
      return null;
    }
  }

  static async getNotifications(limit = 100) {
    try {
      return await prisma.systemNotification.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error: any) {
      logger.error({ error }, 'NotificationRepository: Failed to query notifications');
      return [];
    }
  }

  static async getUnreadCount() {
    try {
      return await prisma.systemNotification.count({
        where: { read: false },
      });
    } catch (error: any) {
      logger.error({ error }, 'NotificationRepository: Failed to count unread notifications');
      return 0;
    }
  }

  static async markAsRead(id: string) {
    try {
      return await prisma.systemNotification.update({
        where: { id },
        data: { read: true },
      });
    } catch (error: any) {
      logger.error({ error, id }, 'NotificationRepository: Failed to mark notification as read');
      return null;
    }
  }

  static async delete(id: string) {
    try {
      return await prisma.systemNotification.delete({
        where: { id },
      });
    } catch (error: any) {
      logger.error({ error, id }, 'NotificationRepository: Failed to delete notification');
      return null;
    }
  }

  static async markAllAsRead() {
    try {
      return await prisma.systemNotification.updateMany({
        where: { read: false },
        data: { read: true },
      });
    } catch (error: any) {
      logger.error({ error }, 'NotificationRepository: Failed to mark all notifications as read');
      return null;
    }
  }
}
