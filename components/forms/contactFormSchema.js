import * as z from 'zod';

export const MAX_CHARS = 5000;

export const RESPONSE_OPTIONS = [
  { value: 'none', label: 'No response needed (your message remains anonymous)' },
  { value: 'signal_username', label: 'Reply by Signal (username)', recommended: 'Most Secure' },
  { value: 'signal_phone', label: 'Reply by Signal (phone number)' },
  { value: 'email', label: 'Reply by Email' },
];

export const formSchema = z
  .object({
    message: z
      .string()
      .min(1, 'Message is required')
      .max(MAX_CHARS, `Message must not exceed ${MAX_CHARS} characters`),
    responseType: z.enum(
      RESPONSE_OPTIONS.map((opt) => opt.value),
      {
        required_error: "Please select how you'd like us to respond",
      },
    ),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    signalUsername: z
      .string()
      .transform((val) => {
        const cleaned = val.replace(/@/g, '').toLowerCase();
        return cleaned ? `@${cleaned}` : cleaned;
      })
      .refine((val) => {
        if (!val) return true;
        const username = val.slice(1);
        return username.length >= 3 && username.length <= 32;
      }, 'Username must be between 3 and 32 characters')
      .refine((val) => {
        if (!val) return true;
        const username = val.slice(1);
        return /^[a-z0-9_.]*$/.test(username);
      }, 'Username may only contain letters, numbers, underscores, and periods')
      .refine((val) => {
        if (!val) return true;
        const username = val.slice(1);
        return /.*\.[0-9]{2,}$/.test(username);
      }, 'Username must end with a period followed by at least two numbers')
      .optional()
      .or(z.literal('')),
    signalPhone: z.string().optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.responseType === 'email') {
        return !!data.email;
      }
      if (data.responseType === 'signal_username') {
        return !!data.signalUsername;
      }
      if (data.responseType === 'signal_phone') {
        return !!data.signalPhone;
      }
      return true;
    },
    {
      message: 'Please provide the required contact information for your selected response method',
      path: ['responseType'],
    },
  );
