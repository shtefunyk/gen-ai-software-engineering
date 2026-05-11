import { z } from 'zod';

export const CATEGORY = [
  'account_access',
  'technical_issue',
  'billing_question',
  'feature_request',
  'bug_report',
  'other',
];
export const PRIORITY = ['urgent', 'high', 'medium', 'low'];
export const STATUS = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
export const SOURCE = ['web_form', 'email', 'api', 'chat', 'phone'];
export const DEVICE = ['desktop', 'mobile', 'tablet'];

const metadataSchema = z.object({
  source: z.enum(SOURCE),
  browser: z.string().optional(),
  device_type: z.enum(DEVICE).optional(),
});

const baseFields = {
  customer_id: z.string().min(1),
  customer_email: z.string().email(),
  customer_name: z.string().min(1),
  subject: z.string().min(1).max(200),
  description: z.string().min(10).max(2000),
  category: z.enum(CATEGORY).optional(),
  priority: z.enum(PRIORITY).optional(),
  status: z.enum(STATUS).optional(),
  assigned_to: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: metadataSchema,
};

export const createTicketSchema = z.object(baseFields).strict();

export const updateTicketSchema = z
  .object({
    customer_id: z.string().min(1).optional(),
    customer_email: z.string().email().optional(),
    customer_name: z.string().min(1).optional(),
    subject: z.string().min(1).max(200).optional(),
    description: z.string().min(10).max(2000).optional(),
    category: z.enum(CATEGORY).optional(),
    priority: z.enum(PRIORITY).optional(),
    status: z.enum(STATUS).optional(),
    assigned_to: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    metadata: metadataSchema.partial().optional(),
  })
  .strict();

export const importRowSchema = createTicketSchema;

export const classificationResultSchema = z.object({
  category: z.enum(CATEGORY),
  priority: z.enum(PRIORITY),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  keywords: z.array(z.string()),
});
