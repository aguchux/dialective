# ChatDialect MVP Implementation Plan

> **Purpose:** Implementation plan for coding-agent consumption alongside `AGENTS.md`.
>
> **Product:** ChatDialect — a Dialect Library voice-first conversational assistant with a browser-rendered 3D local animated face.
>
> **Primary goal:** Ship the fastest credible MVP that proves a user can open ChatDialect, speak naturally, receive an AI voice response, see a synchronized animated 3D face, and optionally use text chat.

---

## 1. MVP Definition

ChatDialect MVP is a web-based conversational assistant with:

1. A small embeddable/openable assistant UI.
2. A 3D head-and-shoulders avatar rendered locally in the browser.
3. Microphone-first conversation.
4. Optional text input.
5. Streaming user/assistant transcript.
6. Realtime AI response.
7. Spoken assistant response.
8. Basic mouth synchronization.
9. Natural idle/listening/thinking/speaking facial states.
10. Basic expressions such as neutral, happy/smile, concerned, confused.
11. Interruptible voice conversation where practical.
12. A clean abstraction that later allows Dialect Library ASR/TTS and dialect-specific visemes to replace MVP providers.

The MVP is **not** a photorealistic video avatar.

---

## 2. MVP Success Scenario

A user visits the ChatDialect demo page.

1. The assistant appears as a small 3D face/head-and-shoulders character.
2. The user clicks **Start Conversation**.
3. Browser requests microphone permission.
4. Avatar changes from `idle` to `listening`.
5. User speaks.
6. User speech is sent over the realtime voice session.
7. Speech is transcribed.
8. Transcript appears in the chat panel.
9. Agent generates a response.
10. Avatar enters `thinking`.
11. TTS begins.
12. Avatar changes to `speaking`.
13. Mouth/jaw animate in approximate sync with generated speech.
14. Expression changes where applicable.
15. Spoken response is heard.
16. Response text appears in the transcript.
17. User can interrupt or speak again.
18. User can alternatively type a message and receive the same spoken + animated response.

If this end-to-end path works reliably in Chrome/Edge desktop and a modern mobile browser, the MVP objective is met.

---

## 3. Hard Scope Guardrails

Coding agents MUST NOT expand MVP scope into:

- photorealistic generated humans;
- video-avatar streaming;
- full-body animation;
- motion capture;
- custom 3D character creator;
- avatar marketplace;
- custom voice cloning;
- training new ASR models;
- training new TTS models;
- training facial-animation models;
- perfect phoneme-level lip sync for every dialect;
- phone/SIP support;
- WhatsApp integration;
- enterprise RAG;
- payments/billing;
- multi-agent orchestration;
- large admin dashboard;
- Kubernetes-first deployment;
- mobile native apps;
- WebGPU-only features;
- custom WebRTC implementation.

Implement interfaces that allow these later without building them now.

---

## 4. Recommended MVP Stack

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- LiveKit React SDK/components
- Three.js
- React Three Fiber
- `@react-three/drei`
- GLTF/GLB avatar initially
- Optional VRM support if the selected avatar asset is VRM-compatible

### Realtime Conversation

- LiveKit
- WebRTC
- LiveKit Agents
- Python agent worker

### AI Pipeline

For the first implementation use interchangeable provider adapters:

- STT: fast supported provider
- LLM: OpenAI or Anthropic adapter
- TTS: provider capable of low-latency streaming
- VAD / turn handling: LiveKit-supported components

Do not tightly couple business logic to any provider.

### Backend / Product API

For the fastest MVP:

- NestJS for application API only where needed
- PostgreSQL for persistent configuration/conversations if persistence is required
- Redis only when realtime/shared ephemeral state actually requires it

RabbitMQ is **not required for the first conversational vertical slice**. Add it when asynchronous workloads justify it.

### Local Development

Use Docker Compose only for services actually needed locally.

---

## 5. High-Level Architecture

```text
┌───────────────────────────────────────────────┐
│                 Browser                       │
│                                               │
│  Next.js UI                                   │
│  ├─ 3D Avatar / React Three Fiber             │
│  ├─ Chat transcript                           │
│  ├─ Text composer                             │
│  ├─ Mic controls                              │
│  └─ Avatar state controller                   │
└──────────────────┬────────────────────────────┘
                   │
                   │ WebRTC audio + realtime data
                   ▼
            ┌──────────────┐
            │   LiveKit    │
            └──────┬───────┘
                   │
                   ▼
       ┌─────────────────────────┐
       │ Python Realtime Agent   │
       │                         │
       │ VAD / turn detection    │
       │ STT                     │
       │ LLM                     │
       │ emotion tagging         │
       │ TTS                     │
       └────────────┬────────────┘
                    │
                    │ text/state/animation metadata
                    ▼
             Browser Avatar
```

Product/configuration requests may separately pass through the NestJS API.

---

## 6. Repository Layout

Prefer a monorepo.

```text
chatdialect/
├── AGENTS.md
├── PLAN.md
├── README.md
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── avatar/
│   │   │   ├── conversation/
│   │   │   └── livekit/
│   │   └── public/
│   │       └── avatars/
│   │
│   ├── api/
│   │   └── NestJS
│   │
│   └── agent/
│       ├── src/
│       │   ├── agent.py
│       │   ├── providers/
│       │   ├── emotion/
│       │   ├── events/
│       │   └── config/
│       └── tests/
│
├── packages/
│   ├── avatar-protocol/
│   ├── shared-types/
│   └── config/
│
└── infra/
    └── docker/
```

Keep avatar animation logic isolated from AI-provider logic.

---

## 7. Core Domain Model

### ConversationSession

```ts
type ConversationSession = {
  id: string;
  status: 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'ended';
  language?: string;
  dialect?: string;
};
```

### ConversationMessage

```ts
type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  source: 'voice' | 'text';
  text: string;
  createdAt: string;
};
```

### AvatarState

```ts
type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
```

### AvatarEmotion

```ts
type AvatarEmotion = 'neutral' | 'happy' | 'concerned' | 'confused';
```

### AvatarFrame/Event

```ts
type AvatarEvent = {
  state: AvatarState;
  emotion?: {
    type: AvatarEmotion;
    intensity: number; // 0..1
  };
  viseme?: {
    id: string;
    weight: number;
  };
  jawOpen?: number;
  audioLevel?: number;
  timestamp: number;
};
```

This contract is intentionally provider-neutral.

---

## 8. Avatar Requirements

### MVP Avatar

Use one licensed 3D avatar asset.

Requirements:

- head and shoulders visible;
- neutral resting pose;
- facial morph targets/blendshapes where possible;
- jaw movement;
- mouth opening;
- smile;
- blink;
- eyebrow movement if available;
- reasonable polygon/texture weight for web delivery.

Do not build avatar customization in MVP.

### Avatar Rendering

Implement:

```text
<AvatarScene />
  ├─ AvatarModel
  ├─ Lighting
  ├─ Camera
  ├─ FacialController
  ├─ VisemeController
  └─ IdleMotionController
```

Use requestAnimationFrame through the Three/R3F render loop.

---

## 9. Avatar State Machine

The avatar MUST be state-driven rather than manipulated ad hoc.

```text
              ┌───────┐
              │ IDLE  │
              └───┬───┘
                  │
                  ▼
             LISTENING
                  │
                  ▼
              THINKING
                  │
                  ▼
              SPEAKING
              /       \
             ▼         ▼
       LISTENING      IDLE
```

### IDLE

- soft neutral expression;
- breathing/head micro-motion;
- random blinking;
- occasional subtle gaze movement.

### LISTENING

- direct/near-direct gaze;
- gentle neutral smile;
- occasional subtle nod;
- mouth closed;
- normal blinking.

### THINKING

- no speech lip movement;
- slight gaze shift;
- very subtle head movement;
- neutral or context-appropriate expression.

### SPEAKING

- mouth/jaw active;
- viseme/blendshape animation;
- expression blended with speech animation;
- mild head/eyebrow gestures;
- blinking continues naturally.

### ERROR

- stop lip animation;
- neutral/concerned expression;
- UI displays recoverable error.

---

## 10. Facial Animation MVP

Do not attempt film-grade facial animation.

Implement these independent channels:

1. blink;
2. gaze;
3. jaw;
4. mouth/viseme;
5. smile/frown;
6. brows;
7. head micro-motion.

Blend channels rather than replacing the entire face pose.

Example:

```text
finalFace =
  speechViseme
  + jawFromAudio
  + activeEmotion
  + blink
  + idleMicroExpression
```

Clamp blendshape weights to supported ranges.

---

## 11. Lip Sync Strategy

### MVP Tier 1 — Immediate

Use:

- TTS audio playback level;
- speech timing;
- jaw/mouth-open movement;
- available viseme events where provider supports them.

Fallback:

```text
audio amplitude
      ↓
jawOpen + mouthOpen
```

This is acceptable for the first vertical slice.

### MVP Tier 2 — Before Public Demo

Map supported TTS visemes to avatar blendshapes.

Example internal mapping:

```ts
const visemeMap = {
  SIL: ['mouthClose'],
  A: ['viseme_aa'],
  E: ['viseme_E'],
  I: ['viseme_I'],
  O: ['viseme_O'],
  U: ['viseme_U'],
  M: ['viseme_PP'],
};
```

Exact keys depend on the chosen avatar.

### Post-MVP

Build Dialect Library's dialect-aware:

```text
phoneme → viseme → universal blendshape
```

mapping.

Do not block MVP on dialect-perfect visemes.

---

## 12. Emotion Strategy

MVP emotion classification should be deliberately small.

Supported output:

```json
{
  "emotion": "happy",
  "intensity": 0.65
}
```

Only allow:

- neutral;
- happy;
- concerned;
- confused.

Prefer structured model output or deterministic classification.

Never allow arbitrary emotion names from the LLM to flow directly into the renderer.

### Basic Mapping

#### neutral

```text
smile = 0.05
brow = neutral
head = neutral
```

#### happy

```text
smile = 0.4–0.8
cheek/eye squint = subtle
brow raise = subtle
```

#### concerned

```text
smile = 0
inner brow raise = subtle
small head tilt
```

#### confused

```text
one/symmetric brow raise where asset permits
small head tilt
reduced smile
```

---

## 13. Conversation Pipeline

For the MVP prefer a conventional pipeline because we need control over TTS/lip-sync:

```text
User audio
   ↓
VAD / endpointing
   ↓
STT
   ↓
Transcript
   ↓
LLM
   ↓
Structured response
   ├─ text
   └─ emotion
   ↓
TTS
   ├─ audio
   └─ timing/viseme metadata where available
   ↓
LiveKit
   ↓
Browser
   ├─ audio playback
   ├─ assistant transcript
   └─ avatar animation
```

Do not initially use an opaque speech-to-speech model if it prevents us from obtaining the text/timing control needed for avatar animation.

Keep realtime-model support as a future provider option.

---

## 14. Agent Response Contract

The AI layer should conceptually generate:

```json
{
  "text": "Hello! How can I help you today?",
  "emotion": {
    "type": "happy",
    "intensity": 0.55
  }
}
```

Validate against a schema.

If validation fails:

```json
{
  "text": "<model response>",
  "emotion": {
    "type": "neutral",
    "intensity": 0
  }
}
```

Never allow malformed LLM metadata to break audio response.

---

## 15. Text Input

Text input is a first-class fallback, not a separate chatbot.

```text
typed message
      ↓
same conversation context
      ↓
LLM
      ↓
same TTS
      ↓
same avatar response
```

Requirements:

- user can type while microphone is disabled;
- typed message appears in transcript;
- assistant still answers with voice by default;
- provide mute/speaker control;
- optional setting can disable spoken response later.

---

## 16. Realtime Events

Define a minimal frontend event protocol.

Examples:

```text
session.connected
session.disconnected

user.listening_started
user.listening_stopped
user.transcript.partial
user.transcript.final

assistant.thinking_started
assistant.response_text
assistant.speech_started
assistant.speech_finished

avatar.emotion
avatar.viseme
avatar.audio_level

error.recoverable
error.fatal
```

Use LiveKit data/text/state mechanisms where appropriate.

Do not invent a second realtime socket unless a requirement cannot be satisfied by the existing LiveKit connection.

---

## 17. Web UI

### Desktop MVP Layout

```text
┌───────────────────────────────────────────────────┐
│ ChatDialect                               ● Ready │
├────────────────────────────┬──────────────────────┤
│                            │                      │
│                            │  Conversation        │
│       3D AVATAR            │                      │
│                            │  User: ...           │
│    head + shoulders        │  Assistant: ...      │
│                            │                      │
│      ● Listening           │                      │
│                            │                      │
├────────────────────────────┴──────────────────────┤
│ [ Type a message...                    ] [Send]  │
│                 [ 🎙 Start/Stop ] [ 🔊 ]          │
└───────────────────────────────────────────────────┘
```

### Mobile

Stack avatar above transcript.

### Floating Widget

Do not make the embeddable floating widget the first engineering target.

First make `/demo` work end to end.

After the vertical slice is stable:

```text
/demo
   ↓
reusable ChatDialect components
   ↓
floating website widget
```

---

## 18. MVP Pages

Only build what is necessary:

```text
/
  Minimal landing/demo entry

/demo
  Main ChatDialect experience

/api/livekit/token
  Secure room/token bootstrap as appropriate
```

Optional internal diagnostic route:

```text
/dev/avatar
```

This route is highly recommended.

It should provide manual controls:

```text
State: [idle] [listening] [thinking] [speaking]
Emotion: [neutral] [happy] [concerned] [confused]
Intensity: slider
Jaw: slider
Viseme: selector
Blink: trigger
```

This lets avatar development proceed without running an AI conversation every time.

Never expose `/dev/avatar` in production.

---

## 19. Phase 0 — Project Bootstrap

### Tasks

- initialize monorepo;
- configure Next.js/TypeScript/Tailwind;
- configure Python agent app;
- configure environment management;
- connect LiveKit project;
- establish lint/test/typecheck commands;
- create shared types/protocol package;
- add `.env.example`;
- add health checks.

### Acceptance

- web app starts;
- agent starts;
- frontend can connect to a LiveKit room;
- no AI or avatar required yet.

---

## 20. Phase 1 — Voice Conversation Vertical Slice

Build voice before facial polish.

### Tasks

- microphone capture;
- LiveKit room connection;
- Python LiveKit agent;
- STT;
- LLM;
- TTS;
- playback of assistant voice;
- transcripts;
- user/assistant conversation context;
- interruption handling supported by chosen pipeline.

### Acceptance

A user can have a basic voice conversation in `/demo` with no avatar dependency.

Target:

```text
speak → transcript → AI → spoken response
```

---

## 21. Phase 2 — 3D Avatar Renderer

### Tasks

- load chosen GLB/VRM;
- camera framing;
- lights;
- responsive canvas;
- blink;
- head micro-motion;
- basic mouth/jaw morph;
- expression mapping;
- `/dev/avatar` controls.

### Acceptance

Without any AI:

- avatar loads quickly;
- avatar blinks;
- jaw opens/closes;
- smile works;
- emotion buttons work;
- state transitions work;
- mobile resize does not break scene.

---

## 22. Phase 3 — Conversation ↔ Avatar State

Wire conversational lifecycle into avatar state.

### Mapping

```text
room connected, no activity → idle
user speaking             → listening
user turn completed       → thinking
assistant TTS starts      → speaking
assistant TTS ends        → idle/listening
failure                   → error
```

### Acceptance

Run a voice conversation and observe correct state transitions without manual controls.

---

## 23. Phase 4 — Lip Sync

### First Pass

Drive jaw/mouth-open from assistant audio amplitude.

Requirements:

- attack/release smoothing;
- silence closes mouth;
- prevent jitter;
- never animate from microphone/user audio.

### Second Pass

If selected TTS exposes visemes/timing:

- receive viseme events;
- normalize to internal protocol;
- map to avatar morph targets;
- interpolate between visemes;
- synchronize against playback clock.

### Acceptance

Speech visually follows spoken cadence.

MVP does not require perfect phonetic articulation.

---

## 24. Phase 5 — Expressions

### Tasks

- add validated `emotion` metadata;
- map emotion to avatar blendshapes;
- blend with visemes;
- avoid expression snapping;
- ease emotion in/out;
- reset after utterance where appropriate.

### Acceptance

Test prompts such as:

```text
"Great news — your registration is complete."
```

should produce a mild happy expression.

```text
"I'm sorry, I couldn't find that information."
```

should produce mild concern.

Expressions must remain subtle.

---

## 25. Phase 6 — Text Input

### Tasks

- composer;
- send action;
- append user message;
- send through existing conversation context;
- receive same AI response;
- TTS response;
- avatar speaking state;
- disable duplicate sends.

### Acceptance

Voice and text turns can occur in the same conversation without losing context.

---

## 26. Phase 7 — Product Polish

Only after the pipeline works.

### Tasks

- reconnect handling;
- microphone permission states;
- no-mic fallback;
- mute button;
- stop speaking button;
- loading states;
- latency telemetry;
- error UI;
- mobile layout;
- browser compatibility;
- avatar asset optimization;
- accessibility labels;
- keyboard usage for text chat.

---

## 27. Phase 8 — Embeddable Widget

After `/demo` is stable:

Build a lightweight integration surface.

Target usage:

```html
<script src="https://cdn.chatdialect.example/widget.js" data-agent="demo"></script>
```

MVP widget behavior:

```text
small floating face/button
      ↓ click
expanded conversation panel
      ↓
existing ChatDialect client
```

Do not fork business logic between `/demo` and widget.

---

## 28. Avatar Protocol Package

Create:

```text
packages/avatar-protocol
```

The frontend must consume a normalized protocol, never provider-specific viseme names directly.

Suggested interface:

```ts
export interface AvatarController {
  setState(state: AvatarState): void;
  setEmotion(emotion: AvatarEmotion, intensity: number): void;
  pushViseme(viseme: NormalizedViseme): void;
  setAudioLevel(level: number): void;
  resetSpeech(): void;
}
```

This is important for future Dialect Library integration.

---

## 29. Provider Interfaces

The realtime agent should not import provider implementations throughout business code.

Conceptual interfaces:

```python
class SpeechToTextProvider:
    async def transcribe(...): ...

class LanguageModelProvider:
    async def respond(...): ...

class TextToSpeechProvider:
    async def synthesize(...): ...
```

TTS result should support optional metadata:

```python
class SpeechSynthesisResult:
    audio
    duration
    visemes = None
    word_timings = None
    phoneme_timings = None
```

This is a critical future-proofing requirement.

---

## 30. Dialect Library Integration Boundary

The MVP may use external speech providers.

However every speech provider must sit behind an adapter so later:

```text
External STT
    ↓ replace with
Dialect Library ASR
```

and:

```text
External TTS
    ↓ replace with
Dialect Library TTS
```

without rewriting the frontend or conversation engine.

Reserve metadata:

```json
{
  "language": "ig",
  "dialect": "nsukka",
  "dialectConfidence": 0.0
}
```

These may be null/unused initially.

---

## 31. Latency Budget

Do not optimize prematurely, but instrument from the start.

Capture:

```text
speech_end → final_transcript
final_transcript → first_LLM_token
first_LLM_token → first_TTS_audio
speech_end → first_assistant_audio
```

Also record:

```text
room connection time
avatar load time
TTS utterance duration
interruption response time
```

The most important perceived metric is:

```text
user stops speaking
        ↓
assistant starts responding
```

Log it in development.

---

## 32. Performance Rules for 3D

- only one avatar in the primary scene;
- head/shoulders rather than full environment;
- optimize texture resolution;
- compress GLB where practical;
- avoid excessive dynamic lights;
- avoid post-processing initially;
- lazy-load 3D bundle when appropriate;
- provide static/loading placeholder;
- pause expensive animation when hidden;
- test low/mid-range mobile hardware.

Avatar quality is less valuable than conversation responsiveness.

---

## 33. Browser Compatibility

Primary MVP support:

- latest Chrome desktop;
- latest Edge desktop;
- modern Android Chrome;
- modern iOS Safari.

Gracefully degrade if:

- WebGL unavailable;
- microphone permission denied;
- avatar fails to load.

The user should still be able to use text conversation when feasible.

---

## 34. Security Requirements

### LiveKit

- never expose LiveKit API secret in browser;
- mint short-lived access tokens server-side;
- constrain token permissions;
- isolate rooms/sessions.

### Providers

- never ship AI provider keys to client;
- server/agent-side only.

### Input

- validate text length;
- validate structured emotion output;
- reject unexpected avatar control payloads;
- rate limit token/session creation.

### Logs

Do not log raw secrets.

Conversation/audio retention must be explicit and configurable later.

For MVP, default to minimal retention required for debugging.

---

## 35. Privacy/Product Guardrail

Because Dialect Library ultimately works with voice data:

Do not silently treat ChatDialect conversations as training data.

Create a separate future consent mechanism for:

```text
conversation processing
vs.
training/data contribution
```

MVP architecture should keep these concepts separate.

---

## 36. Testing Strategy

### Unit

- avatar state reducer;
- emotion validation;
- viseme normalization;
- provider adapters;
- conversation state;
- event parsing.

### Frontend Component

- transcript;
- text composer;
- microphone state;
- avatar fallback.

### Agent

Mock:

- STT;
- LLM;
- TTS.

Verify:

```text
input transcript
→ generated response
→ emotion schema
→ speech request
```

### E2E

At minimum:

1. open `/demo`;
2. connect;
3. grant microphone;
4. submit voice turn;
5. see transcript;
6. hear answer;
7. avatar enters speaking;
8. submit text turn;
9. hear second response.

---

## 37. Development Diagnostics

Create development-only overlays showing:

```text
LiveKit: connected
Room: ...
Mic: active
User state: speaking/not speaking
Avatar: speaking
Emotion: happy 0.55
Current viseme: O 0.72
Audio level: 0.34
STT latency: ...
LLM first token: ...
TTS first audio: ...
Turn latency: ...
```

This will dramatically reduce debugging time.

Hide in production.

---

## 38. Environment Variables

Example only:

```env
# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# STT/TTS provider keys as selected
STT_API_KEY=
TTS_API_KEY=

# API
DATABASE_URL=
REDIS_URL=

# App
NEXT_PUBLIC_APP_URL=
```

Do not require every provider simultaneously.

---

## 39. Definition of Done — Fast MVP

ChatDialect Fast MVP is DONE when all are true:

- [ ] `/demo` loads.
- [ ] 3D head/shoulders avatar renders locally.
- [ ] Avatar naturally blinks while idle.
- [ ] User can enable microphone.
- [ ] User can speak to the agent.
- [ ] User speech is transcribed.
- [ ] Transcript appears in UI.
- [ ] LLM returns context-aware response.
- [ ] Assistant response is synthesized to speech.
- [ ] User hears the response.
- [ ] Avatar enters listening/thinking/speaking states correctly.
- [ ] Mouth/jaw visibly synchronize with assistant speech.
- [ ] At least neutral/happy/concerned/confused expressions work.
- [ ] User can type instead of speaking.
- [ ] Typed turns remain in the same conversation.
- [ ] User can interrupt/stop assistant where supported.
- [ ] Basic reconnect/error states exist.
- [ ] Mobile layout is usable.
- [ ] Provider secrets are server-side.
- [ ] Avatar protocol is provider-neutral.
- [ ] STT/LLM/TTS are adapter-based.
- [ ] Basic latency metrics are visible in development.
- [ ] README documents local setup.

---

## 40. Implementation Priority

Coding agents should execute in this exact order unless a blocking dependency requires otherwise:

```text
1. Repository/bootstrap
2. LiveKit connection
3. Voice AI vertical slice
4. Text transcript
5. Avatar renderer
6. Avatar state machine
7. Conversation-to-avatar state wiring
8. Audio-amplitude mouth sync
9. Viseme sync where available
10. Emotion metadata + expressions
11. Text composer
12. Error/reconnect handling
13. Mobile polish
14. Embeddable widget
15. Performance/security cleanup
```

Do not start with visual polish.

---

## 41. First Demonstration Target

The first internal demonstration should show only this:

```text
User:
"Hello, can you hear me?"

        ↓

Avatar:
listens

        ↓

UI:
shows transcript

        ↓

Avatar:
brief thinking state

        ↓

Assistant:
smiles lightly
mouth moves with voice

        ↓

Assistant says:
"Yes, I can hear you. How can I help you?"
```

Then demonstrate a typed message producing the same avatar/voice response.

If this works smoothly, the core ChatDialect concept has been proven.

---

## 42. Post-MVP Roadmap

After the Fast MVP is stable, develop in this order:

### Stage 1 — Dialect Productization

- language selector;
- dialect selector;
- language auto-detection;
- initial African-language testing;
- per-language voice selection;
- dialect metadata.

### Stage 2 — Better Speech Animation

- phoneme timings;
- dialect-specific viseme mapper;
- coarticulation;
- emotion-from-speech;
- richer facial gestures.

### Stage 3 — Dialect Library Models

- integrate Dialect Library ASR;
- benchmark external vs internal ASR;
- integrate MMS-TTS/custom TTS;
- collect consenting correction data;
- dialect quality scoring.

### Stage 4 — Customer Product

- organisations;
- agents;
- website knowledge;
- RAG;
- integrations;
- API tools/actions;
- analytics;
- widget configuration;
- billing.

### Stage 5 — Advanced Avatar

- multiple avatars;
- custom branding;
- avatar marketplace;
- optional photorealistic LiveHuman mode.

---

## 43. Architectural Principle

The MVP should preserve this separation:

```text
VOICE TRANSPORT
      │
      ▼
CONVERSATION ENGINE
      │
      ├── ASR adapter
      ├── LLM adapter
      └── TTS adapter
      │
      ▼
AVATAR PROTOCOL
      │
      ▼
3D AVATAR RENDERER
```

No layer should need to know implementation details of the layer two steps away.

This is what allows ChatDialect to move quickly now while later adopting proprietary Dialect Library ASR, TTS, emotion, phoneme, viseme and timing technology without rebuilding the product.

---

## 44. Agent Rule for Scope Decisions

When choosing between:

```text
A. a polished architecture that delays the working conversation
B. a simple modular implementation that proves the complete interaction
```

choose **B**.

The first milestone is not "build ChatDialect infrastructure."

The milestone is:

> **A real user speaks to a locally rendered expressive 3D face and the face speaks back.**

Everything in the MVP should serve that demonstration.
