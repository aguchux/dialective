# Dialect Library Community — MVP Implementation Plan

## 1. Purpose

This document defines the MVP implementation plan for the **Dialect Library Community**, a lightweight, mobile-first community forum where Dialect Library members can ask questions, share knowledge, discuss languages and dialects, learn from one another, and participate in topic-based discussions.

The community will be hosted at:

`https://community.dialectlibrary.com`

The community must use the **same Dialect Library account and SSO identity** as the existing Dialect Library platform.

The goal is to launch a simple, useful community product without overbuilding social-network features.

---

# 2. Product Goals

The MVP should allow a signed-in Dialect Library member to:

1. Enter the community without creating a second account.
2. Browse community discussions.
3. Search discussions, topics, tags, and people.
4. Explore community spaces.
5. Create a post.
6. Reply to posts.
7. Like/react to posts and replies.
8. Bookmark/save posts.
9. View notifications.
10. View and manage their own posts.
11. View and edit a community profile.
12. Report inappropriate content.
13. Allow moderators to review and act on reported content.
14. Use the product comfortably on both desktop and mobile.

The core product principle is:

> **Ask questions. Share knowledge. Learn together.**

---

# 3. Product Scope

## 3.1 Included in MVP

The MVP includes:

- shared SSO
- community home
- explore
- spaces
- tags
- post creation
- post detail/thread
- replies
- one-level reply nesting
- reactions/likes
- bookmarks
- notifications
- my posts
- profile
- basic profile editing
- search
- report content
- moderation queue
- admin/moderator controls
- announcements
- mobile-first responsive design
- desktop sidebar navigation
- pagination or cursor-based loading
- basic activity metrics

## 3.2 Explicitly Excluded from MVP

Do not build the following in the first release:

- direct messaging
- live chat
- user-created groups
- private chat rooms
- video calls
- live audio rooms
- follower feeds
- complex reputation systems
- leaderboards
- badges economy
- polls
- nested reply trees deeper than one level
- community monetization
- premium community subscriptions
- AI-generated replies
- AI moderation as a hard dependency
- private organization communities
- events management beyond announcement-style cards
- user-created spaces
- forum themes
- custom profile cover images
- external social login specific to Community
- separate passwords for Community

---

# 4. Domain and Identity

## 4.1 Community Host

Use:

`community.dialectlibrary.com`

## 4.2 Shared Identity

Users must authenticate through the main Dialect Library account.

Recommended architecture:

```text
dialectlibrary.com
        │
        ├── app.dialectlibrary.com
        ├── stream.dialectlibrary.com
        └── community.dialectlibrary.com
                 │
                 └── Shared Dialect Library Identity / SSO
```

## 4.3 SSO Behavior

Expected flow:

```text
User signs into Dialect Library
        ↓
Shared authenticated session created
        ↓
User visits community.dialectlibrary.com
        ↓
Community recognizes existing session
        ↓
CommunityProfile is created/synced on first visit
        ↓
User enters Community already authenticated
```

The Community must not create or store a separate password.

## 4.4 Session Domain

Where technically appropriate, configure authenticated session cookies for:

`.dialectlibrary.com`

All cookie settings must use secure, HTTP-only, same-site-safe configuration suitable for production.

---

# 5. Community Profile Model

The Community profile is separate from the master Dialect Library account but linked by `userId`.

Example:

```text
User
- id
- email
- name
- avatar
- account status
- platform roles

        ↓ 1:1

CommunityProfile
- userId
- displayName
- bio
- country
- languages
- dialects
- communityRole
- postCount
- replyCount
- bookmarkCount
- joinedAt
- updatedAt
```

Community data should never duplicate sensitive account data unnecessarily.

---

# 6. Community Roles

Keep the MVP role model simple.

## 6.1 Member

Default role.

Can:

- browse
- search
- create posts
- reply
- react
- bookmark
- report

## 6.2 Verified Trainer

Inherited or mapped from Dialect Library.

Shown with a badge where appropriate.

## 6.3 Subscriber

For Dialect Library Stream/Voice Data subscribers.

Can participate like members, with a visible subscriber badge.

## 6.4 Moderator

Can:

- hide posts
- delete posts
- lock discussions
- remove replies
- review reports
- suspend community access
- resolve moderation cases

## 6.5 Staff

Dialect Library staff account.

Can:

- post official announcements
- moderate
- manage spaces
- manage tags
- review community reports
- access admin tools

---

# 7. Community Information Architecture

Primary desktop navigation:

```text
Home
Explore
My Posts
Bookmarks
Profile
Notifications
```

Spaces appear in a secondary section:

```text
General
Languages & Dialects
Recording & Voice Quality
Validation / ISVP
Voice Data & Stream API
AI & Speech Research
Help & Support
Announcements
```

Mobile bottom navigation:

```text
Home
Explore
Post
Saved
Profile
```

Notifications remain available through the top bar bell icon.

---

# 8. Community Spaces

Spaces are admin-managed topic containers.

## 8.1 General

Open discussions related to Dialect Library and the community.

## 8.2 Languages & Dialects

Topics on:

- languages
- dialects
- subdialects
- translation
- pronunciation
- orthography
- cultural language usage

## 8.3 Recording & Voice Quality

Topics on:

- microphones
- mobile recording
- background noise
- recording environments
- clarity
- audio quality
- practical trainer advice

## 8.4 Validation / ISVP

Topics on:

- validation criteria
- ISVP
- ISVS
- ISVC
- scoring
- review practices
- quality consistency

## 8.5 Voice Data & Stream API

Topics on:

- Voice Data
- Stream Decks
- API usage
- integration
- data access
- subscriber workflows

## 8.6 AI & Speech Research

Topics on:

- ASR
- speech AI
- speech-language models
- low-resource language research
- model training
- dataset development

## 8.7 Help & Support

Community and platform help.

## 8.8 Announcements

Staff-controlled announcements.

Only staff may create announcement posts.

---

# 9. Tags

Tags supplement spaces and provide granular discovery.

Examples:

```text
#Igbo
#Yoruba
#Hausa
#Amharic
#Twi
#Nsukka
#Recording
#AudioQuality
#Validation
#ISVP
#ISVS
#ISVC
#VoiceData
#StreamAPI
#Pronunciation
#Translation
#LowResource
```

MVP rules:

- maximum 5 tags per post
- user types tag name
- existing tags autocomplete
- moderators/admins can merge or remove tags
- tags are searchable
- tags are clickable
- no nested tag hierarchy in MVP

---

# 10. UI / UX Design Direction

The Community UI must follow the established Dialect Library product language shown in the approved reference screens.

## 10.1 Visual Theme

Use:

- white primary surfaces
- very light lavender page background
- Dialect Library purple as primary accent
- soft purple selection states
- dark navy/black headings
- muted gray body text
- rounded cards
- thin light borders
- compact spacing
- clean iconography
- minimal decorative elements

## 10.2 Desktop Layout

Desktop screens use:

```text
┌────────────────┬─────────────────────────────────────┐
│ Left Sidebar   │ Main Content                        │
│                │                                     │
│ Logo           │ Top Search                         │
│ Home           │ Page Header                        │
│ Explore        │ Page Content                       │
│ My Posts       │                                     │
│ Bookmarks      │                                     │
│ Profile        │                                     │
│ Notifications  │                                     │
│                │                                     │
│ Spaces         │                                     │
└────────────────┴─────────────────────────────────────┘
```

Optional right-side panel is not required in MVP.

## 10.3 Mobile Layout

Mobile follows the existing Dialect Library mobile style:

- compact top bar
- logo left
- back button where relevant
- notification icon
- avatar
- page content full width
- bottom navigation fixed to product shell
- cards stacked vertically
- no desktop sidebar

---

# 11. Screen 1 — Community Home

Route:

`/`

or:

`/home`

## 11.1 Purpose

Show relevant discussions quickly.

## 11.2 Header

Show:

```text
Community
Ask questions. Share knowledge. Learn together.

[ + New Post ]
```

## 11.3 Feed Tabs

```text
For You
Latest
Unanswered
```

### For You

MVP implementation can initially be:

- posts from joined/relevant spaces
- popular recent posts
- posts matching user languages
- fallback to recent posts

No machine-learning feed is required.

### Latest

Chronological.

### Unanswered

Posts with zero replies.

## 11.4 Post Card

Each card shows:

- avatar/initial
- user name
- user role badge
- time
- space
- title
- short post excerpt
- tags
- likes
- replies
- view count
- bookmark action
- overflow menu

Example:

```text
Chinedu N.   Verified Trainer   18m
Languages & Dialects

How should we represent tones when documenting Nsukka pronunciation?

I'm comparing several recordings...

#Igbo #Nsukka #Pronunciation #Validation

♡ 24    💬 12    👁 342    ☆
```

---

# 12. Screen 2 — Explore

Route:

`/explore`

## 12.1 Purpose

Allow users to discover spaces and discussions.

## 12.2 Content

Show:

- page title
- short intro
- spaces grid
- popular tags
- trending discussions

## 12.3 Spaces Grid

Each card shows:

- icon
- space name
- short description
- post count

Optional member count can be added later.

## 12.4 Trending Discussions

MVP ranking can use:

```text
weighted score =
recent replies
+ likes
+ views
```

with recency decay.

No advanced recommendation engine required.

---

# 13. Screen 3 — Space Page

Route:

`/spaces/[slug]`

Examples:

`/spaces/languages`

`/spaces/recording`

## 13.1 Header

Show:

- space icon
- name
- description
- post count
- Join button where enabled
- common tags

## 13.2 Tabs

```text
Posts
About
Rules
```

## 13.3 Posts Tab

Displays space-specific feed.

## 13.4 About Tab

Contains:

- description
- purpose
- moderator list
- basic participation guidance

## 13.5 Rules Tab

Simple list of moderator-defined rules.

---

# 14. Screen 4 — Post Detail / Discussion Thread

Route:

`/post/[slug-or-id]`

## 14.1 Post Header

Show:

- back link
- title
- author
- role
- timestamp
- space
- full body
- tags
- likes
- replies
- share
- bookmark

## 14.2 Replies

Display replies chronologically or latest-first.

Each reply shows:

- avatar
- name
- role
- time
- body
- like
- reply action
- overflow menu

## 14.3 Reply Nesting

MVP supports only one reply level.

Example:

```text
Post
 ├── Reply
 │    └── Reply-to-reply
 ├── Reply
 └── Reply
```

Do not support deeper nesting.

## 14.4 Reply Composer

At bottom:

```text
[ Write a reply... ] [ Reply ]
```

Optional file attachment may be added later to replies.

---

# 15. Screen 5 — Create Post

Route:

`/new`

## 15.1 Fields

Required:

- title
- space
- post body

Optional:

- tags
- image
- audio
- document

## 15.2 Form

```text
Title *

Space *

Tags

Post Details *

Attachments
[ Image ] [ Audio ] [ Document ]

[ Cancel ] [ Publish ]
```

## 15.3 Content Rules

- title max 160 characters
- body max 5,000 characters for MVP
- max 5 tags
- max 5 attachments
- max file size configurable
- only approved MIME types

## 15.4 Supported Attachment Types

MVP:

- images
- audio
- PDF/documents

Audio is especially important for voice and dialect discussion.

---

# 16. Screen 6 — My Posts

Route:

`/me/posts`

## 16.1 Purpose

User manages own contributions.

## 16.2 Tabs

```text
Published
Drafts
```

MVP may optionally defer draft autosave, but manual draft saving is recommended.

## 16.3 Each Item Shows

- title
- status
- space
- time
- reply count
- like count
- overflow menu

Menu:

- edit
- delete
- view
- copy link

---

# 17. Screen 7 — Bookmarks

Route:

`/saved`

## 17.1 Purpose

Show saved community content.

## 17.2 Tabs

MVP:

```text
All
Posts
```

Guides can be added later if guides become a separate content type.

## 17.3 Bookmark Behavior

Bookmark button toggles immediately.

Bookmarks are private to the user.

---

# 18. Screen 8 — Notifications

Route:

`/notifications`

## 18.1 Notification Types

MVP supports:

- reply to your post
- reply to your comment
- mention
- announcement
- moderation action
- post approval/rejection if moderation workflow is enabled

## 18.2 Tabs

```text
All
Replies
Mentions
Announcements
```

## 18.3 Actions

- mark notification read
- mark all as read
- click notification to navigate to target

---

# 19. Screen 9 — Profile

Route:

`/profile`

or:

`/u/[username]`

## 19.1 Profile Header

Show:

- avatar
- display name
- role badge
- bio
- country
- languages
- joined date

## 19.2 Statistics

```text
Posts
Replies
Bookmarks
```

Following count should be omitted in MVP unless follower functionality is implemented.

## 19.3 Tabs

```text
Posts
Replies
```

## 19.4 Edit Profile

Users can edit:

- display name
- bio
- country
- languages
- dialects

Master account email/password must remain managed in the main Dialect Library account system.

---

# 20. Screen 10 — Community Settings

Route:

`/settings`

Keep settings minimal.

## 20.1 Profile Preferences

- edit public community profile
- display name
- bio
- language list

## 20.2 Notification Preferences

Toggle:

- replies
- mentions
- announcements/community updates

## 20.3 Language Preferences

- default display language
- translation suggestion preference

## 20.4 Privacy

- profile visibility
- data/privacy link

## 20.5 Help

- community guidelines
- help center
- contact support

Do not duplicate full Dialect Library account/security management.

---

# 21. Search

Search input appears in desktop top header.

Mobile search may be available from Explore.

## 21.1 Search Targets

Search:

- post titles
- post content
- tags
- spaces
- community profiles

## 21.2 MVP Search Implementation

Start with PostgreSQL:

- `ILIKE`
- trigram indexes
- PostgreSQL full-text search

Dedicated search infrastructure is not required for MVP.

---

# 22. Reactions

MVP supports a single reaction:

```text
Like
```

or heart/upvote equivalent.

Do not build multiple emoji reactions initially.

Store unique reaction per:

```text
userId + postId
```

and separately for replies.

---

# 23. Bookmarks

Users can privately bookmark posts.

Data model:

```text
Bookmark
- id
- userId
- postId
- createdAt
```

Unique constraint:

```text
userId + postId
```

---

# 24. Reporting and Moderation

## 24.1 User Report Flow

Any member can report:

- post
- reply
- profile

Reasons:

- spam
- abuse/harassment
- misinformation
- off-topic
- inappropriate content
- impersonation
- copyright/IP concern
- other

## 24.2 Moderator Queue

Admin route:

`/admin/community/moderation`

Queue states:

```text
OPEN
IN_REVIEW
RESOLVED
DISMISSED
```

## 24.3 Moderator Actions

Moderators can:

- hide post
- restore post
- delete post
- lock thread
- delete reply
- warn user
- suspend community participation
- resolve report

## 24.4 Audit

Every moderator action must be logged.

---

# 25. Community Announcements

Staff can create official posts in `Announcements`.

Announcement fields:

- title
- body
- optional attachment
- publishedAt
- pinned
- expiresAt optional

Announcement posts may trigger notifications.

---

# 26. Pinned Posts

MVP supports pinned posts per space.

Use cases:

- guidelines
- community rules
- important instructions
- staff updates

Only moderators/staff can pin.

---

# 27. Joined Spaces

MVP can support simple space membership.

Data model:

```text
SpaceMembership
- userId
- spaceId
- joinedAt
```

Benefits:

- personalize For You
- mark joined spaces
- future notifications

Joining a space should not create complex permissions in MVP.

All standard spaces remain readable to authenticated community members.

---

# 28. Privacy and Visibility

MVP community is authenticated-member-only by default.

Recommended visibility:

```text
Not signed in:
Community landing / redirect to login

Signed in:
Read posts
Create posts
Reply
React
Bookmark
```

Public indexing can be considered later.

---

# 29. Suggested Routes

```text
/
 /explore
 /spaces/[slug]
 /post/[id-or-slug]
 /new
 /me/posts
 /saved
 /notifications
 /profile
 /u/[username]
 /settings

/admin/community
/admin/community/posts
/admin/community/reports
/admin/community/spaces
/admin/community/tags
/admin/community/users
```

---

# 30. Suggested Database Schema

## CommunityProfile

```text
id
userId
displayName
bio
country
languages[]
dialects[]
role
status
createdAt
updatedAt
```

## Space

```text
id
name
slug
description
icon
status
sortOrder
createdAt
updatedAt
```

## SpaceMembership

```text
id
spaceId
userId
createdAt
```

## Post

```text
id
authorId
spaceId
title
slug
body
status
isPinned
isLocked
viewCount
replyCount
likeCount
createdAt
updatedAt
deletedAt
```

## Reply

```text
id
postId
authorId
parentReplyId nullable
body
status
likeCount
createdAt
updatedAt
deletedAt
```

## Tag

```text
id
name
slug
createdAt
```

## PostTag

```text
postId
tagId
```

## Reaction

```text
id
userId
postId nullable
replyId nullable
type
createdAt
```

## Bookmark

```text
id
userId
postId
createdAt
```

## Attachment

```text
id
postId nullable
replyId nullable
type
storageKey
mimeType
size
originalName
createdAt
```

## Notification

```text
id
userId
type
actorId nullable
postId nullable
replyId nullable
title
message
readAt nullable
createdAt
```

## Report

```text
id
reporterId
targetType
targetId
reason
notes
status
assignedModeratorId nullable
createdAt
resolvedAt nullable
```

## ModeratorAction

```text
id
moderatorId
targetType
targetId
action
reason
metadata
createdAt
```

---

# 31. API Design

Recommended namespace:

`/api/community/v1`

## 31.1 Posts

```http
GET    /posts
POST   /posts
GET    /posts/:id
PATCH  /posts/:id
DELETE /posts/:id
```

## 31.2 Replies

```http
GET    /posts/:id/replies
POST   /posts/:id/replies
PATCH  /replies/:id
DELETE /replies/:id
```

## 31.3 Reactions

```http
POST   /posts/:id/like
DELETE /posts/:id/like

POST   /replies/:id/like
DELETE /replies/:id/like
```

## 31.4 Bookmarks

```http
POST   /posts/:id/bookmark
DELETE /posts/:id/bookmark
GET    /me/bookmarks
```

## 31.5 Spaces

```http
GET  /spaces
GET  /spaces/:slug
POST /spaces/:id/join
DELETE /spaces/:id/join
```

## 31.6 Search

```http
GET /search?q=...
```

## 31.7 Notifications

```http
GET   /notifications
PATCH /notifications/:id/read
POST  /notifications/read-all
```

## 31.8 Profile

```http
GET   /me/profile
PATCH /me/profile
GET   /users/:id/profile
```

## 31.9 Reports

```http
POST /reports
```

---

# 32. Backend Architecture

Recommended stack aligned with Dialect Library:

```text
Frontend:
Next.js
TypeScript
Tailwind CSS
RTK Query

Backend:
NestJS
TypeScript

Database:
PostgreSQL
Prisma

Cache:
Redis

Background Jobs:
RabbitMQ

Storage:
DigitalOcean Spaces / S3-compatible object storage

Authentication:
Shared Dialect Library Auth.js / NextAuth SSO
```

---

# 33. Frontend State

Use RTK Query for:

- posts
- replies
- spaces
- bookmarks
- profile
- notifications
- search
- moderation

Use optimistic updates for:

- likes
- bookmarks
- join/leave space
- mark notification read

---

# 34. File Uploads

Uploads must:

- use private object storage
- validate MIME type
- validate file extension
- enforce size limits
- sanitize filename
- use generated object keys
- not expose internal storage paths

Recommended MVP limits:

```text
Images: 10 MB
Audio: 25 MB
Documents: 10 MB
Files per post: 5
```

Final limits should be configurable.

---

# 35. Notifications Delivery

MVP primary notification channels:

1. in-app
2. optional email

In-app is required.

Email can be limited to:

- replies
- mentions
- announcements

No SMS or push notification requirement for MVP.

---

# 36. Activity and Counts

Maintain counters for:

- posts
- replies
- likes
- views
- bookmarks

Use background aggregation later if scale grows.

For MVP, transactional updates are acceptable.

---

# 37. Pagination

Use cursor pagination where possible.

Example:

```http
GET /posts?cursor=abc123&limit=20
```

Recommended default:

`20 items`

Avoid infinite loading without clear loading state.

---

# 38. Empty States

Every screen must have a useful empty state.

Examples:

### My Posts

```text
You haven't posted yet.

[ Create your first post ]
```

### Bookmarks

```text
No saved discussions yet.

Explore the community and bookmark useful posts.
```

### Notifications

```text
You're all caught up.
```

### Search

```text
No discussions matched your search.
```

---

# 39. Error States

Support:

- network error
- permission denied
- deleted post
- locked thread
- upload failed
- expired session
- SSO unavailable
- rate limited

All errors must show a human-readable recovery action.

---

# 40. Rate Limiting

Basic abuse prevention:

```text
Posts:
10 per hour per user

Replies:
60 per hour per user

Likes:
reasonable burst limits

Search:
rate limited

Reports:
10 per hour
```

Limits should be configurable.

---

# 41. Security

Required MVP security controls:

- SSO session validation
- CSRF protection where applicable
- server-side authorization
- rate limits
- content ownership checks
- object-level permission checks
- file upload validation
- XSS sanitization
- HTML sanitization
- SQL injection protection through ORM/query safety
- audit logging for moderator actions
- secure cookies
- secure headers
- spam detection hooks
- API authorization tests

---

# 42. Content Sanitization

Post body may support basic Markdown or safe rich text.

Allowed formatting:

- bold
- italic
- links
- lists
- quotes
- code snippets

Do not allow arbitrary HTML.

Use strict sanitization before rendering.

---

# 43. Accessibility

The UI should support:

- keyboard navigation
- visible focus states
- semantic headings
- labels for form controls
- 44px minimum mobile touch targets
- adequate contrast
- aria-labels for icon-only buttons
- screen-reader friendly form validation
- non-color status indicators

---

# 44. Responsive Breakpoints

Recommended:

```text
Mobile:
< 768px

Tablet:
768px–1023px

Desktop:
>= 1024px
```

## Mobile

- bottom navigation
- no sidebar
- single-column cards
- full-width create-post form
- compact header

## Desktop

- persistent sidebar
- top search
- wider content
- no bottom navigation

---

# 45. Admin Community Controls

Admin/community moderator dashboard should support:

```text
Overview
Posts
Reports
Spaces
Tags
Users
Announcements
Moderation Log
```

MVP does not require advanced analytics.

---

# 46. Admin — Spaces

Admin can:

- create space
- edit space
- archive space
- reorder
- assign moderator
- edit rules
- pin posts

Users cannot create spaces in MVP.

---

# 47. Admin — Tags

Admin can:

- create tag
- rename tag
- merge tags
- hide tag
- delete unused tag

---

# 48. Admin — Users

Moderators can:

- search member
- view community activity
- warn
- suspend community access
- restore access

Community suspension must not automatically suspend the user's entire Dialect Library account.

---

# 49. Community Status Model

Recommended post statuses:

```text
DRAFT
PUBLISHED
HIDDEN
DELETED
```

Reply statuses:

```text
PUBLISHED
HIDDEN
DELETED
```

User community status:

```text
ACTIVE
SUSPENDED
BANNED
```

---

# 50. MVP Analytics

Track only essential metrics:

- daily active community users
- posts created
- replies created
- average replies per post
- unanswered post count
- active spaces
- bookmarks
- search usage
- moderation reports
- returning users

Analytics should not block launch.

---

# 51. MVP Delivery Phases

## Phase 1 — Foundation

Build:

- subdomain app
- SSO
- CommunityProfile sync
- responsive shell
- desktop sidebar
- mobile bottom nav
- space seed data
- basic user roles

Exit criteria:

- signed-in Dialect Library user opens Community without separate login

---

## Phase 2 — Core Discussion

Build:

- Home
- posts
- replies
- post detail
- create post
- tags
- likes
- view counts
- space pages

Exit criteria:

- member can create a discussion and receive replies

---

## Phase 3 — Discovery and Personalization

Build:

- Explore
- search
- Latest
- Unanswered
- For You basic feed
- joined spaces
- popular tags
- trending discussions

Exit criteria:

- users can discover useful content easily

---

## Phase 4 — Personal Area

Build:

- My Posts
- Bookmarks
- Profile
- edit profile
- Notifications
- notification preferences

Exit criteria:

- users can manage their own activity and saved content

---

## Phase 5 — Moderation

Build:

- reporting
- moderation queue
- moderator actions
- suspension
- pinned posts
- announcements
- moderation audit logs

Exit criteria:

- staff can safely operate the community

---

## Phase 6 — Launch Hardening

Complete:

- responsive QA
- accessibility checks
- security tests
- rate limits
- file upload validation
- error states
- empty states
- performance review
- analytics
- production monitoring

---

# 52. MVP Acceptance Criteria

The Community MVP is ready for launch when:

1. Existing Dialect Library users can enter through SSO.
2. No separate Community account is required.
3. Home works on desktop and mobile.
4. Users can explore spaces.
5. Users can create posts.
6. Users can reply.
7. Users can like.
8. Users can bookmark.
9. Users can search.
10. Users can view My Posts.
11. Users can view Notifications.
12. Users can view/edit a Community profile.
13. Users can report content.
14. Moderators can act on reports.
15. Staff can post announcements.
16. All primary flows work on mobile.
17. File uploads are secure.
18. Authorization prevents editing another user's content.
19. Community suspension is separate from master account suspension.
20. Production monitoring is enabled.

---

# 53. Recommended Initial Seed Spaces

Create these automatically:

```text
general
languages-dialects
recording-voice-quality
validation-isvp
voice-data-stream-api
ai-speech-research
help-support
announcements
```

---

# 54. Recommended Initial Seed Tags

```text
Igbo
Yoruba
Hausa
Amharic
Twi
Recording
AudioQuality
Pronunciation
Translation
Validation
ISVP
ISVS
ISVC
VoiceData
StreamAPI
SpeechAI
LowResource
GettingStarted
```

---

# 55. Recommended Product Copy

## Community Header

> **Community**  
> Ask questions. Share knowledge. Learn together.

## Explore

> **Explore**  
> Discover topics, spaces and popular discussions.

## New Post

> **Create Post**  
> Ask a question, share an idea, or start a discussion.

## My Posts

> **My Posts**  
> Manage your community contributions.

## Bookmarks

> **Bookmarks**  
> Your saved discussions.

## Notifications

> **Notifications**  
> Stay updated with the latest activity in the community.

## Profile

> **Profile**  
> Your activity, contributions and language journey.

---

# 56. Long-Term Extensions After MVP

Possible future features:

- direct messages
- private organization spaces
- subscriber-only spaces
- live Q&A
- events
- polls
- verified linguist role
- advanced contributor reputation
- translation helpers
- AI-assisted search
- AI summaries
- recommended discussions
- community API
- mobile app notifications
- native mobile app
- multilingual UI
- topic subscriptions
- digest emails
- accepted answers
- expert verification
- community knowledge base

These should only be added after observing real user behavior.

---

# 57. Final MVP Principle

The Community should remain focused on one simple workflow:

```text
Open Community
      ↓
Discover a discussion
      ↓
Read
      ↓
Ask or Reply
      ↓
Save useful content
      ↓
Return through notifications
```

The MVP should prioritize:

- simplicity
- mobile usability
- familiar Dialect Library styling
- SSO convenience
- useful discussion
- safe moderation

over social-network complexity.

The first release should feel like a natural extension of the existing Dialect Library product, not a separate platform.
