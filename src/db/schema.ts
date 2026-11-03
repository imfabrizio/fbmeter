import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Operatori (chi accede alla regia). Il pubblico NON è qui: vedi `participants`. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  provider: text("provider"),
  /** pending | operator | admin */
  role: text("role").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/** Chiave AI personale di ogni operatore, cifrata con APP_ENCRYPTION_KEY. */
export const aiSettings = pgTable("ai_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** anthropic | google | openai */
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  keyCiphertext: text("key_ciphertext").notNull(),
  keyHint: text("key_hint").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Codice breve del QR: /e/<code> */
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  activeQuestionId: uuid("active_question_id"),
  /** live | join | compare | final — cosa mostra lo schermo del proiettore */
  screenMode: text("screen_mode").notNull().default("live"),
  screenBlockId: uuid("screen_block_id"),
  qaEnabled: boolean("qa_enabled").notNull().default(false),
  qaModerated: boolean("qa_moderated").notNull().default(false),
  resultsPublished: boolean("results_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Un blocco = un argomento dello speech (Entra, SharePoint, …). */
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
  },
  (t) => [index("blocks_event_idx").on(t.eventId)],
);

/**
 * Domande di un blocco, in numero e ordine liberi.
 * type: words (nuvola) | choice (scelta) | scale (scala) | open (aperta) | quiz
 */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    type: text("type").notNull().default("words"),
    /** Etichetta breve mostrata in regia e sul telefono: "Inizio", "Fine", "Sondaggio"… */
    label: text("label").notNull().default(""),
    prompt: text("prompt").notNull(),
    /** words: parole per persona */
    maxWords: integer("max_words").notNull().default(3),
    /** choice/quiz: opzioni di risposta */
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    /** choice/quiz: più risposte ammesse */
    multiple: boolean("multiple").notNull().default(false),
    /** quiz: indici delle opzioni corrette */
    correct: integer("correct").array().notNull().default(sql`'{}'::integer[]`),
    scaleMin: integer("scale_min").notNull().default(1),
    scaleMax: integer("scale_max").notNull().default(5),
    scaleMinLabel: text("scale_min_label").notNull().default(""),
    scaleMaxLabel: text("scale_max_label").notNull().default(""),
    /** Compare nella pagina e nella schermata del riepilogo finale */
    inSummary: boolean("in_summary").notNull().default(false),
    /** quiz: soluzione mostrata al pubblico */
    revealed: boolean("revealed").notNull().default(false),
  },
  (t) => [index("questions_block_idx").on(t.blockId, t.position)],
);

/** Pubblico anonimo: nickname + token conservato sul telefono (solo l'hash qui). */
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("participants_event_idx").on(t.eventId)],
);

/** Le parole sono salvate così come scritte: la normalizzazione avviene in lettura. */
export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    words: text("words").array().notNull().default(sql`'{}'::text[]`),
    /** choice/quiz: indici scelti */
    choices: integer("choices").array().notNull().default(sql`'{}'::integer[]`),
    /** scale: valore */
    scale: integer("scale"),
    /** open: testo */
    textValue: text("text_value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("answers_q_p_uq").on(t.questionId, t.participantId)],
);

/** Unioni decise dall'operatore (o accettate dall'AI): sourceKey → etichetta finale. */
export const aliases = pgTable(
  "aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    targetLabel: text("target_label").notNull(),
  },
  (t) => [uniqueIndex("aliases_block_key_uq").on(t.blockId, t.sourceKey)],
);

export const qaQuestions = pgTable(
  "qa_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    /** pending | visible | answered | hidden */
    status: text("status").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qa_event_idx").on(t.eventId)],
);

export const qaVotes = pgTable(
  "qa_votes",
  {
    qaQuestionId: uuid("qa_question_id")
      .notNull()
      .references(() => qaQuestions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.qaQuestionId, t.participantId] })],
);
