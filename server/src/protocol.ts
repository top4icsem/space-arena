import { z } from 'zod';
import { inputSeq } from '../../shared/types.ts';

export const VERSION = 0;
export const CLOSE = Object.freeze({
  INVALID: 1008,
  OVERSIZE: 1009,
  RATE: 1008,
  JOIN_TIMEOUT: 1008,
  SERVER: 1011,
});
const printable = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine(
      (value: string) =>
        value.trim().length >= min &&
        !Array.from(value).some((c) => c.charCodeAt(0) <= 31 || c.charCodeAt(0) === 127),
    );
const envelope = { v: z.literal(0) };
export const JoinSchema = z
  .object({
    ...envelope,
    type: z.literal('join'),
    room: printable(1, 40),
    name: printable(1, 20),
    wire: z.enum(['binary', 'json']).optional(),
    bots: z.number().int().min(0).max(8).optional(),
  })
  .strict();
export const ChatSchema = z
  .object({ ...envelope, type: z.literal('chat'), text: printable(1, 300) })
  .strict();
export const InputSchema = z
  .object({
    ...envelope,
    type: z.literal('input'),
    seq: z.number().int().min(1).max(0xffffffff),
    mask: z.number().int().min(0).max(63),
  })
  .strict();
export const ProbeSchema = z
  .object({ ...envelope, type: z.literal('probe'), sent: z.number().finite().min(0).lt(1e12) })
  .strict();
export const LeaveSchema = z.object({ ...envelope, type: z.literal('leave') }).strict();
export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinSchema,
  ChatSchema,
  InputSchema,
  ProbeSchema,
  LeaveSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ParsedMessage =
  | Exclude<ClientMessage, { type: 'input' }>
  | (Omit<z.infer<typeof InputSchema>, 'seq'> & { seq: ReturnType<typeof inputSeq> });

export class ProtocolError extends Error {
  readonly closeCode: number;
  constructor(message: string, closeCode: number = CLOSE.INVALID) {
    super(message);
    this.closeCode = closeCode;
    this.name = 'ProtocolError';
  }
}
/** Parse untrusted bytes or text; never leak JSON.parse/Zod errors to WS callbacks. */
export function parseClientMessage(input: unknown, maxBytes = 2048): ParsedMessage {
  let bytes: Uint8Array;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else throw new ProtocolError('Unsupported payload');
  if (bytes.byteLength > maxBytes)
    throw new ProtocolError('Payload exceeds byte cap', CLOSE.OVERSIZE);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ProtocolError('Invalid JSON');
  }
  const parsed = ClientMessageSchema.safeParse(value);
  if (!parsed.success) throw new ProtocolError('Unknown or malformed message');
  if (parsed.data.type === 'input') return { ...parsed.data, seq: inputSeq(parsed.data.seq) };
  return parsed.data;
}
export const sendable = (type: string, fields: Record<string, unknown> = {}): string =>
  JSON.stringify({ v: VERSION, type, ...fields });
