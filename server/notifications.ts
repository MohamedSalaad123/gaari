import type { Request, Response } from 'express';
import type mongoose from 'mongoose';
import { NotificationModel } from './db.ts';

export interface SerializedNotification {
  id: string;
  type: 'vehicle_maintenance' | 'rental_payment';
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  amount: number | null;
  payment_method: string | null;
  payment_date: string | null;
  read: boolean;
  created_at: string;
}

export function serializeNotification(doc: {
  _id: { toString(): string };
  type: string;
  vehicleId: { toString(): string };
  vehicleName: string;
  plateNumber: string;
  amount?: number | null;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  read: boolean;
  createdAt: Date;
}): SerializedNotification {
  return {
    id: doc._id.toString(),
    type: doc.type === 'rental_payment' ? 'rental_payment' : 'vehicle_maintenance',
    vehicle_id: doc.vehicleId.toString(),
    vehicle_name: doc.vehicleName,
    plate_number: doc.plateNumber,
    amount: typeof doc.amount === 'number' ? Math.round(doc.amount * 100) / 100 : null,
    payment_method: doc.paymentMethod ?? null,
    payment_date: doc.paymentDate ?? null,
    read: Boolean(doc.read),
    created_at: doc.createdAt.toISOString(),
  };
}

const activeStreams = new Set<Response>();

export function registerNotificationStream(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  activeStreams.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
      activeStreams.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    activeStreams.delete(res);
  });
}

export async function publishNotification(input: {
  type: 'vehicle_maintenance' | 'rental_payment';
  vehicleId: mongoose.Types.ObjectId | string;
  vehicleName: string;
  plateNumber: string;
  amount?: number | null;
  paymentMethod?: string | null;
  paymentDate?: string | null;
}): Promise<SerializedNotification> {
  const created = await NotificationModel.create({
    type: input.type,
    vehicleId: input.vehicleId,
    vehicleName: input.vehicleName,
    plateNumber: input.plateNumber,
    amount: input.amount ?? null,
    paymentMethod: input.paymentMethod ?? null,
    paymentDate: input.paymentDate ?? null,
    read: false,
  });

  const payload = serializeNotification(created);
  const sseChunk = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of activeStreams) {
    try {
      client.write(sseChunk);
    } catch {
      activeStreams.delete(client);
    }
  }

  return payload;
}
