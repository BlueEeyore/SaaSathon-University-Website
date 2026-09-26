import { z } from "zod";
export const emailSchema = z.email().trim().toLowerCase().max(254);
export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, "Enter the code from your email.");
export const ideaSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your idea a title.")
    .max(120, "Keep the title under 121 characters."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description under 2,001 characters."),
});
export const idSchema = z.uuid();
export type FormState = { error?: string; success?: string; email?: string };

// --- Identity and classes ---

// One global role per account. A new account is always created as a student;
// becoming a lecturer is a separate, allowlist-gated step. See the
// new_user_profile trigger in the identity migration.
export const roleSchema = z.enum(["student", "lecturer"]);
export type Role = z.infer<typeof roleSchema>;

export const signupSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Keep your name under 81 characters."),
});

// The join alphabet omits I, L and O and the digits 0 and 1, so a code can
// always be read aloud or copied without ambiguity.
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    new RegExp(`^[${JOIN_CODE_ALPHABET}]{10}$`),
    "That join code is not valid. Codes are 10 characters.",
  );

export const joinClassSchema = z.object({ code: joinCodeSchema });

export const classSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the class a title.")
    .max(120, "Keep the title under 121 characters."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description under 2,001 characters."),
});

export const addMemberSchema = z.object({ email: emailSchema });

// --- Lectures ---

export const lectureSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the lecture a title.")
    .max(120, "Keep the title under 121 characters."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description under 2,001 characters."),
});

// Uploads stream to disk outside the action layer, so this only bounds what we
// are willing to normalise and transcribe on the demo host.
export const uploadPolicySchema = z.object({
  maxBytes: z.number().int().positive().max(4 * 1024 * 1024 * 1024),
  maxSeconds: z.number().int().positive().max(4 * 60 * 60),
});

// --- Highlights and comments ---

const milliseconds = z.number().int().min(0).max(24 * 60 * 60 * 1000);

export const highlightSchema = z
  .object({
    lectureId: idSchema,
    startMs: milliseconds,
    endMs: milliseconds,
    // The quoted text keeps a highlight meaningful even if the transcript is
    // re-rendered, and gives the comment thread something to show.
    quote: z.string().trim().min(1).max(600),
  })
  .refine((value) => value.endMs > value.startMs, {
    message: "A highlight must cover a moment in time.",
    path: ["endMs"],
  });

export const commentSchema = z
  .object({
    lectureId: idSchema,
    highlightId: idSchema.nullable().optional(),
    // A comment may hang off a highlight, a timestamp range, or both.
    startMs: milliseconds.nullable().optional(),
    endMs: milliseconds.nullable().optional(),
    body: z
      .string()
      .trim()
      .min(1, "Write something first.")
      .max(4000, "Keep comments under 4,001 characters."),
  })
  .refine(
    (value) =>
      Boolean(value.highlightId) ||
      (value.startMs != null && value.endMs != null && value.endMs > value.startMs),
    {
      message: "A comment must attach to a highlight or a timestamp range.",
      path: ["body"],
    },
  );

export const commentIdSchema = z.object({ id: idSchema });

// --- Engagement events ---

export const watchEventTypeSchema = z.enum([
  "open",
  "play",
  "pause",
  "seek",
  "heartbeat",
  "ended",
]);

// Batches are capped so a misbehaving or hostile client cannot flood the table.
// The sampler flushes roughly every 15s, so 50 is generous.
export const watchEventBatchSchema = z.object({
  events: z
    .array(
      z.object({
        lectureId: idSchema,
        type: watchEventTypeSchema,
        positionMs: milliseconds,
        durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000),
        // Seconds of playback attributed to this event, so unique coverage can
        // be computed server-side without trusting the client.
        watchedMs: z.number().int().min(0).max(60 * 1000),
      }),
    )
    .min(1)
    .max(50),
});
