# Licensing model

Home System uses the [Functional Source License 1.1](../LICENSE) (FSL-1.1-ALv2).
It is **source-available** / [Fair Source](https://fair.io/) — not OSI “open
source,” because commercial hosting competitors are restricted.

## What you can do without asking

| Use | Allowed under FSL? |
| --- | --- |
| Run a copy for your own household or team (self-host) | Yes |
| Modify the code for your own deployment | Yes |
| Use it inside a company for internal operations (not sold as a product to others) | Yes |
| Study, contribute, redistribute under FSL terms | Yes |
| Education and non-commercial research | Yes |

Self-hosting for any number of users **you** serve (family, company intranet, etc.)
is a Permitted Purpose.

## What needs a separate commercial agreement

| Use | Under FSL alone? |
| --- | --- |
| Sell or operate a **hosted** Home System–style service for customers | No — that is a Competing Use |
| Ship a **commercial product** that substitutes for Home System or Patric’s hosted offering | No |
| Offer substantially the same functionality as a paid SaaS to the public | No |

For those cases, contact [patricphinehas@gmail.com](mailto:patricphinehas@gmail.com)
for a **commercial license** (terms and pricing are separate from this repo).

The planned **official hosted** product from the maintainer is the primary
commercial offering; FSL is meant to keep that sustainable while the code stays
readable and forkable for self-hosters.

## What happens over time

Each **version** you receive under FSL automatically becomes
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) **two years** after
that version is published (release, tag, or commit on `main`). Older versions
age into Apache on their own schedule; the newest release is always under FSL
until its two-year window passes.

## Why not MIT?

MIT (and similar permissive licenses) allow anyone to run a competing hosted
service with no payment to the author. FSL matches “free to self-host, commercial
hosting is the maintainer’s business (or a licensed one).”

## Alternatives (for context)

| License style | Self-host free | Blocks competing SaaS |
| --- | --- | --- |
| **FSL-1.1-ALv2** (this project) | Yes | Yes, until version ages to Apache |
| MIT / Apache 2.0 | Yes | No |
| AGPL | Yes | No (only requires sharing source if you modify and serve) |
| Dual license (FSL + paid commercial) | Yes | Yes, with explicit contracts for licensees |

This repository is **FSL + optional commercial license** for Competing Uses;
there is no separate “enterprise edition” of the code in another repo.
