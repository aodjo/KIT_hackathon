# Echo

Echo is not a product where AI directly teaches students. Instead, the student explains to the AI, and the AI takes on the role of a "past self" that learns from those explanations. Through this reversed structure, students train their self-explanation and metacognition skills, while teachers can identify stuck points faster — not just results.

## Before We Begin
> The [English document](./README-en.md) is a translation of the [Korean document](./README.md) created using AI. In case of any conflicts between the two documents, the [Korean document](./README.md) takes precedence.

## About the Project
> Echo was created for the [KOREA IT ACADEMY Competition](http://www.koreaitcam.net/2025/landing/vibe_coding.asp). This project was developed by [Junseong Lee](https://junx.dev/). For licensing details, please refer to the [LICENSE](./LICENSE).

## About the AI Models Used
> For the competition, we used `Claude Opus 4.6` (`Claude Code 2.1.84`) and `ChatGPT 5.4` (`Codex-cli 0.120.0`).
> Due to the nature of the competition, the [CLAUDE.md](./CLAUDE.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) files are made public.

## Brand Philosophy

Echo is designed around three premises:

- Learning is less about "getting the right answer" and more about "being able to explain why you solved it that way."
- Students often can't articulate what they don't know, so behavioral signals must be read instead.
- AI should not replace teachers — it should draw out student explanations and help teachers intervene sooner.

The name Echo reflects the idea that a student's work, hesitations, deletions, and explanations come back like an echo, illuminating their learning state.

## What Problem Does It Solve?

I started by thinking about what happens — and what goes wrong — in classrooms and learning environments.

- A student gets the right answer but doesn't actually understand the concept.
- A student gets it wrong but can't articulate where they got stuck.
- A teacher can't read every student's problem-solving process and hesitation signals in real time.

Echo addresses these problems in three stages:

1. It detects hidden questions from the student's behavioral signals.
2. It traces the cause of wrong answers back to earlier concepts.
3. It prompts the student to explain to their "past self," structuring their understanding.

## Core Principles

Echo's learning philosophy is grounded in the Protégé Effect — people learn most deeply when they teach someone else. Echo reimagines this structure using generative AI.

- The student explains a concept to the AI.
- The AI asks questions like a "past self" who doesn't know yet.
- Through the process of explaining, the student reveals their own gaps.
- The teacher sees more specific clues about who got stuck, where, and why.

In other words, Echo's goal is not an AI that gives answers, but an AI that draws out explanations.

## Product Components

### 1. Whisper

A hidden question detector. It aggregates micro-signals — hesitation, deletions, answer changes, incorrect submissions — to estimate "what is this student unsure about right now?" The results feed into learning analysis cards on the teacher's dashboard.

Examples of signals currently tracked:

- Number of pauses during problem-solving and their duration
- Number of answer deletions
- Number of answer changes
- Whether an incorrect answer was submitted
- Solution text and final answers

### 2. Tracer

Rather than treating a wrong answer as just a missed problem, Tracer traces which prior concepts may have been shaky, using the [knowledge map](https://echo.junx.dev/knowledgemap) as a reference. Based on the stored math concept hierarchy and the concepts used in each problem, it narrows down candidate gaps and presents them to the teacher.

### 3. MirrorMind

An explanation-based learning partner that plays the role of the student's "past self." The student must explain their problem-solving process to this AI, and they cannot move on to the next step until the AI judges the explanation sufficient or the student requests help from their teacher. After the explanation session ends, the conversation and solution are locked to preserve the learning flow.

## How the System Works

### Learning Flow

1. The teacher creates a problem set within a class and assigns it.
2. Students work through the assignment, leaving behind answers, solutions, and behavioral signals.
3. Whisper analyzes stuck points and candidate concept gaps.
4. The student talks with MirrorMind, explaining their solution process.
5. If the explanation is sufficient, they move on to the next problem. If not, they can end the session by requesting help from their teacher.
6. The teacher reviews submission results, learning analysis, and explanation conversation logs together.

### How Data Is Interpreted

The percentages in Echo's learning analysis are not scores — they represent interpretation confidence. These numbers don't define student achievement; they serve as operational metrics that prioritize "is this a signal the teacher should look at first?"

## Tech Stack

### Frontend

- React 18
- TypeScript
- Vite 6
- Tailwind CSS v4

### Backend

- Cloudflare Workers
- Hono.js
- Cloudflare D1
- Cloudflare R2

## LICENSE
> This product is provided under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/wp-content/uploads/2020/05/PolyForm-Noncommercial-1.0.0.txt). For details, please refer to the [LICENSE](./LICENSE).