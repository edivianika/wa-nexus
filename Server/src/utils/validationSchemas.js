import { z } from 'zod';

// --- Connection Schemas ---
const createConnectionSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Connection name is required'),
    user_id: z.string().uuid('Invalid user ID format'),
  }),
});

const connectionIdParamSchema = z.object({
  params: z.object({
    connectionId: z.string().min(1, 'Connection ID is required'),
  }),
});

const disconnectSchema = z.object({
  body: z.object({
    connection_id: z.string().uuid('Invalid connection ID format'),
  }),
});

// --- Message Schemas ---
const sendMessageSchema = z.object({
  body: z.object({
    to: z.string().min(5, 'Recipient number is required'),
    type: z.enum(['text', 'media'], {
      errorMap: () => ({ message: "Type must be 'text' or 'media'" }),
    }),
    content: z.string().optional(),
    media: z.array(z.object({
      url: z.string().url().optional(),
      fullPath: z.string().optional(),
      mimetype: z.string().optional(),
      filename: z.string().optional(),
      caption: z.string().optional(),
    })).optional(),
    isBroadcast: z.boolean().optional(),
  }).refine(data => {
    if (data.type === 'text' && !data.content) return false;
    if (data.type === 'media' && (!data.media || data.media.length === 0)) return false;
    return true;
  }, {
    message: 'Content is required for text messages, and media array is required for media messages.',
  }),
});


export {
  // Connection
  createConnectionSchema,
  connectionIdParamSchema,
  disconnectSchema,
  // Message
  sendMessageSchema,
}; 