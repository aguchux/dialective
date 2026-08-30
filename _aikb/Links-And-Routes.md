# Dialect Library Link and Route Registry

This registry is the approved link inventory for the assistant. Only suggest a link that appears here or in the runtime content registry appended by the assistant service. Do not invent paths or query parameters.

## Public routes

| Purpose                    | Route                              | Access                                    |
| -------------------------- | ---------------------------------- | ----------------------------------------- |
| Home                       | `/`                                | Public                                    |
| About Dialect Library      | `/about`                           | Public                                    |
| Frequently asked questions | `/faq`                             | Public                                    |
| Blog index                 | `/blog`                            | Public                                    |
| Blog article               | `/blog/{published-blog-slug}`      | Public, published posts only              |
| Trainer testimonials       | `/testimonials`                    | Public, approved and visible testimonials |
| Learning Center            | `/learn`                           | Public                                    |
| Public course              | `/learn/{public-course-slug}`      | Public course only                        |
| Public course reader       | `/learn/{public-course-slug}/view` | Public course only                        |
| Data-access request        | `/data-access`                     | Public                                    |
| Terms of Use               | `/terms`                           | Public                                    |
| Privacy Policy             | `/privacy`                         | Public                                    |
| Cookie Policy              | `/cookies`                         | Public                                    |
| Create an account          | `/register`                        | Public                                    |
| Log in                     | `/login`                           | Public                                    |
| Request password reset     | `/forgot-password`                 | Public                                    |
| Reset password             | `/reset-password`                  | Token link from email                     |
| Verify email               | `/verify-email`                    | Token link from email                     |
| Magic-link sign-in         | `/magic-link`                      | Token link from email                     |

## Official external channels

| Purpose                         | Link                                      | Notes                                                                           |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Dialect Library YouTube channel | `https://www.youtube.com/@DialectLibrary` | Published platform videos and trainer guidance                                  |
| WhatsApp support                | `https://wa.me/447424448030`              | Account-specific support; never send passwords, OTPs, or payment credentials    |
| Email support                   | `mailto:hello@dialectlibrary.com`         | Account-specific support; never include passwords, OTPs, or payment credentials |
| Frequently asked questions      | `https://www.dialectlibrary.com/faq`      | Primary self-service detail for common trainer questions                        |

## Trainer routes

| Purpose                                                          | Route                                      | Access                             |
| ---------------------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| Trainer dashboard                                                | `/dashboard`                               | Signed-in trainer                  |
| Tokens and wallet activity                                       | `/dashboard?view=tokens`                   | Signed-in trainer                  |
| Earnings history                                                 | `/dashboard?view=earnings`                 | Signed-in trainer                  |
| Training and submitted tasks                                     | `/dashboard?view=training`                 | Signed-in trainer                  |
| P2P token market                                                 | `/dashboard?view=market`                   | Signed-in trainer; may be disabled |
| My Scores                                                        | `/dashboard?view=scores`                   | Signed-in trainer                  |
| Profile, country, dialect, phone, payment methods, notifications | `/dashboard?view=profile`                  | Signed-in trainer                  |
| Referrals (code, invite link, invitations, bonus rates)          | `/dashboard?view=referrals`                | Signed-in trainer                  |
| Campaigns (ad share links and performance)                       | `/dashboard?view=campaigns`                | Signed-in trainer                  |
| Testimonials                                                     | `/dashboard?view=testimonials`             | Signed-in trainer; may be disabled |
| Payout accounts                                                  | `/dashboard/payout-accounts`               | Signed-in trainer                  |
| Signed-in course study                                           | `/dashboard/learn/{published-course-slug}` | Signed-in trainer                  |
| Notifications                                                    | `/notifications`                           | Signed-in user                     |
| Onboarding                                                       | `/onboarding`                              | Signed-in user when required       |

## Distributor routes

| Purpose                | Route                                | Access                                 |
| ---------------------- | ------------------------------------ | -------------------------------------- |
| Distributor dashboard  | `/distributor`                       | Signed-in distributor                  |
| Distributor network    | `/distributor/network`               | Signed-in distributor                  |
| Sub-distributors       | `/distributor/sub-distributors`      | Signed-in distributor                  |
| Sub-distributor detail | `/distributor/sub-distributors/{id}` | Signed-in distributor                  |
| Distributor tokens     | `/distributor/tokens`                | Signed-in distributor                  |
| Distributor market     | `/distributor/market`                | Signed-in distributor; may be disabled |
| Distributor profile    | `/distributor/profile`               | Signed-in distributor                  |

## Administrative routes

Administrative routes are role-restricted. The assistant may identify the relevant area to an authenticated administrator but must not provide administrative actions, user data, payment decisions, API credentials, or security instructions.

| Purpose                             | Route                        |
| ----------------------------------- | ---------------------------- |
| Admin dashboard                     | `/admin`                     |
| Users                               | `/admin/users`               |
| Coverage                            | `/admin/geo`                 |
| Words and prompts                   | `/admin/words`               |
| Recordings                          | `/admin/recordings`          |
| Testimonials review                 | `/admin/testimonials`        |
| Marketing (ad photos and headlines) | `/admin/marketing`           |
| Audit queue                         | `/admin/audit-hold`          |
| Phone verification requests         | `/admin/phone-verifications` |
| Leaderboard                         | `/admin/leaderboard`         |
| Referrals                           | `/admin/referrals`           |
| P2P market administration           | `/admin/p2p`                 |
| Withdrawals                         | `/admin/withdrawals`         |
| Tokenomics                          | `/admin/tokenomics`          |
| Reward pool                         | `/admin/pools`               |
| Blog management                     | `/admin/blog`                |
| Course management                   | `/admin/courses`             |
| Updates                             | `/admin/updates`             |
| Platform settings                   | `/admin/settings`            |

## Runtime content registry

The assistant service appends current published blog posts and courses below this document at request time. Entries include title, short summary, audience, and their approved link. Drafts, private content, account data, and admin-only records are excluded.
